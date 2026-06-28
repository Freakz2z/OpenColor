//! Screen-pick state machine + capture loop.
//!
//! Public commands:
//! - `start_picking` — spawns the capture loop and registers a global mouse
//!   click hook. Each captured pixel is emitted as `picker://pixel` to the
//!   main window, which renders a small floating color card.
//! - `stop_picking`  — cancels the active session and removes the hook.
//! - `capture_pixel` — synchronous single-pixel read; kept for one-shot use
//!   without the live preview.
//!
//! Click anywhere on the screen to commit the pick; Esc to cancel. A small
//! transparent picker webview follows the cursor while the main window is
//! hidden; all lifecycle and recovery work remains owned by this module.

use crate::AppState;
use rdev::{Button, Event, EventType, Key};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime, State, Wry};
use tokio_util::sync::CancellationToken;

pub const CAPTURE_INTERVAL_MS: u64 = 33; // ~30Hz preview without saturating screen capture
const CLICK_HOOK_POLL_MS: u64 = 50;
const CLICK_ARM_DELAY_MS: u64 = 250;

/// Width / height of the picker webview (matches tauri.conf.json). Used by
/// the on-screen clamp so the card never escapes the visible region.
const PICKER_W: i32 = 220;
const PICKER_H: i32 = 96;

/// What we care about from the global mouse/keyboard tap. Other rdev event
/// variants are dropped at the source.
#[derive(Debug)]
pub enum TapEvent {
    LeftClick,
    Escape,
}

/// Process-wide queue that the rdev tap thread pushes events into. Each
/// pick session's dispatch loop drains events from this queue. Using a single
/// Mutex<Vec<...>> keeps the tap thread cheap and avoids the rdev multi-tap
/// problem (we only call `rdev::listen` once per process — its internal
/// `CFRunLoopRun()` is uncancellable, so spawning it twice leaks threads).
static TAP_QUEUE: OnceLock<Mutex<Vec<TapEvent>>> = OnceLock::new();
static TAP_STATE: AtomicU8 = AtomicU8::new(TAP_NOT_STARTED);
const TAP_NOT_STARTED: u8 = 0;
const TAP_STARTING: u8 = 1;
const TAP_RUNNING: u8 = 2;
const TAP_FAILED: u8 = 3;

/// Caches the picker's last screen position so the capture loop can skip
/// `set_position()` when the cursor hasn't moved enough to matter. Every
/// `set_position` call goes through Tauri's IPC layer, then the platform
/// window manager (`setWindowPos` / `[NSWindow setFrameOrigin]` /
/// `gdk_window_move`); doing that 30 times a second is the main source
/// of the perceived lag while moving the picker across the screen.
static LAST_PICKER_POS: OnceLock<Mutex<Option<(i32, i32)>>> = OnceLock::new();
fn last_picker_pos() -> &'static Mutex<Option<(i32, i32)>> {
    LAST_PICKER_POS.get_or_init(|| Mutex::new(None))
}

/// Caches the last emitted RGB so we don't re-emit `picker://pixel` for a
/// pixel the picker card is already showing. At 30 Hz, the cursor is often
/// still for several consecutive ticks — without this, every tick triggers
/// a JS `textContent` write and a swatch background repaint in the picker
/// webview, which competes with the window move for the main thread.
static LAST_PICKER_RGB: OnceLock<Mutex<Option<[u8; 3]>>> = OnceLock::new();
fn last_picker_rgb() -> &'static Mutex<Option<[u8; 3]>> {
    LAST_PICKER_RGB.get_or_init(|| Mutex::new(None))
}

pub struct PickerSession {
    token: Option<CancellationToken>,
    session_id: u64,
    /// Guards attached per-session so we can unlisten them on cancel.
    cancel_listeners: Vec<tauri::EventId>,
    /// AppHandle kept for defensive window restore on cancel.
    app: Option<AppHandle<Wry>>,
}

impl Default for PickerSession {
    fn default() -> Self {
        Self::idle()
    }
}

impl PickerSession {
    pub fn idle() -> Self {
        Self {
            token: None,
            session_id: 0,
            cancel_listeners: Vec::new(),
            app: None,
        }
    }
    pub fn is_active(&self) -> bool {
        self.token.is_some()
    }
    pub fn start(&mut self, app: AppHandle<Wry>) -> Result<(u64, CancellationToken), String> {
        if self.is_active() {
            return Err("A picker session is already active".into());
        }
        self.session_id = self.session_id.wrapping_add(1).max(1);
        self.app = Some(app);
        let t = CancellationToken::new();
        self.token = Some(t.clone());
        // Drain anything left over from previous sessions so the new dispatch
        // loop starts with an empty queue (avoids stale clicks from a prior
        // session firing right after this one starts).
        if let Some(q) = TAP_QUEUE.get() {
            if let Ok(mut g) = q.lock() {
                g.clear();
            }
        }
        Ok((self.session_id, t))
    }
    pub fn track_listener(&mut self, session_id: u64, id: tauri::EventId) -> bool {
        if self.session_id != session_id || self.token.is_none() {
            return false;
        }
        self.cancel_listeners.push(id);
        true
    }
    fn take(&mut self, expected_session_id: Option<u64>) -> Option<SessionCleanup> {
        if let Some(expected) = expected_session_id {
            if self.session_id != expected || self.token.is_none() {
                return None;
            }
        }
        let token = self.token.take()?;
        Some(SessionCleanup {
            token,
            listeners: std::mem::take(&mut self.cancel_listeners),
            app: self.app.take(),
        })
    }
}

struct SessionCleanup {
    token: CancellationToken,
    listeners: Vec<tauri::EventId>,
    app: Option<AppHandle<Wry>>,
}

#[derive(Serialize, Clone)]
pub struct PixelPayload {
    pub hex: String,
    pub rgb: [u8; 3],
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
pub async fn start_picking(app: AppHandle<Wry>, state: State<'_, AppState>) -> Result<(), String> {
    let permission = *state.permission.lock();
    log::info!("[picker] start_picking called, permission={permission:?}");
    match permission {
        crate::platform::PermissionState::Ok => {}
        crate::platform::PermissionState::Denied => {
            log::warn!("[picker] start_picking blocked: permission denied");
            return Err("Screen capture permission is denied or unavailable. Check the platform permission banner for details.".into());
        }
        crate::platform::PermissionState::Unsupported => {
            log::warn!("[picker] start_picking blocked: platform unsupported");
            return Err(
                "Screen picking is not supported on this display server or platform.".into(),
            );
        }
    }
    // Check the process-wide input hook before hiding anything. If the hook
    // cannot start, the command fails with the main window still visible.
    if let Err(e) = ensure_tap_running() {
        log::error!("[picker] failed to start global tap: {e}");
        return Err(format!("Failed to start global mouse hook: {e}"));
    }

    let (session_id, token) = state.picker.lock().start(app.clone())?;
    log::info!("[picker] session {session_id} created");

    // Listen for Esc pressed inside the picker window. rdev's global key
    // hook is unreliable on macOS because the OS short-circuits Esc before
    // our tap sees it; the picker webview gets Esc reliably. We track the
    // EventId so cancel() can unlisten it (otherwise each pick session
    // accumulates another listener that fires forever).
    {
        let app_for_listen = app.clone();
        let id = app.listen("picker://cancel", move |_event| {
            log::info!("[picker] picker://cancel for session {session_id}");
            finish_session(&app_for_listen, session_id, PickOutcome::Cancelled);
        });
        if !state.picker.lock().track_listener(session_id, id) {
            app.unlisten(id);
            return Err("Picker session ended while it was starting".into());
        }
    }

    if let Err(e) = set_picker_mode(app.clone(), true) {
        finish_session(&app, session_id, PickOutcome::Silent);
        return Err(e);
    }

    spawn_capture_loop(app.clone(), token.clone());
    spawn_click_dispatch(app, token, session_id);
    Ok(())
}

#[tauri::command]
pub fn stop_picking(app: AppHandle<Wry>) {
    log::info!("[picker] stop_picking called");
    finish_current_session(&app, PickOutcome::Cancelled);
}

enum PickOutcome {
    Picked(PixelPayload),
    Cancelled,
    Silent,
}

fn finish_current_session(app: &AppHandle<Wry>, outcome: PickOutcome) {
    let session_id = {
        let state = app.state::<AppState>();
        let session = state.picker.lock();
        session.token.as_ref().map(|_| session.session_id)
    };
    if let Some(session_id) = session_id {
        finish_session(app, session_id, outcome);
    } else if let Err(e) = set_picker_mode(app.clone(), false) {
        log::error!("[picker] restoring idle picker mode failed: {e}");
    }
}

fn finish_session(app: &AppHandle<Wry>, session_id: u64, outcome: PickOutcome) {
    let cleanup = app.state::<AppState>().picker.lock().take(Some(session_id));
    let Some(cleanup) = cleanup else {
        return;
    };

    // Reset the debounce caches so the next picking session doesn't think
    // its first move / first pixel is identical to the last one we already
    // emitted in the previous session.
    if let Ok(mut g) = last_picker_pos().lock() {
        *g = None;
    }
    if let Ok(mut g) = last_picker_rgb().lock() {
        *g = None;
    }

    cleanup.token.cancel();
    if let Some(session_app) = cleanup.app {
        for id in cleanup.listeners {
            session_app.unlisten(id);
        }
    }

    if let Err(e) = set_picker_mode(app.clone(), false) {
        log::error!("[picker] failed to restore windows for session {session_id}: {e}");
        restore_main_geometry(app);
    }

    match outcome {
        PickOutcome::Picked(payload) => {
            let _ = app.emit("picker://picked", payload);
        }
        PickOutcome::Cancelled => {
            let _ = app.emit("picker://cancelled", ());
        }
        PickOutcome::Silent => {}
    }
}

/// Toggle picker overlay mode:
/// - enabled=true: hide main window, show dedicated transparent picker
///   window (220x96), wire it to follow the cursor.
/// - enabled=false: hide picker window, show main window again.
///
/// macOS quirk: `set_activation_policy` posts an NSApp message and returns
/// immediately, but the actual policy transition takes ~50-200ms. If we
/// issue window show/hide calls before the policy settles, macOS may
/// silently drop them — leaving main visible on pick start. The sleeps
/// after the policy change give the window server time to catch up. This
/// is the source of the intermittent "window doesn't hide" symptom.
#[tauri::command]
pub fn set_picker_mode<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    let picker = app
        .get_webview_window("picker")
        .ok_or("picker window not found")?;

    log::info!("[picker] set_picker_mode enabled={enabled}");

    if enabled {
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            // Let the policy change settle before manipulating windows —
            // see the doc comment above.
            std::thread::sleep(std::time::Duration::from_millis(80));
        }
        // Remember the main window's geometry so we can restore it on exit
        // (the user might have moved/resized it before picking).
        if let Ok(pos) = main.outer_position() {
            if let Ok(size) = main.outer_size() {
                if let Some(geom_state) = app.try_state::<crate::AppState>() {
                    *geom_state.main_geom.lock() = Some(crate::MainWindowGeometry {
                        x: pos.x,
                        y: pos.y,
                        width: size.width,
                        height: size.height,
                    });
                }
            }
        }
        // IMPORTANT ordering: show picker BEFORE hiding main. macOS treats
        // "no visible window" as "app deactivated" and may disable any active
        // CGEventTap (rdev's hook), which then stops receiving clicks — that
        // is the classic source of "the picker card never appeared / clicks
        // are silent". Showing the picker first keeps the process foreground.
        if let Err(e) = picker.show() {
            log::warn!("[picker] picker.show() failed: {e}");
        }
        // Brief yield so the OS processes the show before we move/hide.
        std::thread::sleep(std::time::Duration::from_millis(20));
        // Position the picker at the cursor first (so it appears where the
        // user is), then clamp to the visible screen region so it can't end
        // up off-screen on multi-monitor / dock-edge setups.
        if let Some((cx, cy)) = cursor_physical() {
            let scale = picker.scale_factor().unwrap_or(1.0);
            let lx = ((cx + 16) as f64 / scale).round() as i32;
            let ly = ((cy + 16) as f64 / scale).round() as i32;
            let (clx, cly) = clamp_to_screen(lx, ly, PICKER_W, PICKER_H);
            if let Err(e) = picker.set_position(tauri::LogicalPosition::new(clx, cly)) {
                log::warn!("[picker] picker.set_position() failed: {e}");
            }
        } else {
            // No cursor info — put it at the primary monitor's center.
            let (clx, cly) = primary_monitor_center(PICKER_W, PICKER_H);
            if let Err(e) = picker.set_position(tauri::LogicalPosition::new(clx, cly)) {
                log::warn!("[picker] picker.set_position() failed: {e}");
            }
        }
        if let Err(e) = picker.set_focus() {
            // Picker has focus:false in tauri.conf.json, so this is expected
            // to be a no-op on some macOS versions. Log at debug to avoid noise.
            log::debug!("[picker] picker.set_focus() returned: {e}");
        }
        // Now safe to hide main.
        if let Err(e) = main.hide() {
            log::warn!("[picker] main.hide() failed: {e}");
        }
        // Verify main actually hid. macOS occasionally drops the hide if it
        // arrived during an activation-policy transition; retry once after a
        // brief wait. This is the direct fix for "clicked picker button,
        // window didn't hide".
        let main_visible = main.is_visible().unwrap_or(true);
        if main_visible {
            log::warn!("[picker] main still visible after hide(), retrying");
            std::thread::sleep(std::time::Duration::from_millis(60));
            if let Err(e) = main.hide() {
                log::warn!("[picker] main.hide() retry failed: {e}");
            }
        }
        let final_visible = main.is_visible().unwrap_or(true);
        log::info!("[picker] mode=enabled done, main.is_visible={final_visible}");
        let _ = app.emit(
            "picker://mode-changed",
            &serde_json::json!({
                "enabled": true,
                "main_visible": final_visible,
            }),
        );
        if final_visible {
            return Err("The main window could not be hidden".into());
        }
        if !picker.is_focused().unwrap_or(false) {
            let _ = picker.set_focus();
        }
    } else {
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            std::thread::sleep(std::time::Duration::from_millis(80));
        }
        if let Err(e) = picker.hide() {
            log::warn!("[picker] picker.hide() failed: {e}");
        }
        if let Err(e) = main.show() {
            log::warn!("[picker] main.show() failed: {e}");
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
        if let Err(e) = main.set_decorations(true) {
            log::warn!("[picker] main.set_decorations(true) failed: {e}");
        }
        if let Err(e) = main.set_always_on_top(false) {
            log::warn!("[picker] main.set_always_on_top(false) failed: {e}");
        }
        if let Err(e) = main.set_ignore_cursor_events(false) {
            log::warn!("[picker] main.set_ignore_cursor_events(false) failed: {e}");
        }
        // Intentionally do NOT touch the window's size or position here.
        // The OS/window manager preserves geometry across hide/show, and the
        // user may have resized the main window since it was first opened.
        // Forcing a set_size from the saved geom would shrink the window back
        // to its original 640x480 on every pick. Only the defensive cancel
        // path (when the window got stuck hidden mid-pick) restores geometry.
        if let Err(e) = main.set_focus() {
            log::warn!("[picker] main.set_focus() failed: {e}");
        }
        let mut final_visible = main.is_visible().unwrap_or(false);
        if !final_visible {
            log::warn!("[picker] main still hidden after show(), retrying");
            std::thread::sleep(std::time::Duration::from_millis(60));
            let _ = main.show();
            final_visible = main.is_visible().unwrap_or(false);
        }
        log::info!("[picker] mode=disabled done, main.is_visible={final_visible}");
        let _ = app.emit(
            "picker://mode-changed",
            &serde_json::json!({
                "enabled": false,
                "main_visible": final_visible,
            }),
        );
        if !final_visible {
            return Err("The main window could not be restored".into());
        }
    }
    Ok(())
}

/// Restore the main window to its pre-pick geometry, or to the platform's
/// default size + center if no geometry was recorded. Used by the defensive
/// cancel path so that a window left in `hidden` state under Accessory
/// activation policy is brought back visibly on the screen.
fn restore_main_geometry<R: Runtime>(app: &AppHandle<R>) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let _ = main.show();
    if let Some(geom_state) = app.try_state::<crate::AppState>() {
        if let Some(geom) = *geom_state.main_geom.lock() {
            let scale = main.scale_factor().unwrap_or(1.0);
            let lx = (geom.x as f64 / scale).round() as i32;
            let ly = (geom.y as f64 / scale).round() as i32;
            let lw = (geom.width as f64 / scale).round() as u32;
            let lh = (geom.height as f64 / scale).round() as u32;
            let _ = main.set_size(tauri::LogicalSize::new(lw.max(1), lh.max(1)));
            let _ = main.set_position(tauri::LogicalPosition::new(lx, ly));
            return;
        }
    }
    let _ = main.set_size(tauri::LogicalSize::new(640, 480));
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let mpos = monitor.position();
        let msize = monitor.size();
        let x = mpos.x + (msize.width as i32 - 640) / 2;
        let y = mpos.y + (msize.height as i32 - 480) / 2;
        let _ = main.set_position(tauri::LogicalPosition::new(x, y));
    }
}

#[tauri::command]
pub fn capture_pixel(x: i32, y: i32) -> Result<PixelPayload, String> {
    let [r, g, b] = std::panic::catch_unwind(|| capture_pixel_rgb(x, y))
        .map_err(|_| "Screen capture panicked".to_string())?
        .ok_or_else(|| "Unable to capture the selected pixel".to_string())?;
    Ok(PixelPayload {
        hex: format!("#{:02X}{:02X}{:02X}", r, g, b),
        rgb: [r, g, b],
        x,
        y,
    })
}

pub fn register_global_hotkey<R: Runtime>(
    _app: &AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Removed: hotkey-based picking is replaced by in-app start_picking button
    // + global mouse click hook. The global hotkey reserved for future use.
    Ok(())
}

// ----- rdev tap singleton -----

/// Start the rdev global tap once per process. Subsequent calls are no-ops.
/// The tap pushes left-click and Esc events into a shared queue that each
/// pick session's dispatch loop drains.
fn ensure_tap_running() -> Result<(), String> {
    loop {
        let current = TAP_STATE.load(Ordering::Acquire);
        match current {
            TAP_RUNNING | TAP_STARTING => return Ok(()),
            TAP_NOT_STARTED | TAP_FAILED => {
                if TAP_STATE
                    .compare_exchange(current, TAP_STARTING, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
                {
                    break;
                }
            }
            _ => return Err("the global input hook is in an invalid state".into()),
        }
    }

    TAP_QUEUE.get_or_init(|| Mutex::new(Vec::with_capacity(8)));
    if let Err(e) = std::thread::Builder::new()
        .name("opencolor-rdev-tap".into())
        .spawn(|| {
            log::info!("[picker] rdev listen starting (process-wide singleton)");
            let queue = TAP_QUEUE.get().expect("queue initialized");
            let result = std::panic::catch_unwind(|| {
                rdev::listen(move |event| {
                    TAP_STATE.store(TAP_RUNNING, Ordering::Release);
                    if let Some(tap) = classify_event(event) {
                        if let Ok(mut g) = queue.lock() {
                            // Bound the queue so a runaway producer can't OOM us.
                            if g.len() < 32 {
                                g.push(tap);
                            }
                        }
                    }
                })
            });
            TAP_STATE.store(TAP_FAILED, Ordering::Release);
            match result {
                Ok(Err(e)) => log::error!("[picker] rdev listen error: {e:?}"),
                Err(_) => log::error!("[picker] rdev listen panicked"),
                Ok(Ok(())) => log::warn!("[picker] rdev listen exited unexpectedly"),
            }
        })
    {
        TAP_STATE.store(TAP_FAILED, Ordering::Release);
        return Err(e.to_string());
    }

    // rdev only returns when startup fails or the listener exits. Give those
    // immediate failures a chance to surface before the main window is hidden.
    std::thread::sleep(std::time::Duration::from_millis(120));
    if TAP_STATE.load(Ordering::Acquire) == TAP_FAILED {
        return Err("the global input hook could not be initialized".into());
    }
    TAP_STATE
        .compare_exchange(
            TAP_STARTING,
            TAP_RUNNING,
            Ordering::AcqRel,
            Ordering::Acquire,
        )
        .ok();
    Ok(())
}

/// Filter rdev events down to the variants we care about.
fn classify_event(event: Event) -> Option<TapEvent> {
    match event.event_type {
        EventType::ButtonPress(Button::Left) => Some(TapEvent::LeftClick),
        EventType::KeyPress(Key::Escape) => Some(TapEvent::Escape),
        _ => None,
    }
}

/// Drain all events currently in the queue. Called by the dispatch loop.
fn drain_tap_queue() -> Vec<TapEvent> {
    let Some(q) = TAP_QUEUE.get() else {
        return Vec::new();
    };
    match q.lock() {
        Ok(mut g) => std::mem::take(&mut *g),
        Err(_) => Vec::new(),
    }
}

// ----- capture loop -----

fn spawn_capture_loop(app: AppHandle<Wry>, token: CancellationToken) {
    tauri::async_runtime::spawn_blocking(move || {
        log::info!("[picker] capture loop started");
        let mut seq: u64 = 0;
        while !token.is_cancelled() {
            seq += 1;
            let sample = std::panic::catch_unwind(capture_cursor_pixel);
            match sample {
                Ok(Some((px, py, rgb))) => {
                    // Skip the picker window move and the JS event when nothing
                    // visible has changed since the last tick. At 30 Hz the cursor
                    // is often stationary for several ticks, and the picker
                    // card itself stays centered; emitting + set_position on every
                    // tick goes through Tauri's IPC and the platform window
                    // manager, which competes with the picker webview for the
                    // main thread and is the dominant cause of perceived lag.
                    let rgb_changed = match last_picker_rgb().lock() {
                        Ok(g) => match g.as_ref() {
                            Some(prev) => *prev != rgb,
                            None => true,
                        },
                        Err(_) => true,
                    };
                    if rgb_changed {
                        let payload = PixelPayload {
                            hex: format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]),
                            rgb,
                            x: px,
                            y: py,
                        };
                        if let Err(e) = app.emit("picker://pixel", &payload) {
                            if seq % 30 == 1 {
                                log::warn!("[picker] emit picker://pixel failed: {e}");
                            }
                        }
                        if let Ok(mut g) = last_picker_rgb().lock() {
                            *g = Some(rgb);
                        }
                    }
                    if let Some(picker) = app.get_webview_window("picker") {
                        let scale = picker.scale_factor().unwrap_or(1.0);
                        let lx = ((px + 16) as f64 / scale).round() as i32;
                        let ly = ((py + 16) as f64 / scale).round() as i32;
                        let (clx, cly) = clamp_to_screen(lx, ly, PICKER_W, PICKER_H);
                        let pos_changed = match last_picker_pos().lock() {
                            Ok(g) => match g.as_ref() {
                                Some(prev) => prev.0 != clx || prev.1 != cly,
                                None => true,
                            },
                            Err(_) => true,
                        };
                        if pos_changed {
                            let _ = picker.set_position(tauri::LogicalPosition::new(clx, cly));
                            if let Ok(mut g) = last_picker_pos().lock() {
                                *g = Some((clx, cly));
                            }
                        }
                    }
                }
                Ok(None) if seq % 30 == 1 => {
                    log::warn!("[picker] screen sample unavailable at tick {seq}");
                }
                Err(_) => {
                    log::error!("[picker] screen capture panicked; keeping session alive");
                }
                _ => {}
            }
            std::thread::sleep(std::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
        }
        log::info!("[picker] capture loop cancelled after {seq} ticks");
    });
}

/// Per-session dispatcher. Drains the shared tap queue while honoring the
/// cancellation token. Runs on a blocking task because mpsc isn't awaitable.
fn spawn_click_dispatch(app: AppHandle<Wry>, token: CancellationToken, session_id: u64) {
    tauri::async_runtime::spawn(async move {
        log::info!("[picker] click dispatch started");
        let mut last_button_down = std::time::Instant::now()
            .checked_sub(std::time::Duration::from_secs(1))
            .unwrap_or_else(std::time::Instant::now);

        // Outer task just waits for cancellation. The actual draining happens
        // on a blocking task below so we can use recv_timeout on the mutex.
        let token_for_blocking = token.clone();
        let app_for_blocking = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let armed_at =
                std::time::Instant::now() + std::time::Duration::from_millis(CLICK_ARM_DELAY_MS);
            loop {
                if token_for_blocking.is_cancelled() {
                    log::info!("[picker] click dispatch cancelled");
                    break;
                }
                if TAP_STATE.load(Ordering::Acquire) == TAP_FAILED {
                    log::error!("[picker] global input hook stopped during session {session_id}");
                    finish_session(&app_for_blocking, session_id, PickOutcome::Cancelled);
                    break;
                }
                let events = drain_tap_queue();
                for event in events {
                    match event {
                        TapEvent::LeftClick => {
                            let now = std::time::Instant::now();
                            if now < armed_at {
                                continue;
                            }
                            if now.duration_since(last_button_down).as_millis() < 80 {
                                continue; // debounce
                            }
                            last_button_down = now;
                            if let Some((x, y)) = cursor_physical() {
                                if let Some(rgb) = capture_pixel_rgb(x, y) {
                                    let payload = PixelPayload {
                                        hex: format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]),
                                        rgb,
                                        x,
                                        y,
                                    };
                                    log::info!(
                                        "[picker] CLICK at ({},{}) picked {}",
                                        x,
                                        y,
                                        payload.hex
                                    );
                                    finish_session(
                                        &app_for_blocking,
                                        session_id,
                                        PickOutcome::Picked(payload),
                                    );
                                    break;
                                } else {
                                    log::warn!(
                                        "[picker] CLICK at ({},{}) but capture_pixel_rgb failed",
                                        x,
                                        y
                                    );
                                }
                            }
                        }
                        TapEvent::Escape => {
                            log::info!("[picker] Esc pressed (rdev tap) → cancel");
                            finish_session(&app_for_blocking, session_id, PickOutcome::Cancelled);
                            break;
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(CLICK_HOOK_POLL_MS));
            }
        });
        token.cancelled().await;
        log::info!("[picker] click dispatch task exiting");
    });
}

// ----- helpers -----

/// Clamp a logical coordinate so the picker window stays on-screen. Returns
/// the original (lx, ly) if it's already inside some monitor's visible
/// region; otherwise returns the primary monitor's center.
fn clamp_to_screen(lx: i32, ly: i32, w: i32, h: i32) -> (i32, i32) {
    let monitors = match xcap::Monitor::all() {
        Ok(m) if !m.is_empty() => m,
        _ => return (lx, ly),
    };
    // Check whether the proposed rect overlaps any monitor.
    let on_screen = monitors.iter().any(|m| {
        let Ok(mp) = m.x() else { return false };
        let Ok(ms) = m.width() else { return false };
        let Ok(mtop) = m.y() else { return false };
        let Ok(mh) = m.height() else { return false };
        lx + w > mp && lx < mp + (ms as i32) && ly + h > mtop && ly < mtop + (mh as i32)
    });
    if on_screen {
        return (lx, ly);
    }
    primary_monitor_center(w, h)
}

/// Center of the primary monitor in logical coordinates, sized to fit (w, h).
fn primary_monitor_center(w: i32, h: i32) -> (i32, i32) {
    let monitors = xcap::Monitor::all().ok().unwrap_or_default();
    if let Some(m) = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
    {
        let mp = m.x().unwrap_or(0);
        let ms = m.width().unwrap_or(0) as i32;
        let mtop = m.y().unwrap_or(0);
        let mh = m.height().unwrap_or(0) as i32;
        return (mp + (ms - w) / 2, mtop + (mh - h) / 2);
    }
    (100, 100)
}

/// Average the 3x3 patch centred on (phys_x, phys_y). 1x1 capture_region
/// rounds the cursor's subpixel position to a single pixel, so two
/// adjacent mouse positions can land on different pixels even though the
/// screen content is uniform. 3x3 averaging makes the picker colour
/// independent of integer-coordinate rounding. Falls back to a single
/// pixel near monitor edges where the 3x3 region would overflow.
fn capture_pixel_rgb(phys_x: i32, phys_y: i32) -> Option<[u8; 3]> {
    let monitor = xcap::Monitor::from_point(phys_x, phys_y).ok()?;
    // xcap expects coordinates relative to the selected monitor. Passing
    // desktop-global coordinates works only on a primary monitor at (0, 0)
    // and fails on displays placed to the left/above or after the primary.
    let (local_x, local_y) =
        monitor_local_point(phys_x, phys_y, monitor.x().ok()?, monitor.y().ok()?)?;
    let (ox, oy, ow, oh) = match (local_x.checked_sub(1), local_y.checked_sub(1)) {
        (Some(ox), Some(oy)) => (ox, oy, 3u32, 3u32),
        // Edge: local coordinate at 0 — fall back to single-pixel sample.
        _ => (local_x, local_y, 1, 1),
    };
    let img = monitor.capture_region(ox, oy, ow, oh).ok()?;
    let n = (ow * oh).max(1);
    let mut rs: u32 = 0;
    let mut gs: u32 = 0;
    let mut bs: u32 = 0;
    for px in img.pixels() {
        let [r, g, b, _a] = px.0;
        rs += r as u32;
        gs += g as u32;
        bs += b as u32;
    }
    Some([(rs / n) as u8, (gs / n) as u8, (bs / n) as u8])
}

fn capture_cursor_pixel() -> Option<(i32, i32, [u8; 3])> {
    let (x, y) = cursor_physical()?;
    capture_pixel_rgb(x, y).map(|rgb| (x, y, rgb))
}

fn monitor_local_point(
    global_x: i32,
    global_y: i32,
    monitor_x: i32,
    monitor_y: i32,
) -> Option<(u32, u32)> {
    let local_x = global_x.checked_sub(monitor_x)?;
    let local_y = global_y.checked_sub(monitor_y)?;
    Some((u32::try_from(local_x).ok()?, u32::try_from(local_y).ok()?))
}

fn cursor_physical() -> Option<(i32, i32)> {
    use mouse_position::mouse_position::Mouse;
    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Some((x, y)),
        Mouse::Error => None,
    }
}

#[cfg(test)]
mod tests {
    use super::monitor_local_point;

    #[test]
    fn converts_global_coordinates_for_offset_monitor() {
        assert_eq!(monitor_local_point(2100, 250, 1920, 0), Some((180, 250)));
        assert_eq!(monitor_local_point(-1200, 300, -1440, 0), Some((240, 300)));
    }

    #[test]
    fn rejects_points_before_monitor_origin() {
        assert_eq!(monitor_local_point(99, 100, 100, 100), None);
        assert_eq!(monitor_local_point(100, 99, 100, 100), None);
    }
}

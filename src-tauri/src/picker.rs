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
//! Click anywhere on the screen to commit the pick; Esc to cancel.
//! Implementation note: there is no transparent loupe webview — the main
//! window itself stays put while a floating card follows the cursor. This
//! is lighter and avoids the macOS WKWebView + transparent + canvas bug.

use crate::AppState;
use rdev::{Button, Event, EventType, Key};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime, State, Wry};
use tokio_util::sync::CancellationToken;

pub const CAPTURE_INTERVAL_MS: u64 = 16; // ~60Hz preview
const CLICK_HOOK_POLL_MS: u64 = 50;

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

pub struct PickerSession {
    token: Option<CancellationToken>,
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
        Self { token: None, cancel_listeners: Vec::new(), app: None }
    }
    pub fn is_active(&self) -> bool {
        self.token.is_some()
    }
    pub fn cancel(&mut self) {
        if let Some(t) = self.token.take() {
            t.cancel();
        }
        // Defensive: the frontend should call set_picker_mode(false) on
        // cancel/pick, but if the listener was unregistered, the React
        // component unmounted mid-pick, or the JS errored, we'd otherwise
        // leave the main window hidden under Accessory activation policy —
        // making the whole app unresponsive to clicks. Always restore here.
        if let Some(app) = self.app.take() {
            for id in self.cancel_listeners.drain(..) {
                app.unlisten(id);
            }
            // Force-hide picker in case the cancelled emit was lost. This is
            // idempotent — if the picker is already hidden, `hide()` is a no-op.
            if let Some(picker) = app.get_webview_window("picker") {
                let _ = picker.hide();
            }
            if let Err(e) = set_picker_mode(app.clone(), false) {
                log::error!("[picker] defensive set_picker_mode(false) failed: {e}");
            }
            // The normal set_picker_mode(false) leaves the window's geometry
            // alone (so the user's chosen size is preserved). But this cancel
            // may have been triggered while the window was still in `hidden`
            // — we should make sure it's visible at its last known position.
            restore_main_geometry(&app);
        }
    }
    pub fn start(&mut self, app: AppHandle<Wry>) -> CancellationToken {
        // First cancel any prior session and unlisten its listeners so we
        // don't accumulate EventIds across picking sessions.
        self.cancel();
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
        t
    }
    pub fn track_listener(&mut self, id: tauri::EventId) {
        self.cancel_listeners.push(id);
    }
}

#[derive(Serialize, Clone)]
pub struct PixelPayload {
    pub hex: String,
    pub rgb: [u8; 3],
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
pub async fn start_picking(
    app: AppHandle<Wry>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!(
        "[picker] start_picking called, permission={:?}",
        state.permission
    );
    match state.permission {
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
    let token = state.picker.lock().start(app.clone());
    log::info!("[picker] capture loop token created, spawning tasks");

    // Ensure the rdev global tap is running (process-wide singleton).
    if let Err(e) = ensure_tap_running() {
        log::error!("[picker] failed to start global tap: {e}");
        state.picker.lock().cancel();
        return Err(format!("Failed to start global mouse hook: {e}"));
    }

    spawn_capture_loop(app.clone(), token.clone());
    spawn_click_dispatch(app.clone(), token.clone());

    // Listen for Esc pressed inside the picker window. rdev's global key
    // hook is unreliable on macOS because the OS short-circuits Esc before
    // our tap sees it; the picker webview gets Esc reliably. We track the
    // EventId so cancel() can unlisten it (otherwise each pick session
    // accumulates another listener that fires forever).
    {
        let app_for_listen = app.clone();
        let token_for_listen = token.clone();
        let id = app.listen("picker://cancel", move |_event| {
            log::info!("[picker] picker://cancel → cancel token");
            let _ = app_for_listen.emit("picker://cancelled", ());
            token_for_listen.cancel();
        });
        state.picker.lock().track_listener(id);
    }
    Ok(())
}

#[tauri::command]
pub fn stop_picking(state: State<'_, AppState>) {
    log::info!("[picker] stop_picking called");
    state.picker.lock().cancel();
}

/// Toggle picker overlay mode:
/// - enabled=true: hide main window, show dedicated transparent picker
///   window (220x96), wire it to follow the cursor.
/// - enabled=false: hide picker window, show main window again.
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
        let _ = picker.show();
        // Position the picker at the cursor first (so it appears where the
        // user is), then clamp to the visible screen region so it can't end
        // up off-screen on multi-monitor / dock-edge setups.
        if let Some((cx, cy)) = cursor_physical() {
            let scale = picker.scale_factor().unwrap_or(1.0);
            let lx = ((cx + 16) as f64 / scale).round() as i32;
            let ly = ((cy + 16) as f64 / scale).round() as i32;
            let (clx, cly) = clamp_to_screen(lx, ly, PICKER_W, PICKER_H);
            let _ = picker.set_position(tauri::LogicalPosition::new(clx, cly));
        } else {
            // No cursor info — put it at the primary monitor's center.
            let (clx, cly) = primary_monitor_center(PICKER_W, PICKER_H);
            let _ = picker.set_position(tauri::LogicalPosition::new(clx, cly));
        }
        let _ = picker.set_focus();
        // Now safe to hide main.
        let _ = main.hide();
    } else {
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        }
        let _ = picker.hide();
        let _ = main.show();
        let _ = main.set_decorations(true);
        let _ = main.set_always_on_top(false);
        let _ = main.set_ignore_cursor_events(false);
        // Intentionally do NOT touch the window's size or position here.
        // The OS/window manager preserves geometry across hide/show, and the
        // user may have resized the main window since it was first opened.
        // Forcing a set_size from the saved geom would shrink the window back
        // to its original 640x480 on every pick. Only the defensive cancel
        // path (when the window got stuck hidden mid-pick) restores geometry.
        let _ = main.set_focus();
    }
    Ok(())
}

/// Restore the main window to its pre-pick geometry, or to the platform's
/// default size + center if no geometry was recorded. Used by the defensive
/// cancel path so that a window left in `hidden` state under Accessory
/// activation policy is brought back visibly on the screen.
fn restore_main_geometry<R: Runtime>(app: &AppHandle<R>) {
    let Some(main) = app.get_webview_window("main") else { return };
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
    use xcap::Monitor;
    let monitor = Monitor::from_point(x, y).map_err(|e| e.to_string())?;
    let px = monitor
        .capture_region(x.max(0) as u32, y.max(0) as u32, 1, 1)
        .map_err(|e| e.to_string())?;
    let buf = px.into_raw();
    let (r, g, b) = match buf.as_slice() {
        [r, g, b, ..] => (*r, *g, *b),
        _ => (0, 0, 0),
    };
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
    if TAP_QUEUE.get().is_some() {
        return Ok(());
    }
    TAP_QUEUE
        .set(Mutex::new(Vec::with_capacity(8)))
        .map_err(|_| "tap queue already initialized")?;
    std::thread::Builder::new()
        .name("opencolor-rdev-tap".into())
        .spawn(|| {
            log::info!("[picker] rdev listen starting (process-wide singleton)");
            let queue = TAP_QUEUE.get().expect("queue initialized");
            if let Err(e) = rdev::listen(move |event| {
                if let Some(tap) = classify_event(event) {
                    if let Ok(mut g) = queue.lock() {
                        // Bound the queue so a runaway producer can't OOM us.
                        if g.len() < 32 {
                            g.push(tap);
                        }
                    }
                }
            }) {
                log::error!("[picker] rdev listen error: {e:?}");
            }
            log::info!("[picker] rdev listen exited");
        })
        .map_err(|e| e.to_string())?;
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
    let Some(q) = TAP_QUEUE.get() else { return Vec::new() };
    match q.lock() {
        Ok(mut g) => std::mem::take(&mut *g),
        Err(_) => Vec::new(),
    }
}

// ----- capture loop -----

fn spawn_capture_loop<R: Runtime>(app: AppHandle<R>, token: CancellationToken) {
    tauri::async_runtime::spawn(async move {
        let mut interval =
            tokio::time::interval(tokio::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        log::info!("[picker] capture loop started");
        let mut seq: u64 = 0;

        loop {
            tokio::select! {
                _ = token.cancelled() => {
                    log::info!("[picker] capture loop cancelled after {} ticks", seq);
                    break;
                },
                _ = interval.tick() => {
                    seq += 1;
                    let (px, py) = match cursor_physical() {
                        Some(p) => p,
                        None => {
                            if seq % 60 == 1 { log::warn!("[picker] cursor_physical None"); }
                            continue;
                        }
                    };
                    let Some(rgb) = capture_pixel_rgb(px, py) else {
                        if seq % 60 == 1 { log::warn!("[picker] capture_pixel_rgb None at #{}", seq); }
                        continue;
                    };
                    let payload = PixelPayload {
                        hex: format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]),
                        rgb,
                        x: px,
                        y: py,
                    };
                    if seq == 1 || seq % 60 == 1 {
                        log::debug!("[picker] tick #{} pos=({},{}) rgb={:?}", seq, px, py, rgb);
                    }
                    if let Err(e) = app.emit("picker://pixel", &payload) {
                        if seq % 30 == 1 { log::warn!("[picker] emit picker://pixel failed: {e}"); }
                    }
                    // Move the dedicated picker window so it sits flush against
                    // the cursor's bottom-right corner. mouse_position returns
                    // physical px; set_position takes logical px, so divide by
                    // the picker's scale factor. Then clamp to the visible
                    // screen region so it never escapes on multi-monitor setups.
                    if let Some(picker) = app.get_webview_window("picker") {
                        let scale = picker.scale_factor().unwrap_or(1.0);
                        let lx = ((px + 16) as f64 / scale).round() as i32;
                        let ly = ((py + 16) as f64 / scale).round() as i32;
                        let (clx, cly) = clamp_to_screen(lx, ly, PICKER_W, PICKER_H);
                        let _ = picker.set_position(tauri::LogicalPosition::new(clx, cly));
                    }
                }
            }
        }
    });
}

/// Per-session dispatcher. Drains the shared tap queue while honoring the
/// cancellation token. Runs on a blocking task because mpsc isn't awaitable.
fn spawn_click_dispatch<R: Runtime>(app: AppHandle<R>, token: CancellationToken) {
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
            loop {
                if token_for_blocking.is_cancelled() {
                    log::info!("[picker] click dispatch cancelled");
                    break;
                }
                let events = drain_tap_queue();
                for event in events {
                    match event {
                        TapEvent::LeftClick => {
                            let now = std::time::Instant::now();
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
                                        x, y, payload.hex
                                    );
                                    let _ = app_for_blocking.emit("picker://picked", &payload);
                                    token_for_blocking.cancel(); // single pick → auto-stop
                                } else {
                                    log::warn!(
                                        "[picker] CLICK at ({},{}) but capture_pixel_rgb failed",
                                        x, y
                                    );
                                }
                            }
                        }
                        TapEvent::Escape => {
                            log::info!("[picker] Esc pressed (rdev tap) → cancel");
                            let _ = app_for_blocking.emit("picker://cancelled", ());
                            token_for_blocking.cancel();
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
    if let Some(m) = monitors.into_iter().find(|m| m.is_primary().unwrap_or(false)) {
        let mp = m.x().unwrap_or(0);
        let ms = m.width().unwrap_or(0) as i32;
        let mtop = m.y().unwrap_or(0);
        let mh = m.height().unwrap_or(0) as i32;
        return (mp + (ms - w) / 2, mtop + (mh - h) / 2);
    }
    (100, 100)
}

fn capture_pixel_rgb(phys_x: i32, phys_y: i32) -> Option<[u8; 3]> {
    let monitor = xcap::Monitor::from_point(phys_x, phys_y).ok()?;
    let px = monitor
        .capture_region(phys_x.max(0) as u32, phys_y.max(0) as u32, 1, 1)
        .ok()?;
    let buf = px.into_raw();
    match buf.as_slice() {
        [r, g, b, ..] => Some([*r, *g, *b]),
        _ => None,
    }
}

fn cursor_physical() -> Option<(i32, i32)> {
    use mouse_position::mouse_position::Mouse;
    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Some((x, y)),
        Mouse::Error => None,
    }
}
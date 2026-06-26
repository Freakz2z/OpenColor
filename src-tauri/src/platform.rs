//! Cross-platform permission and capability pre-flight.
//!
//! Called once during `setup()`. Tries to enumerate displays via `xcap`.
//! On macOS this will silently return an empty list / error if the user
//! has not granted "Screen Recording" permission. The frontend reads
//! `PermissionState` on mount and shows a banner with a deep link to
//! System Settings if anything is missing. Linux is split by display server:
//! X11 is supported by the current capture/click-hook stack, while Wayland is
//! intentionally marked unsupported because global pointer hooks are not
//! generally available there.

use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Ok,
    Denied,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: &'static str,
    pub display_server: Option<String>,
    pub permission: PermissionState,
    pub can_pick_screen: bool,
}

pub fn preflight() -> PermissionState {
    #[cfg(target_os = "linux")]
    if is_wayland_session() {
        log::warn!("Wayland session detected; global screen picking is not supported");
        return PermissionState::Unsupported;
    }

    match xcap::Monitor::all() {
        Ok(monitors) if !monitors.is_empty() => PermissionState::Ok,
        Ok(_) => PermissionState::Denied, // empty list usually means denied on macOS
        Err(e) => {
            log::warn!("xcap preflight failed: {e}");
            // Linux Wayland and unsupported platforms land here.
            PermissionState::Unsupported
        }
    }
}

pub fn platform_info(permission: PermissionState) -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        display_server: display_server(),
        permission,
        can_pick_screen: permission == PermissionState::Ok,
    }
}

#[tauri::command]
pub fn get_permission_state(state: State<'_, AppState>) -> PermissionState {
    state.permission
}

#[tauri::command]
pub fn get_platform_info(state: State<'_, AppState>) -> PlatformInfo {
    platform_info(state.permission)
}

fn display_server() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(session) = std::env::var("XDG_SESSION_TYPE") {
            if !session.trim().is_empty() {
                return Some(session.to_lowercase());
            }
        }
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return Some("wayland".into());
        }
        if std::env::var_os("DISPLAY").is_some() {
            return Some("x11".into());
        }
        return None;
    }

    #[cfg(not(target_os = "linux"))]
    None
}

#[cfg(target_os = "linux")]
fn is_wayland_session() -> bool {
    display_server().as_deref() == Some("wayland")
}

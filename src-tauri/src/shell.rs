//! Custom Tauri commands that need to bypass the default plugin scopes.
//!
//! `tauri-plugin-opener`'s default permission set only allows `https:`, `http:`,
//! `mailto:`, and `tel:` URLs. macOS's `x-apple.systempreferences:` deep-links
//! to System Settings (Privacy → Screen Recording / Accessibility) are not
//! covered, so the plugin silently rejects them. This module exposes a single
//! `open_system_settings` command that uses the same `open` crate under the
//! hood but skips the scope check, since the only caller is the
//! `PermissionBanner` UI and the URL is built from a hard-coded allow-list.

#[tauri::command]
pub fn open_system_settings(url: String) -> Result<(), String> {
    // Allow-list of URLs the banner is allowed to open. Anything else is
    // rejected as a safety net so the command can't be repurposed as a
    // generic URL launcher.
    const ALLOWED: &[&str] = &[
        // macOS — System Settings → Privacy & Security
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    ];

    if !ALLOWED.contains(&url.as_str()) {
        return Err(format!("URL not in allow-list: {url}"));
    }

    open::that_detached(&url).map_err(|e| format!("open() failed: {e}"))
}

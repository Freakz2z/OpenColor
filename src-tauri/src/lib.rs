//! OpenColor library entry point.
//!
//! Wires up the Tauri builder, registers all commands, runs the cross-platform
//! permission pre-flight, and installs the global hotkey for screen picking.

mod palette;
mod picker;
mod platform;
mod storage;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub picker: Arc<Mutex<picker::PickerSession>>,
    pub permission: platform::PermissionState,
    pub main_geom: Arc<Mutex<Option<MainWindowGeometry>>>,
}

#[derive(Clone, Copy, Debug)]
pub struct MainWindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // tauri-plugin-log initializes its own env_logger internally; calling
    // try_init() here would race with the plugin and panic on second init.
    // Filter is set via the plugin's Builder::new() chain below.
    let permission = platform::preflight();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .level_for("opencolor_lib", log::LevelFilter::Debug)
                .build(),
        )
        .manage(AppState {
            picker: Arc::new(Mutex::new(picker::PickerSession::idle())),
            permission,
            main_geom: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            palette::list_palettes,
            palette::create_palette,
            palette::update_palette,
            palette::delete_palette,
            palette::reorder_palettes,
            palette::add_color,
            palette::update_color,
            palette::remove_color,
            picker::start_picking,
            picker::stop_picking,
            picker::capture_pixel,
            platform::get_permission_state,
            platform::get_platform_info,
        ])
        .setup(|app| {
            log::info!(
                "[app] OpenColor setup() running, permission={:?}",
                app.state::<AppState>().permission
            );
            picker::register_global_hotkey(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

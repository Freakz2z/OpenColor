//! Color palette data model + CRUD commands.
//!
//! Palettes are persisted by `storage.rs`; this module is the thin
//! command/struct layer the frontend talks to.

use crate::storage;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Color {
    pub id: String,
    pub name: String,
    pub hex: String,
    pub rgb: [u8; 3],
    pub family: String,
    #[serde(default)]
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Palette {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub colors: Vec<Color>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[tauri::command]
pub fn list_palettes(app: AppHandle) -> Result<Vec<Palette>, String> {
    storage::list_all::<Palette>(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_palette(
    app: AppHandle,
    name: String,
    description: Option<String>,
) -> Result<Palette, String> {
    let now = now_ms();
    let palette = Palette {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        description,
        colors: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    storage::write_one(&app, &palette.id, &palette).map_err(|e| e.to_string())?;
    Ok(palette)
}

#[tauri::command]
pub fn update_palette(
    app: AppHandle,
    id: String,
    name: Option<String>,
    description: Option<String>,
) -> Result<Palette, String> {
    let mut p: Palette = storage::read_one(&app, &id).map_err(|e| e.to_string())?;
    if let Some(n) = name {
        p.name = n;
    }
    if let Some(d) = description {
        p.description = Some(d);
    }
    p.updated_at = now_ms();
    storage::write_one(&app, &p.id, &p).map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
pub fn delete_palette(app: AppHandle, id: String) -> Result<(), String> {
    storage::delete_one(&app, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_color(app: AppHandle, palette_id: String, color: Color) -> Result<Palette, String> {
    let mut p: Palette = storage::read_one(&app, &palette_id).map_err(|e| e.to_string())?;
    p.colors.push(color);
    p.updated_at = now_ms();
    storage::write_one(&app, &p.id, &p).map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
pub fn update_color(app: AppHandle, palette_id: String, color: Color) -> Result<Palette, String> {
    let mut p: Palette = storage::read_one(&app, &palette_id).map_err(|e| e.to_string())?;
    if let Some(slot) = p.colors.iter_mut().find(|c| c.id == color.id) {
        *slot = color;
    } else {
        return Err(format!("color {} not found in palette", color.id));
    }
    p.updated_at = now_ms();
    storage::write_one(&app, &p.id, &p).map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
pub fn remove_color(
    app: AppHandle,
    palette_id: String,
    color_id: String,
) -> Result<Palette, String> {
    let mut p: Palette = storage::read_one(&app, &palette_id).map_err(|e| e.to_string())?;
    p.colors.retain(|c| c.id != color_id);
    p.updated_at = now_ms();
    storage::write_one(&app, &p.id, &p).map_err(|e| e.to_string())?;
    Ok(p)
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

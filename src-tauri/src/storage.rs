//! JSON file persistence for palettes.
//!
//! Each palette lives in its own file at `{app_data_dir}/palettes/{id}.json`.
//! Writes go through a temp file + atomic rename so a crash mid-write
//! can't corrupt the existing palette.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("tauri: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("palette {0} not found")]
    NotFound(String),
}

const DIR: &str = "palettes";

pub fn dir(app: &AppHandle) -> Result<PathBuf, Error> {
    let base = app.path().app_data_dir()?;
    let d = base.join(DIR);
    if !d.exists() {
        fs::create_dir_all(&d)?;
    }
    Ok(d)
}

fn file_for(app: &AppHandle, id: &str) -> Result<PathBuf, Error> {
    Ok(dir(app)?.join(format!("{id}.json")))
}

/// Read every JSON file in the palettes dir (excluding `order.json`)
/// and deserialize each into `T`. Kept as a generic helper for future
/// use; current callers should prefer [`list_palettes_ordered`].
#[allow(dead_code)]
pub fn list_all<T: for<'de> Deserialize<'de>>(app: &AppHandle) -> Result<Vec<T>, Error> {
    let d = dir(app)?;
    let mut items: Vec<T> = Vec::new();
    for entry in fs::read_dir(&d)? {
        let entry = entry?;
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) == Some("json")
            && p.file_name().and_then(|s| s.to_str()) != Some("order.json")
        {
            let bytes = fs::read(&p)?;
            match serde_json::from_slice::<T>(&bytes) {
                Ok(item) => items.push(item),
                Err(e) => log::warn!("skipping {}: {}", p.display(), e),
            }
        }
    }
    Ok(items)
}

/// Reorder palettes by writing an explicit id list to `order.json`.
/// `list_palettes_ordered` consults this file when sorting; the file is
/// auto-healed on delete and on missing ids, so callers never need to
/// prune it manually.
pub fn write_order(app: &AppHandle, ids: &[String]) -> Result<(), Error> {
    let path = order_file(app)?;
    let bytes = serde_json::to_vec_pretty(ids)?;
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn read_order(app: &AppHandle) -> Result<Vec<String>, Error> {
    let path = order_file(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path)?;
    let ids: Vec<String> = serde_json::from_slice(&bytes)?;
    Ok(ids)
}

fn order_file(app: &AppHandle) -> Result<PathBuf, Error> {
    Ok(dir(app)?.join("order.json"))
}

/// Return all palettes, sorted according to `order.json` when present.
/// Any palette file on disk that isn't named in the order list is
/// appended at the end. Stale ids in the order list are silently
/// dropped — keeps the file self-healing after deletes.
pub fn list_palettes_ordered(app: &AppHandle) -> Result<Vec<crate::palette::Palette>, Error> {
    use std::collections::HashMap;
    let d = dir(app)?;
    let mut map: HashMap<String, crate::palette::Palette> = HashMap::new();
    for entry in fs::read_dir(&d)? {
        let entry = entry?;
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let name = match p.file_name().and_then(|s| s.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if name == "order.json" {
            continue;
        }
        let bytes = fs::read(&p)?;
        match serde_json::from_slice::<crate::palette::Palette>(&bytes) {
            Ok(item) => {
                map.insert(item.id.clone(), item);
            }
            Err(e) => log::warn!("skipping {}: {}", p.display(), e),
        }
    }
    let order = read_order(app).unwrap_or_default();
    let mut out: Vec<crate::palette::Palette> = Vec::with_capacity(map.len());
    for id in &order {
        if let Some(item) = map.remove(id) {
            out.push(item);
        }
    }
    // Append any palette not in the order file (e.g. just created
    // before its order entry was written, or imported from elsewhere).
    let mut remaining: Vec<crate::palette::Palette> = map.into_values().collect();
    remaining.sort_by_key(|p| p.created_at);
    out.extend(remaining);
    Ok(out)
}

pub fn read_one<T: for<'de> Deserialize<'de>>(app: &AppHandle, id: &str) -> Result<T, Error> {
    let path = file_for(app, id)?;
    if !path.exists() {
        return Err(Error::NotFound(id.to_string()));
    }
    let bytes = fs::read(&path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub fn write_one<T: Serialize>(app: &AppHandle, id: &str, value: &T) -> Result<(), Error> {
    let path = file_for(app, id)?;
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)?;
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn delete_one(app: &AppHandle, id: &str) -> Result<(), Error> {
    let path = file_for(app, id)?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

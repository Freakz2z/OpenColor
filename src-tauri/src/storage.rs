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

pub fn list_all<T: for<'de> Deserialize<'de>>(app: &AppHandle) -> Result<Vec<T>, Error> {
    let d = dir(app)?;
    let mut out: Vec<T> = Vec::new();
    for entry in fs::read_dir(&d)? {
        let entry = entry?;
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) == Some("json") {
            let bytes = fs::read(&p)?;
            match serde_json::from_slice::<T>(&bytes) {
                Ok(item) => out.push(item),
                Err(e) => log::warn!("skipping {}: {}", p.display(), e),
            }
        }
    }
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

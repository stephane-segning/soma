//! Replaces `command-registry/settings-storage-handlers.ts` +
//! `controllers/db-storage-controller.ts` + `controllers/settings-controller.ts`.
//!
//! Channel names follow the existing Electron preload bridge contract:
//! * `db_storage_*` for the renderer-side TanStack DB collection
//! * `settings_get` / `settings_set` for app-wide preferences
//!
//! Settings values cross the IPC boundary as **JSON-encoded strings**
//! instead of raw `serde_json::Value`: that keeps the wire schema
//! specta-friendly (specta's built-in `serde_json::Value` impl recurses
//! on itself, which the typescript exporter can't traverse). Renderers
//! `JSON.stringify` before sending and `JSON.parse` on receive — a tiny
//! cost for a single source of truth in the SDK.

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::app_store::AppStore;
use serde::Deserialize;
use specta::Type;

// --- TanStack DB key/value storage -----------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn db_storage_get(app: tauri::AppHandle, key: String) -> DesktopResult<Option<String>> {
    Ok(AppStore::open(&app)?.react_db_get(&key))
}

#[tauri::command]
#[specta::specta]
pub async fn db_storage_set(app: tauri::AppHandle, key: String, value: String) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_set(&key, value)
}

#[tauri::command]
#[specta::specta]
pub async fn db_storage_remove(app: tauri::AppHandle, key: String) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_remove(&key)
}

#[tauri::command]
#[specta::specta]
pub async fn db_storage_clear(app: tauri::AppHandle) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_clear()
}

#[tauri::command]
#[specta::specta]
pub async fn db_storage_keys(app: tauri::AppHandle) -> DesktopResult<Vec<String>> {
    Ok(AppStore::open(&app)?.react_db_keys())
}

// --- App-wide settings -----------------------------------------------------
//
// Args use JSON-encoded strings (`valueJson`) instead of raw JSON values so
// the wire schema is specta-safe. Renderers must `JSON.stringify` before
// sending and `JSON.parse` on receive.

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsGetArgs {
    pub key: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSetArgs {
    pub key: String,
    pub value_json: String,
}

fn from_str(s: &str) -> DesktopResult<serde_json::Value> {
    serde_json::from_str(s).map_err(|e| DesktopError::invalid(format!("invalid JSON value: {e}")))
}

fn to_str(v: &serde_json::Value) -> DesktopResult<String> {
    serde_json::to_string(v).map_err(|e| DesktopError::other(format!("serialize: {e}")))
}

#[tauri::command]
#[specta::specta]
pub async fn settings_get(app: tauri::AppHandle, args: SettingsGetArgs) -> DesktopResult<Option<String>> {
    let store = AppStore::open(&app)?;
    let Some(value) = store.setting(&args.key) else {
        return Ok(None);
    };
    Ok(Some(to_str(&value)?))
}

#[tauri::command]
#[specta::specta]
pub async fn settings_set(app: tauri::AppHandle, args: SettingsSetArgs) -> DesktopResult<()> {
    let value = from_str(&args.value_json)?;
    AppStore::open(&app)?.set_setting(&args.key, value)
}

#[tauri::command]
#[specta::specta]
pub async fn settings_get_all(app: tauri::AppHandle) -> DesktopResult<String> {
    to_str(&serde_json::Value::Object(AppStore::open(&app)?.settings()))
}

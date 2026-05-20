//! Replaces `command-registry/settings-storage-handlers.ts` +
//! `controllers/db-storage-controller.ts` + `controllers/settings-controller.ts`.
//!
//! Channel names follow the existing Electron preload bridge contract:
//! * `db_storage_*` for the renderer-side TanStack DB collection
//! * `settings_get` / `settings_set` for app-wide preferences

use desktop_core::error::DesktopResult;
use desktop_services::app_store::AppStore;
use serde::Deserialize;
use serde_json::Value;
use tauri::Runtime;

// --- TanStack DB key/value storage -----------------------------------------

#[tauri::command]
pub async fn db_storage_get<R: Runtime>(app: tauri::AppHandle<R>, key: String) -> DesktopResult<Option<String>> {
    Ok(AppStore::open(&app)?.react_db_get(&key))
}

#[tauri::command]
pub async fn db_storage_set<R: Runtime>(app: tauri::AppHandle<R>, key: String, value: String) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_set(&key, value)
}

#[tauri::command]
pub async fn db_storage_remove<R: Runtime>(app: tauri::AppHandle<R>, key: String) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_remove(&key)
}

#[tauri::command]
pub async fn db_storage_clear<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_clear()
}

#[tauri::command]
pub async fn db_storage_keys<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<Vec<String>> {
    Ok(AppStore::open(&app)?.react_db_keys())
}

// --- App-wide settings -----------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsGetArgs {
    pub key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSetArgs {
    pub key: String,
    pub value: Value,
}

#[tauri::command]
pub async fn settings_get<R: Runtime>(app: tauri::AppHandle<R>, args: SettingsGetArgs) -> DesktopResult<Option<Value>> {
    Ok(AppStore::open(&app)?.setting(&args.key))
}

#[tauri::command]
pub async fn settings_set<R: Runtime>(app: tauri::AppHandle<R>, args: SettingsSetArgs) -> DesktopResult<()> {
    AppStore::open(&app)?.set_setting(&args.key, args.value)
}

#[tauri::command]
pub async fn settings_get_all<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> DesktopResult<serde_json::Map<String, Value>> {
    Ok(AppStore::open(&app)?.settings())
}

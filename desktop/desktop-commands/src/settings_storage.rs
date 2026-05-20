//! Replaces `command-registry/settings-storage-handlers.ts` +
//! `controllers/db-storage-controller.ts` + `controllers/settings-controller.ts`.
//!
//! Channel names are kept identical to the old Electron preload bridge
//! (`db_storage_*`) so the renderer's existing call sites work after the
//! port. Settings are still stored under `settings` in the same JSON file.

use desktop_core::error::DesktopResult;
use desktop_services::app_store::AppStore;
use tauri::Runtime;

#[tauri::command]
pub async fn db_storage_get<R: Runtime>(app: tauri::AppHandle<R>, key: String) -> DesktopResult<Option<String>> {
    Ok(AppStore::open(&app)?.react_db_get(&key))
}

#[tauri::command]
pub async fn db_storage_set<R: Runtime>(app: tauri::AppHandle<R>, key: String, value: String) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_set(&key, value);
    Ok(())
}

#[tauri::command]
pub async fn db_storage_remove<R: Runtime>(app: tauri::AppHandle<R>, key: String) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_remove(&key);
    Ok(())
}

#[tauri::command]
pub async fn db_storage_clear<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<()> {
    AppStore::open(&app)?.react_db_clear();
    Ok(())
}

#[tauri::command]
pub async fn db_storage_keys<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<Vec<String>> {
    Ok(AppStore::open(&app)?.react_db_keys())
}

#[tauri::command]
pub async fn settings_get_all<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> DesktopResult<serde_json::Map<String, serde_json::Value>> {
    Ok(AppStore::open(&app)?.settings())
}

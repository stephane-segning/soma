//! `tauri-plugin-store`-backed equivalent of the previous Electron
//! `electron-store` wrapper (`app-data-store.ts`). Window-state moves to
//! `tauri-plugin-window-state` (already wired in the binary), so this store
//! only owns `settings` + the `reactDb` blob storage.
//!
//! Storage layout (single JSON file managed by the plugin, see
//! `StoreBuilder::path("soma-data.json")`):
//! ```json
//! {
//!   "settings": { ... arbitrary keyed prefs ... },
//!   "reactDb": { "<key>": "<string value>" }
//! }
//! ```

use desktop_core::error::{DesktopError, DesktopResult};
use serde_json::Value;
use std::sync::Arc;
use tauri::Runtime;
use tauri_plugin_store::{Store, StoreExt};

/// Filename for the persistent JSON store (relative to Tauri's app config dir).
pub const STORE_PATH: &str = "soma-data.json";
const KEY_SETTINGS: &str = "settings";
const KEY_REACT_DB: &str = "reactDb";

/// Thin facade over the underlying `tauri-plugin-store::Store`.
///
/// Cheap to clone; the inner `Arc<Store>` is reference-counted by the plugin.
pub struct AppStore<R: Runtime> {
    inner: Arc<Store<R>>,
}

impl<R: Runtime> Clone for AppStore<R> {
    fn clone(&self) -> Self {
        Self {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl<R: Runtime> AppStore<R> {
    pub fn open<M: tauri::Manager<R>>(app: &M) -> DesktopResult<Self> {
        let store = app.store(STORE_PATH).map_err(|e| DesktopError::other(e))?;
        Ok(Self { inner: store })
    }

    // --- settings ----------------------------------------------------------

    pub fn settings(&self) -> serde_json::Map<String, Value> {
        match self.inner.get(KEY_SETTINGS) {
            Some(Value::Object(map)) => map,
            _ => serde_json::Map::new(),
        }
    }

    pub fn set_settings(&self, value: serde_json::Map<String, Value>) {
        self.inner.set(KEY_SETTINGS, Value::Object(value));
    }

    pub fn setting(&self, key: &str) -> Option<Value> {
        self.settings().remove(key)
    }

    pub fn set_setting(&self, key: &str, value: Value) {
        let mut current = self.settings();
        current.insert(key.to_string(), value);
        self.set_settings(current);
    }

    // --- react-db key/value ------------------------------------------------

    pub fn react_db_get(&self, key: &str) -> Option<String> {
        match self.inner.get(KEY_REACT_DB) {
            Some(Value::Object(map)) => map.get(key).and_then(|v| v.as_str().map(str::to_owned)),
            _ => None,
        }
    }

    pub fn react_db_set(&self, key: &str, value: String) {
        let mut current = match self.inner.get(KEY_REACT_DB) {
            Some(Value::Object(map)) => map,
            _ => serde_json::Map::new(),
        };
        current.insert(key.to_string(), Value::String(value));
        self.inner.set(KEY_REACT_DB, Value::Object(current));
    }

    pub fn react_db_remove(&self, key: &str) {
        let Some(Value::Object(mut map)) = self.inner.get(KEY_REACT_DB) else {
            return;
        };
        map.remove(key);
        self.inner.set(KEY_REACT_DB, Value::Object(map));
    }

    pub fn react_db_clear(&self) {
        self.inner.set(KEY_REACT_DB, Value::Object(serde_json::Map::new()));
    }

    pub fn react_db_keys(&self) -> Vec<String> {
        match self.inner.get(KEY_REACT_DB) {
            Some(Value::Object(map)) => map.keys().cloned().collect(),
            _ => Vec::new(),
        }
    }
}

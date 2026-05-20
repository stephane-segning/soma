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
//!
//! Every mutation calls `Store::save()` so the JSON file is durable on
//! disk before the call returns — `tauri-plugin-store` only writes to disk
//! when `save()` is invoked (or auto-save is configured at plugin init),
//! and we'd rather pay the small fs cost per mutation than risk silent
//! data loss on shutdown. Lookups use the plugin's dot-notation, so we
//! never clone the parent map just to read one field.

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
        let store = app.store(STORE_PATH).map_err(DesktopError::other)?;
        Ok(Self { inner: store })
    }

    fn persist(&self) -> DesktopResult<()> {
        self.inner.save().map_err(DesktopError::other)
    }

    // --- settings ----------------------------------------------------------

    pub fn settings(&self) -> serde_json::Map<String, Value> {
        match self.inner.get(KEY_SETTINGS) {
            Some(Value::Object(map)) => map,
            _ => serde_json::Map::new(),
        }
    }

    pub fn set_settings(&self, value: serde_json::Map<String, Value>) -> DesktopResult<()> {
        self.inner.set(KEY_SETTINGS, Value::Object(value));
        self.persist()
    }

    /// Lookup a single setting via the plugin's dot-notation — avoids
    /// cloning the whole settings map.
    pub fn setting(&self, key: &str) -> Option<Value> {
        self.inner.get(format!("{KEY_SETTINGS}.{key}"))
    }

    pub fn set_setting(&self, key: &str, value: Value) -> DesktopResult<()> {
        let mut current = self.settings();
        current.insert(key.to_string(), value);
        self.inner.set(KEY_SETTINGS, Value::Object(current));
        self.persist()
    }

    // --- react-db key/value ------------------------------------------------

    pub fn react_db_get(&self, key: &str) -> Option<String> {
        self.inner
            .get(format!("{KEY_REACT_DB}.{key}"))
            .and_then(|v| v.as_str().map(str::to_owned))
    }

    pub fn react_db_set(&self, key: &str, value: String) -> DesktopResult<()> {
        let mut current = match self.inner.get(KEY_REACT_DB) {
            Some(Value::Object(map)) => map,
            _ => serde_json::Map::new(),
        };
        current.insert(key.to_string(), Value::String(value));
        self.inner.set(KEY_REACT_DB, Value::Object(current));
        self.persist()
    }

    pub fn react_db_remove(&self, key: &str) -> DesktopResult<()> {
        let Some(Value::Object(mut map)) = self.inner.get(KEY_REACT_DB) else {
            return Ok(());
        };
        map.remove(key);
        self.inner.set(KEY_REACT_DB, Value::Object(map));
        self.persist()
    }

    pub fn react_db_clear(&self) -> DesktopResult<()> {
        self.inner.set(KEY_REACT_DB, Value::Object(serde_json::Map::new()));
        self.persist()
    }

    pub fn react_db_keys(&self) -> Vec<String> {
        match self.inner.get(KEY_REACT_DB) {
            Some(Value::Object(map)) => map.keys().cloned().collect(),
            _ => Vec::new(),
        }
    }
}

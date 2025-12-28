use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;

use crate::error::AppResult;
use crate::state::ManagedState;

#[derive(Clone)]
pub struct SettingsController {
    state: ManagedState,
    cache: ArcMutex<HashMap<String, serde_json::Value>>,
}

#[derive(Default, Clone)]
struct ArcMutex<T>(std::sync::Arc<Mutex<T>>);

impl<T> ArcMutex<T> {
    fn new(value: T) -> Self {
        Self(std::sync::Arc::new(Mutex::new(value)))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, T> {
        self.0.lock().expect("settings mutex poisoned")
    }
}

impl SettingsController {
    pub fn new(state: ManagedState) -> Self {
        Self {
            state,
            cache: ArcMutex::new(HashMap::new()),
        }
    }

    pub fn get_last_route(&self) -> AppResult<Option<String>> {
        self.state.store.load(&self.state.app).map(|s| s.last_route)
    }

    pub fn get(&self, params: SettingsGetParams) -> AppResult<Option<serde_json::Value>> {
        let cache = self.cache.lock();
        Ok(cache.get(&params.key).cloned())
    }

    pub fn set(&self, params: SettingsSetParams) -> AppResult<()> {
        let mut cache = self.cache.lock();
        cache.insert(params.key, params.value);
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsGetParams {
    pub key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSetParams {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsLastRouteParams {}

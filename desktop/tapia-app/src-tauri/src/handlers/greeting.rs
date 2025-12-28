use serde::Deserialize;

use crate::error::AppResult;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GreetParams {
    pub name: String,
}

#[derive(Clone, Default)]
pub struct GreetingController;

impl GreetingController {
    pub fn new() -> Self {
        Self
    }

    pub fn greet(&self, params: GreetParams) -> AppResult<String> {
        Ok(format!(
            "Hello, {}! You've been greeted from Rust!",
            params.name
        ))
    }
}

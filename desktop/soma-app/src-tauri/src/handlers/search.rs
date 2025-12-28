use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Clone)]
pub struct SearchController;

impl SearchController {
    pub fn new() -> Self {
        Self
    }

    pub fn search(&self, params: SearchParams) -> AppResult<Vec<SearchResult>> {
        let trimmed = params.query.trim();
        if trimmed.is_empty() {
            return Ok(vec![]);
        }
        // TODO: daemon-backed search not implemented yet.
        Ok(vec![])
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
}

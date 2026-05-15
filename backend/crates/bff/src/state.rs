use crate::llm::LlmClient;
use std::sync::Arc;
use std::time::Instant;

#[derive(Clone)]
pub(crate) struct BffState {
    pub(crate) started_at: Instant,
    pub(crate) llm: Arc<LlmClient>,
}

impl Default for BffState {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
            llm: Arc::new(LlmClient::from_env()),
        }
    }
}

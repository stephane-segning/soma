//! Background-task store. Mirrors
//! `desktop/soma/src/main/services/agent-client/background-tasks.ts`.
//!
//! Behind a trait so we can swap the in-memory store for a daemon-backed
//! one without touching `AgentService`.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use desktop_core::error::{DesktopError, DesktopResult};
use tokio::sync::Mutex;

use crate::types::{
    BackgroundTask, BackgroundTaskKind, BackgroundTaskStatus, ChatMessage, ChatRole,
    EnqueueBackgroundTaskParams, ListBackgroundTasksParams, now_ms,
};

#[derive(Debug, Default, Clone)]
pub struct TaskPatch {
    pub status: Option<BackgroundTaskStatus>,
    pub result_text: Option<String>,
    pub error: Option<String>,
}

#[async_trait]
pub trait TaskStore: Send + Sync {
    async fn insert(&self, task: BackgroundTask);
    async fn get(&self, task_id: &str) -> Option<BackgroundTask>;
    async fn update(&self, task_id: &str, patch: TaskPatch);
    async fn list(&self, filter: &ListBackgroundTasksParams) -> Vec<BackgroundTask>;
}

pub struct InMemoryTaskStore {
    inner: Mutex<HashMap<String, BackgroundTask>>,
}

impl InMemoryTaskStore {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }
}

impl Default for InMemoryTaskStore {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl TaskStore for InMemoryTaskStore {
    async fn insert(&self, task: BackgroundTask) {
        self.inner.lock().await.insert(task.task_id.clone(), task);
    }

    async fn get(&self, task_id: &str) -> Option<BackgroundTask> {
        self.inner.lock().await.get(task_id).cloned()
    }

    async fn update(&self, task_id: &str, patch: TaskPatch) {
        let mut guard = self.inner.lock().await;
        let Some(task) = guard.get_mut(task_id) else { return };
        if let Some(status) = patch.status {
            task.status = status;
        }
        if let Some(result_text) = patch.result_text {
            task.result_text = result_text;
        }
        if let Some(error) = patch.error {
            task.error = error;
        }
        task.updated_at_ms = now_ms();
    }

    async fn list(&self, filter: &ListBackgroundTasksParams) -> Vec<BackgroundTask> {
        let limit = filter.limit.unwrap_or(50).max(1);
        let guard = self.inner.lock().await;
        let mut tasks: Vec<BackgroundTask> = guard
            .values()
            .filter(|t| filter.space_id.as_deref().map_or(true, |id| t.space_id == id))
            .cloned()
            .collect();
        tasks.sort_by_key(|t| std::cmp::Reverse(t.created_at_ms));
        tasks.truncate(limit);
        tasks
    }
}

pub type SharedTaskStore = Arc<dyn TaskStore>;

/// Build the chat-message prompt for a queued task. Pure function; called
/// when the processor dequeues a task.
pub fn task_messages(task: &BackgroundTask) -> Vec<ChatMessage> {
    let selection = task.selection_text.trim().to_owned();
    let system = match task.kind {
        BackgroundTaskKind::ExplainSelection => "Explain the selected text clearly and concisely. Avoid filler.",
        BackgroundTaskKind::ExpandSelection => {
            "Expand the selected text into richer, accurate prose that can be inserted directly into the document. Return only the expanded text."
        }
        BackgroundTaskKind::ResearchSelection => {
            "Research and synthesize the selected text using the configured model provider. Return concise findings, useful context, and any uncertainty. Do not claim external web access unless the provider actually has it."
        }
    };
    vec![
        ChatMessage { role: ChatRole::System, content: system.into() },
        ChatMessage { role: ChatRole::User, content: selection },
    ]
}

pub fn validate_enqueue(params: &EnqueueBackgroundTaskParams) -> DesktopResult<()> {
    if params.space_id.trim().is_empty() {
        return Err(DesktopError::invalid("spaceId is required"));
    }
    if params.document_id.trim().is_empty() {
        return Err(DesktopError::invalid("documentId is required"));
    }
    if params.selection_text.trim().is_empty() {
        return Err(DesktopError::invalid("selectionText is required"));
    }
    Ok(())
}

pub fn new_queued_task(params: &EnqueueBackgroundTaskParams) -> BackgroundTask {
    let now = now_ms();
    BackgroundTask {
        task_id: cuid2::create_id(),
        kind: params.kind,
        status: BackgroundTaskStatus::Queued,
        space_id: params.space_id.clone(),
        document_id: params.document_id.clone(),
        selection_text: params.selection_text.clone(),
        persist_in_document: params.persist_in_document,
        result_text: String::new(),
        error: String::new(),
        created_at_ms: now,
        updated_at_ms: now,
    }
}

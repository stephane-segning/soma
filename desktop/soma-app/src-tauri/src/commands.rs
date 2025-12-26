use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use anyhow;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use soma_proto_build::daemon::{UploadBlobRequest, UpsertDocumentRequest};
use tauri::{AppHandle, State};

use crate::{error::AppError, state::ManagedState};

type CmdResult<T> = Result<T, String>;

pub trait CommandHandler: Send + Sync + 'static {
    fn remember_route(&self, app: &AppHandle, route: String) -> anyhow::Result<()>;
}

pub struct AppCommandHandler {
    state: ManagedState,
}

impl AppCommandHandler {
    pub fn new(state: ManagedState) -> Self {
        Self { state }
    }
}

impl CommandHandler for AppCommandHandler {
    fn remember_route(&self, app: &AppHandle, route: String) -> anyhow::Result<()> {
        self.state.store.persist_route(app, route)
    }
}

#[derive(Clone)]
pub struct CommandState {
    handler: Arc<dyn CommandHandler>,
}

impl CommandState {
    pub fn new(handler: Arc<dyn CommandHandler>) -> Self {
        Self { handler }
    }
}

#[tauri::command]
pub async fn remember_route(
    app: tauri::AppHandle,
    state: State<'_, CommandState>,
    route: String,
) -> Result<(), String> {
    state
        .handler
        .remember_route(&app, route)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn documents_upsert_draft(
    state: State<'_, ManagedState>,
    space_id: String,
    document_id: String,
    content_json: String,
    published: bool,
    updated_at_ms: i64,
) -> CmdResult<()> {
    let payload = UpsertDocumentRequest {
        space_id: space_id.clone(),
        document_id: document_id.clone(),
        content_json: content_json.clone(),
        published,
        updated_at_ms,
    };
    state
        .daemon
        .upsert_document(payload)
        .await
        .map(|_| ())
        .map_err(AppError::into_cmd_error)
        .map(|_| {
            persist_draft_record(DraftRecord {
                space_id,
                document_id,
                content_json,
                published: if published { 1 } else { 0 },
                updated_at_ms,
            });
        })
}

#[tauri::command]
pub async fn documents_queue_daemon_sync(
    state: State<'_, ManagedState>,
    space_id: String,
    document_id: String,
    content_json: String,
    updated_at_ms: i64,
    published: Option<bool>,
) -> CmdResult<()> {
    let payload = UpsertDocumentRequest {
        space_id: space_id.clone(),
        document_id: document_id.clone(),
        content_json: content_json.clone(),
        published: published.unwrap_or(true),
        updated_at_ms,
    };
    let published_flag = if payload.published { 1 } else { 0 };
    state
        .daemon
        .upsert_document(payload)
        .await
        .map(|_| ())
        .map_err(AppError::into_cmd_error)
        .map(|_| {
            persist_draft_record(DraftRecord {
                space_id,
                document_id,
                content_json,
                published: published_flag,
                updated_at_ms,
            });
        })
}

#[tauri::command]
pub async fn documents_sync_published(
    state: State<'_, ManagedState>,
    space_id: String,
    document_id: String,
    content_json: String,
    updated_at_ms: i64,
) -> CmdResult<i32> {
    let payload = UpsertDocumentRequest {
        space_id: space_id.clone(),
        document_id: document_id.clone(),
        content_json: content_json.clone(),
        published: true,
        updated_at_ms,
    };
    state
        .daemon
        .upsert_document(payload)
        .await
        .map(|_| 1)
        .map_err(AppError::into_cmd_error)
        .map(|uploaded| {
            persist_draft_record(DraftRecord {
                space_id,
                document_id,
                content_json,
                published: 1,
                updated_at_ms,
            });
            uploaded
        })
}

#[tauri::command]
pub async fn blobs_stage(
    state: State<'_, ManagedState>,
    space_id: String,
    doc_id: Option<String>,
    bytes: Vec<u8>,
    mime: String,
    file_name: Option<String>,
) -> CmdResult<BlobStageResult> {
    let space = space_id.clone();
    let payload = UploadBlobRequest {
        space_id: space_id.clone(),
        data: bytes.clone(),
        mime,
        name: file_name.unwrap_or_else(|| "blob".to_string()),
        doc_id: doc_id.unwrap_or_default(),
    };
    let res = state
        .daemon
        .upload_blob(payload)
        .await
        .map_err(AppError::into_cmd_error)?;

    Ok(BlobStageResult {
        cid: res.cid.clone(),
        size: res.size,
        mime: res.mime.clone(),
        name: res.name.clone(),
        url: format!("soma-blob://daemon/{}/{}", space, res.cid),
    })
}

#[derive(Default)]
struct DocCache {
    drafts: HashMap<String, DraftRecord>,
    pages: HashMap<String, PageRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRecord {
    space_id: String,
    document_id: String,
    content_json: String,
    published: i32,
    updated_at_ms: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRecord {
    space_id: String,
    page_id: String,
    title: String,
    parent_page_ids: Vec<String>,
    created_at_ms: i64,
    updated_at_ms: i64,
}

static DOC_CACHE: OnceLock<Mutex<DocCache>> = OnceLock::new();

#[derive(Serialize)]
pub struct BlobStageResult {
    cid: String,
    size: u64,
    mime: String,
    name: String,
    url: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEvent {
    pub token: Option<String>,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
}

struct SomaChat;

impl SomaChat {
    const DEFAULT_SYSTEM_PROMPT: &'static str =
        "You’re the Soma assistant. Keep replies concise and helpful.";

    fn build_request(
        messages: Vec<ChatMessage>,
        model: Option<String>,
        temperature: Option<f32>,
        max_tokens: Option<u64>,
    ) -> Result<soma_proto_build::agent::ChatRequest, AppError> {
        let system = Self::extract_system(&messages);
        let mut out_messages = Vec::new();
        out_messages.push(soma_proto_build::agent::ChatMessage {
            role: "system".to_string(),
            content: system,
        });

        for msg in messages {
            let role = msg.role.trim().to_lowercase();
            if role == "system" {
                continue;
            }
            let content = msg.content.trim().to_string();
            if content.is_empty() {
                continue;
            }
            let normalized_role = match role.as_str() {
                "assistant" => "assistant",
                "user" => "user",
                _ => "user",
            };
            out_messages.push(soma_proto_build::agent::ChatMessage {
                role: normalized_role.to_string(),
                content,
            });
        }

        if !out_messages.iter().any(|m| m.role == "user") {
            return Err(AppError::Agent("no user message provided".to_string()));
        }

        Ok(soma_proto_build::agent::ChatRequest {
            model: model.unwrap_or_default(),
            messages: out_messages,
            temperature: temperature.unwrap_or(0.7),
            max_tokens: max_tokens.unwrap_or(256),
        })
    }

    fn extract_system(messages: &[ChatMessage]) -> String {
        messages
            .iter()
            .find(|m| m.role.trim().eq_ignore_ascii_case("system"))
            .map(|m| m.content.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| Self::DEFAULT_SYSTEM_PROMPT.to_string())
    }

    fn normalize_response(content: String) -> String {
        content.trim().to_string()
    }
}

#[tauri::command]
pub async fn agent_chat_stream(
    state: State<'_, ManagedState>,
    messages: Vec<ChatMessage>,
    model: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u64>,
) -> Result<ChatStreamEvent, String> {
    if messages.is_empty() {
        return Ok(ChatStreamEvent {
            token: None,
            done: true,
            error: Some("no messages provided".to_string()),
        });
    }

    let req = SomaChat::build_request(messages, model, temperature, max_tokens)
        .map_err(|e| e.to_string())?;

    match state.agent.chat(req).await {
        Ok(resp) => {
            let content = SomaChat::normalize_response(resp.content);
            Ok(ChatStreamEvent {
                token: Some(content),
                done: true,
                error: None,
            })
        }
        Err(err) => Ok(ChatStreamEvent {
            token: None,
            done: true,
            error: Some(err.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn search(query: String) -> Result<Vec<SearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }
    // Placeholder: daemon-backed search not implemented yet.
    Ok(vec![])
}

fn doc_cache() -> &'static Mutex<DocCache> {
    DOC_CACHE.get_or_init(|| Mutex::new(DocCache::default()))
}

fn cache_key(space: &str, id: &str) -> String {
    format!("{space}::{id}")
}

fn persist_draft_record(record: DraftRecord) {
    let mut cache = doc_cache().lock().unwrap();
    let key = cache_key(&record.space_id, &record.document_id);
    cache.drafts.insert(key, record);
}

#[tauri::command]
pub async fn documents_get_draft(
    _state: State<'_, ManagedState>,
    space_id: String,
    document_id: String,
) -> Result<Option<DraftRecord>, String> {
    let key = cache_key(&space_id, &document_id);
    let cache = doc_cache().lock().unwrap();
    Ok(cache.drafts.get(&key).cloned())
}

#[tauri::command]
pub async fn documents_ensure_page(
    _state: State<'_, ManagedState>,
    space_id: String,
    page_id: String,
    title: Option<String>,
    parent_page_ids: Option<Vec<String>>,
    created_at_ms: Option<i64>,
    updated_at_ms: Option<i64>,
) -> Result<PageRecord, String> {
    let mut cache = doc_cache().lock().unwrap();
    let key = cache_key(&space_id, &page_id);
    let existing = cache.pages.get(&key).cloned();
    let now = Utc::now().timestamp_millis();
    let record = PageRecord {
        space_id,
        page_id,
        title: title.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|p| p.title.clone())
                .unwrap_or_else(|| "Untitled page".to_string())
        }),
        parent_page_ids: parent_page_ids.unwrap_or_else(|| {
            existing
                .as_ref()
                .map(|p| p.parent_page_ids.clone())
                .unwrap_or_default()
        }),
        created_at_ms: created_at_ms
            .unwrap_or_else(|| existing.map(|p| p.created_at_ms).unwrap_or(now)),
        updated_at_ms: updated_at_ms.unwrap_or(now),
    };
    cache.pages.insert(key, record.clone());
    Ok(record)
}

#[tauri::command]
pub async fn documents_list_pages(
    _state: State<'_, ManagedState>,
    space_id: String,
) -> Result<Vec<PageRecord>, String> {
    let cache = doc_cache().lock().unwrap();
    Ok(cache
        .pages
        .values()
        .filter(|p| p.space_id == space_id)
        .cloned()
        .collect())
}

#[tauri::command]
pub async fn documents_update_page_title(
    _state: State<'_, ManagedState>,
    space_id: String,
    page_id: String,
    title: String,
) -> Result<Option<PageRecord>, String> {
    let mut cache = doc_cache().lock().unwrap();
    let key = cache_key(&space_id, &page_id);
    if let Some(record) = cache.pages.get_mut(&key) {
        record.title = title.clone();
        record.updated_at_ms = Utc::now().timestamp_millis();
        return Ok(Some(record.clone()));
    }
    Ok(None)
}

#[tauri::command]
pub async fn documents_set_page_parents(
    _state: State<'_, ManagedState>,
    space_id: String,
    page_id: String,
    parent_page_ids: Vec<String>,
) -> Result<Option<PageRecord>, String> {
    let mut cache = doc_cache().lock().unwrap();
    let key = cache_key(&space_id, &page_id);
    if let Some(record) = cache.pages.get_mut(&key) {
        record.parent_page_ids = parent_page_ids;
        record.updated_at_ms = Utc::now().timestamp_millis();
        return Ok(Some(record.clone()));
    }
    Ok(None)
}

#[tauri::command]
pub async fn settings_get_last_route(
    app: AppHandle,
    state: State<'_, ManagedState>,
) -> Result<Option<String>, String> {
    state
        .store
        .load(&app)
        .map(|s| s.last_route)
        .map_err(|e| e.to_string())
}

static SETTINGS: OnceLock<Mutex<HashMap<String, serde_json::Value>>> = OnceLock::new();

fn settings_store() -> &'static Mutex<HashMap<String, serde_json::Value>> {
    SETTINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
pub async fn settings_get(key: String) -> Result<Option<serde_json::Value>, String> {
    let cache = settings_store().lock().unwrap();
    Ok(cache.get(&key).cloned())
}

#[tauri::command]
pub async fn settings_set(key: String, value: serde_json::Value) -> Result<(), String> {
    let mut cache = settings_store().lock().unwrap();
    cache.insert(key, value);
    Ok(())
}

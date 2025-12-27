use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::error::AppResult;
use crate::handlers::handler::SomaHandler;
use crate::handlers::remember::{RememberHandler, RememberRouteParams};
use crate::{error::AppError, state::ManagedState};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use soma_proto_build::daemon::{
    CreateSpaceRequest, DeleteSpaceRequest, GetSpaceRequest, ListSpacesRequest, UpdateSpaceRequest,
    UploadBlobRequest, UpsertDocumentRequest,
};
use tauri::{AppHandle, State};
use tracing::{debug, info};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDto {
    pub space_id: String,
    pub display_name: String,
    pub owner_peer_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacesListResponse {
    pub spaces: Vec<SpaceDto>,
    pub limit: u32,
    pub offset: u32,
    pub next_offset: Option<u32>,
}

#[tauri::command]
pub async fn remember_route(
    state: State<'_, SomaHandler>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<()> {
    let tauri::ipc::InvokeBody::Json(data) = request.body() else {
        return Err(AppError::BadRequest(
            "Request body was not JSON".to_string(),
        ));
    };

    let body: RememberRouteParams = serde_json::from_value(data.clone())?;
    debug!("Remember route: {:?}", body);
    state.remember_route(body)
}

#[tauri::command]
pub async fn documents_upsert_draft(
    state: State<'_, ManagedState>,
    space_id: String,
    document_id: String,
    content_json: String,
    published: bool,
    updated_at_ms: i64,
) -> AppResult<()> {
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
) -> AppResult<()> {
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
pub async fn spaces_list(
    state: State<'_, ManagedState>,
    limit: Option<u32>,
    offset: Option<u32>,
    q: Option<String>,
) -> AppResult<SpacesListResponse> {
    let payload = ListSpacesRequest {
        limit: limit.unwrap_or(50),
        offset: offset.unwrap_or(0),
        q,
    };

    state
        .daemon
        .list_spaces(payload)
        .await
        .map(|res| SpacesListResponse {
            spaces: res
                .spaces
                .into_iter()
                .map(|s| SpaceDto {
                    space_id: s.space_id,
                    display_name: s.display_name,
                    owner_peer_id: s.owner_peer_id,
                    created_at: s.created_at,
                })
                .collect(),
            limit: res.limit,
            offset: res.offset,
            next_offset: res.next_offset,
        })
}

#[tauri::command]
pub async fn spaces_create(
    state: State<'_, ManagedState>,
    space_id: Option<String>,
    display_name: Option<String>,
) -> AppResult<SpaceDto> {
    let payload = CreateSpaceRequest {
        space_id: space_id.unwrap_or_default(),
        display_name: display_name.clone().unwrap_or_default(),
    };

    state
        .daemon
        .create_space(payload)
        .await
        .map(|res| SpaceDto {
            space_id: res.space_id,
            display_name: display_name.unwrap_or_default(),
            owner_peer_id: res.owner_peer_id,
            created_at: chrono::Utc::now().timestamp(),
        })
}

#[tauri::command]
pub async fn spaces_get(state: State<'_, ManagedState>, space_id: String) -> AppResult<SpaceDto> {
    let payload = GetSpaceRequest { space_id };
    state.daemon.get_space(payload).await.map(|res| {
        let space = res.space.unwrap_or_default();
        SpaceDto {
            space_id: space.space_id,
            display_name: space.display_name,
            owner_peer_id: space.owner_peer_id,
            created_at: space.created_at,
        }
    })
}

#[tauri::command]
pub async fn spaces_update(
    state: State<'_, ManagedState>,
    space_id: String,
    display_name: Option<String>,
) -> AppResult<SpaceDto> {
    let payload = UpdateSpaceRequest {
        space_id,
        display_name: display_name.unwrap_or_default(),
    };

    state.daemon.update_space(payload).await.map(|res| {
        let space = res.space.unwrap_or_default();
        SpaceDto {
            space_id: space.space_id,
            display_name: space.display_name,
            owner_peer_id: space.owner_peer_id,
            created_at: space.created_at,
        }
    })
}

#[tauri::command]
pub async fn spaces_delete(state: State<'_, ManagedState>, space_id: String) -> AppResult<bool> {
    let payload = DeleteSpaceRequest { space_id };
    state
        .daemon
        .delete_space(payload)
        .await
        .map(|res| res.deleted)
}

#[tauri::command]
pub async fn documents_sync_published(
    state: State<'_, ManagedState>,
    space_id: String,
    document_id: String,
    content_json: String,
    updated_at_ms: i64,
) -> AppResult<i32> {
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
) -> AppResult<BlobStageResult> {
    let space = space_id.clone();
    let payload = UploadBlobRequest {
        space_id: space_id.clone(),
        data: bytes.clone(),
        mime,
        name: file_name.unwrap_or_else(|| "blob".to_string()),
        doc_id: doc_id.unwrap_or_default(),
    };
    let res = state.daemon.upload_blob(payload).await?;

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

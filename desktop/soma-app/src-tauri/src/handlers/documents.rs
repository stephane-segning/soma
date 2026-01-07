use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use soma_proto_build::daemon::UpsertDocumentRequest;

use crate::error::AppResult;
use crate::state::ManagedState;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRecord {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: i32,
    pub updated_at_ms: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRecord {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Default)]
struct DocCache {
    drafts: HashMap<String, DraftRecord>,
    pages: HashMap<String, PageRecord>,
}

#[derive(Clone)]
pub struct DocumentsController {
    state: ManagedState,
    cache: Arc<Mutex<DocCache>>,
}

impl DocumentsController {
    pub fn new(state: ManagedState) -> Self {
        Self {
            state,
            cache: Arc::new(Mutex::new(DocCache::default())),
        }
    }

    pub async fn upsert_draft(&self, params: UpsertDraftParams) -> AppResult<()> {
        let updated_at_ms = params
            .updated_at_ms
            .unwrap_or_else(|| Utc::now().timestamp_millis());

        self.persist_draft_record(DraftRecord {
            space_id: params.space_id,
            document_id: params.document_id,
            content_json: params.content_json,
            published: if params.published { 1 } else { 0 },
            updated_at_ms,
        });

        Ok(())
    }

    pub async fn queue_daemon_sync(&self, params: QueueDaemonSyncParams) -> AppResult<()> {
        let QueueDaemonSyncParams {
            space_id,
            document_id,
            content_json,
            updated_at_ms,
            published,
        } = params;

        let published = published.unwrap_or(true);
        let published_flag = if published { 1 } else { 0 };

        self.persist_draft_record(DraftRecord {
            space_id: space_id.clone(),
            document_id: document_id.clone(),
            content_json: content_json.clone(),
            published: published_flag,
            updated_at_ms,
        });

        let payload = UpsertDocumentRequest {
            space_id,
            document_id,
            content_json,
            published,
            updated_at_ms,
        };

        self.state.daemon.upsert_document(payload).await.map(|_| ())
    }

    pub async fn sync_published(&self, params: SyncPublishedParams) -> AppResult<i32> {
        let payload = UpsertDocumentRequest {
            space_id: params.space_id.clone(),
            document_id: params.document_id.clone(),
            content_json: params.content_json.clone(),
            published: true,
            updated_at_ms: params.updated_at_ms,
        };

        self.state.daemon.upsert_document(payload).await.map(|_| {
            self.persist_draft_record(DraftRecord {
                space_id: params.space_id,
                document_id: params.document_id,
                content_json: params.content_json,
                published: 1,
                updated_at_ms: params.updated_at_ms,
            });
            1
        })
    }

    pub fn get_draft(&self, params: GetDraftParams) -> AppResult<Option<DraftRecord>> {
        let key = cache_key(&params.space_id, &params.document_id);
        let cache = self.cache.lock().expect("doc cache mutex poisoned");
        Ok(cache.drafts.get(&key).cloned())
    }

    pub fn ensure_page(&self, params: EnsurePageParams) -> AppResult<PageRecord> {
        let mut cache = self.cache.lock().expect("doc cache mutex poisoned");
        let key = cache_key(&params.space_id, &params.page_id);
        let existing = cache.pages.get(&key).cloned();
        let now = Utc::now().timestamp_millis();
        let record = PageRecord {
            space_id: params.space_id,
            page_id: params.page_id,
            title: params
                .title
                .or_else(|| existing.as_ref().map(|p| p.title.clone()))
                .unwrap_or_else(|| "Untitled page".to_string()),
            parent_page_ids: params
                .parent_page_ids
                .or_else(|| existing.as_ref().map(|p| p.parent_page_ids.clone()))
                .unwrap_or_default(),
            created_at_ms: params
                .created_at_ms
                .or_else(|| existing.as_ref().map(|p| p.created_at_ms))
                .unwrap_or(now),
            updated_at_ms: params.updated_at_ms.unwrap_or(now),
        };
        cache.pages.insert(key, record.clone());
        Ok(record)
    }

    pub fn list_pages(&self, params: ListPagesParams) -> AppResult<Vec<PageRecord>> {
        let cache = self.cache.lock().expect("doc cache mutex poisoned");
        Ok(cache
            .pages
            .values()
            .filter(|p| p.space_id == params.space_id)
            .cloned()
            .collect())
    }

    pub fn update_page_title(
        &self,
        params: UpdatePageTitleParams,
    ) -> AppResult<Option<PageRecord>> {
        let mut cache = self.cache.lock().expect("doc cache mutex poisoned");
        let key = cache_key(&params.space_id, &params.page_id);
        if let Some(record) = cache.pages.get_mut(&key) {
            record.title = params.title;
            record.updated_at_ms = Utc::now().timestamp_millis();
            return Ok(Some(record.clone()));
        }
        Ok(None)
    }

    pub fn set_page_parents(&self, params: SetPageParentsParams) -> AppResult<Option<PageRecord>> {
        let mut cache = self.cache.lock().expect("doc cache mutex poisoned");
        let key = cache_key(&params.space_id, &params.page_id);
        if let Some(record) = cache.pages.get_mut(&key) {
            record.parent_page_ids = params.parent_page_ids;
            record.updated_at_ms = Utc::now().timestamp_millis();
            return Ok(Some(record.clone()));
        }
        Ok(None)
    }

    fn persist_draft_record(&self, record: DraftRecord) {
        let mut cache = self.cache.lock().expect("doc cache mutex poisoned");
        let key = cache_key(&record.space_id, &record.document_id);
        cache.drafts.insert(key, record);
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDraftParams {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueDaemonSyncParams {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub updated_at_ms: i64,
    pub published: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPublishedParams {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDraftParams {
    pub space_id: String,
    pub document_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsurePageParams {
    pub space_id: String,
    pub page_id: String,
    pub title: Option<String>,
    pub parent_page_ids: Option<Vec<String>>,
    pub created_at_ms: Option<i64>,
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPagesParams {
    pub space_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePageTitleParams {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPageParentsParams {
    pub space_id: String,
    pub page_id: String,
    pub parent_page_ids: Vec<String>,
}

fn cache_key(space: &str, id: &str) -> String {
    format!("{space}::{id}")
}

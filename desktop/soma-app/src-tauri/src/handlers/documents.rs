use crate::error::AppResult;

pub trait DocumentHandler {
    fn documents_upsert_draft(
        &self,
        space_id: String,
        document_id: String,
        content_json: String,
        published: bool,
        updated_at_ms: i64,
    ) -> AppResult<()>;

    fn documents_queue_daemon_sync(
        &self,
        space_id: String,
        document_id: String,
        content_json: String,
        updated_at_ms: i64,
        published: Option<bool>,
    ) -> AppResult<()>;

    fn documents_sync_published(
        &self,
        space_id: String,
        document_id: String,
        content_json: String,
        updated_at_ms: i64,
    ) -> AppResult<()>;

    fn documents_get_draft(&self, space_id: String, document_id: String) -> AppResult<()>;

    fn documents_ensure_page(
        &self,
        space_id: String,
        page_id: String,
        title: Option<String>,
        parent_page_ids: Option<Vec<String>>,
        created_at_ms: Option<i64>,
        updated_at_ms: Option<i64>,
    ) -> AppResult<()>;

    fn documents_list_pages(&self, space_id: String) -> AppResult<()>;

    fn documents_update_page_title(
        &self,
        space_id: String,
        page_id: String,
        title: String,
    ) -> AppResult<()>;

    fn documents_set_page_parents(
        &self,
        space_id: String,
        page_id: String,
        parent_page_ids: Vec<String>,
    ) -> AppResult<()>;
}

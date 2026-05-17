use std::time::{SystemTime, UNIX_EPOCH};

use soma_core::SomaResult;
use soma_storage::pages::Page;

use crate::services::pages::PagesService;

use super::{
    DaemonHandle, invalid,
    types::{EnsurePageInput, PageRecord},
};

impl DaemonHandle {
    pub async fn ensure_page(&self, input: EnsurePageInput) -> SomaResult<PageRecord> {
        let EnsurePageInput {
            space_id,
            page_id,
            title,
            parent_page_ids,
            created_at_ms,
            updated_at_ms,
        } = input;

        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, &space_id).await?;
        if page_id.is_empty() {
            return Err(invalid("page_id required"));
        }

        let now = now_ms();
        let title = if title.trim().is_empty() {
            "Untitled page".to_string()
        } else {
            title
        };

        let page = Page {
            space_id,
            page_id,
            title,
            parent_page_ids,
            created_at_ms: if created_at_ms == 0 { now } else { created_at_ms },
            updated_at_ms: if updated_at_ms == 0 { now } else { updated_at_ms },
        };

        let page = PagesService::new(self.state.repos.clone())
            .ensure_page(&page)
            .await?;
        Ok(to_page_record(page))
    }

    pub async fn list_pages(&self, space_id: &str) -> SomaResult<Vec<PageRecord>> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, space_id).await?;

        let pages = PagesService::new(self.state.repos.clone())
            .list_pages(space_id)
            .await?;
        Ok(pages.into_iter().map(to_page_record).collect())
    }

    pub async fn update_page_title(
        &self,
        space_id: &str,
        page_id: &str,
        title: &str,
    ) -> SomaResult<Option<PageRecord>> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, space_id).await?;
        if page_id.is_empty() {
            return Err(invalid("page_id required"));
        }
        if title.trim().is_empty() {
            return Err(invalid("title required"));
        }

        let page = PagesService::new(self.state.repos.clone())
            .update_title(space_id, page_id, title)
            .await?;
        Ok(page.map(to_page_record))
    }

    pub async fn set_page_parents(
        &self,
        space_id: &str,
        page_id: &str,
        parent_page_ids: &[String],
    ) -> SomaResult<Option<PageRecord>> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, space_id).await?;
        if page_id.is_empty() {
            return Err(invalid("page_id required"));
        }

        let page = PagesService::new(self.state.repos.clone())
            .set_parents(space_id, page_id, parent_page_ids)
            .await?;
        Ok(page.map(to_page_record))
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn to_page_record(page: Page) -> PageRecord {
    PageRecord {
        space_id: page.space_id,
        page_id: page.page_id,
        title: page.title,
        parent_page_ids: page.parent_page_ids,
        created_at_ms: page.created_at_ms,
        updated_at_ms: page.updated_at_ms,
    }
}

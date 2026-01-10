use std::sync::Arc;

use soma_core::SomaResult;
use soma_storage::{RepositoryProvider, pages::Page};

#[derive(Clone)]
pub struct PagesService {
    repos: Arc<dyn RepositoryProvider>,
}

impl PagesService {
    pub fn new(repos: Arc<dyn RepositoryProvider>) -> Self {
        Self { repos }
    }

    pub async fn ensure_page(&self, page: &Page) -> SomaResult<Page> {
        if let Some(existing) = self
            .repos
            .page_repo()
            .get_page(&page.space_id, &page.page_id)
            .await?
        {
            return Ok(existing);
        }

        self.repos.page_repo().create_page(page).await?;
        Ok(page.clone())
    }

    pub async fn list_pages(&self, space_id: &str) -> SomaResult<Vec<Page>> {
        self.repos.page_repo().list_pages(space_id).await
    }

    pub async fn update_title(
        &self,
        space_id: &str,
        page_id: &str,
        title: &str,
    ) -> SomaResult<Option<Page>> {
        let affected = self
            .repos
            .page_repo()
            .update_title(space_id, page_id, title)
            .await?;
        if affected == 0 {
            return Ok(None);
        }
        self.repos.page_repo().get_page(space_id, page_id).await
    }

    pub async fn set_parents(
        &self,
        space_id: &str,
        page_id: &str,
        parent_page_ids: &[String],
    ) -> SomaResult<Option<Page>> {
        let affected = self
            .repos
            .page_repo()
            .set_parents(space_id, page_id, parent_page_ids)
            .await?;
        if affected == 0 {
            return Ok(None);
        }
        self.repos.page_repo().get_page(space_id, page_id).await
    }
}

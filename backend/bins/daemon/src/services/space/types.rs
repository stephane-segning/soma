use async_trait::async_trait;
use soma_core::SomaResult;

#[derive(Debug, Clone)]
pub struct SpaceRecord {
    pub space_id: String,
    pub display_name: Option<String>,
    pub owner_peer_id: Option<String>,
    pub created_at: i64,
}

#[async_trait]
pub trait SpaceManager: Send + Sync {
    async fn list_spaces(
        &self,
        query: Option<String>,
        limit: u32,
        offset: u32,
    ) -> SomaResult<(Vec<SpaceRecord>, Option<u32>)>;

    async fn get_space(&self, space_id: &str) -> SomaResult<SpaceRecord>;

    async fn create_space(
        &self,
        space_id: Option<String>,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord>;

    async fn update_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord>;

    async fn delete_space(&self, space_id: &str) -> SomaResult<bool>;

    async fn ensure_owned_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<()>;
}

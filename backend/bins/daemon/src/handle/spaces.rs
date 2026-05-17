use soma_core::SomaResult;

use crate::services::space::SpaceRecord as ServiceSpaceRecord;

use super::{
    DaemonHandle, invalid,
    types::{
        CreateSpaceInput, CreateSpaceResult, ListSpacesInput, ListSpacesOutput, SpaceRecord,
        UpdateSpaceInput,
    },
};

impl DaemonHandle {
    pub async fn list_spaces(&self, input: ListSpacesInput) -> SomaResult<ListSpacesOutput> {
        let ListSpacesInput { q, limit, offset } = input;
        let limit = limit.max(1).min(200);
        let (spaces, next_offset) = self
            .state
            .space_manager
            .list_spaces(q, limit, offset)
            .await?;
        Ok(ListSpacesOutput {
            spaces: spaces.into_iter().map(to_space_record).collect(),
            limit,
            offset,
            next_offset,
        })
    }

    pub async fn create_space(&self, input: CreateSpaceInput) -> SomaResult<CreateSpaceResult> {
        let CreateSpaceInput {
            space_id,
            display_name,
        } = input;
        // Empty strings mean "let the space manager auto-generate". Passing
        // `Some("")` would persist an empty identifier instead of triggering
        // the default-value path.
        let space = self
            .state
            .space_manager
            .create_space(
                (!space_id.is_empty()).then_some(space_id),
                (!display_name.is_empty()).then_some(display_name),
            )
            .await?;
        Ok(CreateSpaceResult {
            space_id: space.space_id,
            owner_peer_id: space
                .owner_peer_id
                .unwrap_or_else(|| self.state.peer_id.to_string()),
        })
    }

    pub async fn get_space(&self, space_id: &str) -> SomaResult<SpaceRecord> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        let space = self.state.space_manager.get_space(space_id).await?;
        Ok(to_space_record(space))
    }

    pub async fn update_space(&self, input: UpdateSpaceInput) -> SomaResult<SpaceRecord> {
        let UpdateSpaceInput {
            space_id,
            display_name,
        } = input;
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        let space = self
            .state
            .space_manager
            .update_space(&space_id, Some(display_name))
            .await?;
        Ok(to_space_record(space))
    }

    pub async fn delete_space(&self, space_id: &str) -> SomaResult<bool> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        self.state.space_manager.delete_space(space_id).await
    }
}

fn to_space_record(space: ServiceSpaceRecord) -> SpaceRecord {
    SpaceRecord {
        space_id: space.space_id,
        display_name: space.display_name.unwrap_or_default(),
        owner_peer_id: space.owner_peer_id.unwrap_or_default(),
        created_at: space.created_at,
    }
}


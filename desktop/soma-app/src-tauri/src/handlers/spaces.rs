use chrono::Utc;
use serde::{Deserialize, Serialize};
use soma_proto_build::daemon::{
    CreateSpaceRequest, DeleteSpaceRequest, GetSpaceRequest, ListSpacesRequest, UpdateSpaceRequest,
};

use crate::error::AppResult;
use crate::state::ManagedState;

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

#[derive(Clone)]
pub struct SpacesController {
    state: ManagedState,
}

impl SpacesController {
    pub fn new(state: ManagedState) -> Self {
        Self { state }
    }

    pub async fn list(&self, params: SpacesListParams) -> AppResult<SpacesListResponse> {
        let payload = ListSpacesRequest {
            limit: params.limit.unwrap_or(50),
            offset: params.offset.unwrap_or(0),
            q: params.q,
        };

        self.state
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

    pub async fn create(&self, params: SpacesCreateParams) -> AppResult<SpaceDto> {
        let payload = CreateSpaceRequest {
            space_id: params.space_id.unwrap_or_default(),
            display_name: params.display_name.clone().unwrap_or_default(),
        };

        self.state
            .daemon
            .create_space(payload)
            .await
            .map(|res| SpaceDto {
                space_id: res.space_id,
                display_name: params.display_name.unwrap_or_default(),
                owner_peer_id: res.owner_peer_id,
                created_at: Utc::now().timestamp(),
            })
    }

    pub async fn get(&self, params: SpacesGetParams) -> AppResult<SpaceDto> {
        let payload = GetSpaceRequest {
            space_id: params.space_id,
        };

        self.state.daemon.get_space(payload).await.map(|res| {
            let space = res.space.unwrap_or_default();
            SpaceDto {
                space_id: space.space_id,
                display_name: space.display_name,
                owner_peer_id: space.owner_peer_id,
                created_at: space.created_at,
            }
        })
    }

    pub async fn update(&self, params: SpacesUpdateParams) -> AppResult<SpaceDto> {
        let payload = UpdateSpaceRequest {
            space_id: params.space_id,
            display_name: params.display_name.unwrap_or_default(),
        };

        self.state.daemon.update_space(payload).await.map(|res| {
            let space = res.space.unwrap_or_default();
            SpaceDto {
                space_id: space.space_id,
                display_name: space.display_name,
                owner_peer_id: space.owner_peer_id,
                created_at: space.created_at,
            }
        })
    }

    pub async fn delete(&self, params: SpacesDeleteParams) -> AppResult<bool> {
        let payload = DeleteSpaceRequest {
            space_id: params.space_id,
        };
        self.state
            .daemon
            .delete_space(payload)
            .await
            .map(|res| res.deleted)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacesListParams {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub q: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacesCreateParams {
    pub space_id: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacesGetParams {
    pub space_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacesUpdateParams {
    pub space_id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacesDeleteParams {
    pub space_id: String,
}

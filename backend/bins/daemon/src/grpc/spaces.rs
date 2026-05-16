use std::{str::FromStr, time::SystemTime};

use libp2p::PeerId;
use soma_membership::issue_owned_issuer_capability_to_storage;
use soma_proto_build::daemon;
use tonic::{Request, Response, Status};
use tracing::warn;

use super::{DaemonService, mappers::map_space_record};

impl DaemonService {
    pub(super) async fn issue_issuer_capability_response(
        &self,
        request: Request<daemon::IssueIssuerCapabilityRequest>,
    ) -> Result<Response<daemon::IssueIssuerCapabilityResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.trim().is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        if payload.target_peer_id.trim().is_empty() {
            return Err(Status::invalid_argument("target_peer_id required"));
        }

        let target_peer_id = PeerId::from_str(&payload.target_peer_id)
            .map_err(|_| Status::invalid_argument("invalid target_peer_id"))?;
        let expires_at = if payload.expires_at == 0 {
            None
        } else {
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map_err(|_| Status::internal("system clock before unix epoch"))?
                .as_secs() as i64;
            if payload.expires_at <= now {
                return Err(Status::invalid_argument("expires_at must be in the future"));
            }
            Some(payload.expires_at)
        };

        issue_owned_issuer_capability_to_storage(
            self.state.repos.as_ref(),
            &self.state.signer,
            &self.state.peer_id,
            &payload.space_id,
            &target_peer_id,
            expires_at,
        )
        .await
        .map_err(|err| {
            warn!(%err, space_id = %payload.space_id, target_peer_id = %target_peer_id, "issue_issuer_capability failed");
            Status::permission_denied("failed to issue issuer capability")
        })?;

        Ok(Response::new(daemon::IssueIssuerCapabilityResponse {
            accepted: true,
        }))
    }

    pub(super) async fn discover_spaces_response(
        &self,
        _request: Request<daemon::DiscoverSpacesRequest>,
    ) -> Result<Response<daemon::DiscoverSpacesResponse>, Status> {
        let mut spaces = Vec::new();
        let mut offset = 0;
        let limit = 200;

        loop {
            let (page, next_offset) = self
                .state
                .space_manager
                .list_spaces(None, limit, offset)
                .await
                .map_err(|err| {
                    warn!(%err, "discover_spaces failed");
                    Status::internal("failed to discover spaces")
                })?;

            spaces.extend(page.into_iter().map(map_discovered_space));
            let Some(next_offset) = next_offset else {
                break;
            };
            if next_offset <= offset {
                break;
            }
            offset = next_offset;
        }

        Ok(Response::new(daemon::DiscoverSpacesResponse { spaces }))
    }

    pub(super) async fn list_spaces_response(
        &self,
        request: Request<daemon::ListSpacesRequest>,
    ) -> Result<Response<daemon::ListSpacesResponse>, Status> {
        let payload = request.into_inner();
        let limit = payload.limit.max(1).min(200);
        let offset = payload.offset;
        let (spaces, next_offset) = self
            .state
            .space_manager
            .list_spaces(payload.q, limit, offset)
            .await
            .map_err(|err| {
                warn!(%err, "list_spaces failed");
                Status::internal("failed to list spaces")
            })?;

        Ok(Response::new(daemon::ListSpacesResponse {
            spaces: spaces.into_iter().map(map_space_record).collect(),
            limit,
            offset,
            next_offset,
        }))
    }

    pub(super) async fn create_space_response(
        &self,
        request: Request<daemon::CreateSpaceRequest>,
    ) -> Result<Response<daemon::CreateSpaceResponse>, Status> {
        let payload = request.into_inner();
        let space = self
            .state
            .space_manager
            .create_space(Some(payload.space_id), Some(payload.display_name))
            .await
            .map_err(|err| {
                warn!(%err, "create_space failed");
                Status::internal("failed to create space")
            })?;

        Ok(Response::new(daemon::CreateSpaceResponse {
            space_id: space.space_id,
            owner_peer_id: space
                .owner_peer_id
                .unwrap_or_else(|| self.state.peer_id.to_string()),
        }))
    }

    pub(super) async fn get_space_response(
        &self,
        request: Request<daemon::GetSpaceRequest>,
    ) -> Result<Response<daemon::GetSpaceResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }

        let space = self
            .state
            .space_manager
            .get_space(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "get_space failed");
                Status::internal("failed to load space")
            })?;

        Ok(Response::new(daemon::GetSpaceResponse {
            space: Some(map_space_record(space)),
        }))
    }

    pub(super) async fn update_space_response(
        &self,
        request: Request<daemon::UpdateSpaceRequest>,
    ) -> Result<Response<daemon::UpdateSpaceResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }

        let space = self
            .state
            .space_manager
            .update_space(&payload.space_id, Some(payload.display_name))
            .await
            .map_err(|err| {
                warn!(%err, "update_space failed");
                Status::internal("failed to update space")
            })?;

        Ok(Response::new(daemon::UpdateSpaceResponse {
            space: Some(map_space_record(space)),
        }))
    }

    pub(super) async fn delete_space_response(
        &self,
        request: Request<daemon::DeleteSpaceRequest>,
    ) -> Result<Response<daemon::DeleteSpaceResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }

        let deleted = self
            .state
            .space_manager
            .delete_space(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "delete_space failed");
                Status::internal("failed to delete space")
            })?;

        Ok(Response::new(daemon::DeleteSpaceResponse { deleted }))
    }
}

fn map_discovered_space(space: crate::services::space::SpaceRecord) -> daemon::DiscoveredSpace {
    daemon::DiscoveredSpace {
        space_id: space.space_id,
        display_name: space.display_name.unwrap_or_default(),
        tags: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use libp2p::{PeerId, identity::Keypair};
    use prost::Message;
    use soma_common::verify_issuer_capability;
    use soma_peer::PeerCommand;
    use soma_proto_build::{
        daemon::{self, daemon_server::Daemon},
        space::IssuerCapability,
    };
    use soma_storage::{RepositoryFactory, RepositoryProvider, membership::Space};
    use soma_vdfs::fs::FsBlobStore;
    use tokio::sync::{Mutex, broadcast, mpsc};
    use tonic::{Code, Request};

    use crate::{
        grpc::{DaemonService, DaemonState},
        services::space::{DefaultSpaceManager, SpaceManager},
    };

    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");

    #[tokio::test]
    async fn discover_spaces_returns_local_spaces() {
        let (service, _repos) = test_service().await;
        service
            .create_space(Request::new(daemon::CreateSpaceRequest {
                space_id: "space-a".into(),
                display_name: "Alpha".into(),
            }))
            .await
            .expect("create alpha");
        service
            .create_space(Request::new(daemon::CreateSpaceRequest {
                space_id: "space-b".into(),
                display_name: "".into(),
            }))
            .await
            .expect("create beta");

        let response = service
            .discover_spaces(Request::new(daemon::DiscoverSpacesRequest {}))
            .await
            .expect("discover")
            .into_inner();

        let ids: Vec<_> = response
            .spaces
            .iter()
            .map(|space| space.space_id.as_str())
            .collect();
        assert!(ids.contains(&"space-a"));
        assert!(ids.contains(&"space-b"));
        assert!(response.spaces.iter().all(|space| space.tags.is_empty()));
    }

    #[tokio::test]
    async fn issue_issuer_capability_persists_signed_delegation() {
        let (service, repos) = test_service().await;
        service
            .create_space(Request::new(daemon::CreateSpaceRequest {
                space_id: "space-a".into(),
                display_name: "Alpha".into(),
            }))
            .await
            .expect("create space");
        let delegate = Keypair::generate_ed25519().public().to_peer_id();
        let expires_at = now_secs() + 3_600;

        let response = service
            .issue_issuer_capability(Request::new(daemon::IssueIssuerCapabilityRequest {
                space_id: "space-a".into(),
                target_peer_id: delegate.to_string(),
                expires_at,
            }))
            .await
            .expect("issue issuer")
            .into_inner();

        assert!(response.accepted);
        let stored = repos
            .issuer_repo()
            .get("space-a", &delegate.to_string())
            .await
            .expect("load stored issuer")
            .expect("stored issuer");
        let cap = IssuerCapability::decode(
            stored
                .capability
                .as_ref()
                .expect("stored capability")
                .as_slice(),
        )
        .expect("decode capability");
        verify_issuer_capability(
            &cap,
            &service.state.signer.public(),
            SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(now_secs() as u64),
        )
        .expect("verify issuer");
    }

    #[tokio::test]
    async fn issue_issuer_capability_requires_owned_space() {
        let (service, repos) = test_service().await;
        repos
            .membership_repo()
            .upsert_space(&Space {
                space_id: "foreign".into(),
                display_name: Some("Foreign".into()),
                owner_peer_id: Some(PeerId::random().to_string()),
                created_at: now_secs(),
            })
            .await
            .expect("insert foreign space");
        let delegate = Keypair::generate_ed25519().public().to_peer_id();

        let err = service
            .issue_issuer_capability(Request::new(daemon::IssueIssuerCapabilityRequest {
                space_id: "foreign".into(),
                target_peer_id: delegate.to_string(),
                expires_at: now_secs() + 3_600,
            }))
            .await
            .expect_err("should reject");

        assert_eq!(err.code(), Code::PermissionDenied);
    }

    async fn test_service() -> (DaemonService, Arc<RepositoryFactory>) {
        let id = rand::random::<u64>();
        let db_path = std::env::temp_dir().join(format!("soma-daemon-spaces-{id}.db"));
        let database_url = soma_core::db::normalize_sqlite_url(&db_path.to_string_lossy());
        let pool = soma_core::db::DbFactory::any(database_url, &MIGRATOR)
            .max_connections(1)
            .build_any()
            .await
            .expect("db");
        let repos = Arc::new(RepositoryFactory::new(pool));
        let signer = Keypair::generate_ed25519();
        let peer_id = signer.public().to_peer_id();
        let (peer_commands, _peer_rx) = mpsc::channel::<PeerCommand>(1);
        let (events, _events_rx) = broadcast::channel(1);
        let space_manager: Arc<dyn SpaceManager> = Arc::new(DefaultSpaceManager::new(
            repos.clone(),
            signer.clone(),
            peer_id,
        ));

        let service = DaemonService {
            state: Arc::new(DaemonState {
                peer_id,
                peer_commands,
                listen_addrs: Mutex::new(Vec::new()),
                events,
                repos: repos.clone(),
                signer,
                blob_store: FsBlobStore::new(
                    std::env::temp_dir().join(format!("soma-daemon-spaces-blobs-{id}")),
                ),
                space_manager,
                identify_keys: Mutex::new(HashMap::new()),
            }),
        };

        (service, repos)
    }

    fn now_secs() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_secs() as i64
    }
}

use std::{path::PathBuf, pin::Pin, str::FromStr, sync::Arc, time::SystemTime};

use futures::Stream;
use libp2p::PeerId;
use prost_types::Timestamp;
use soma_core::SomaResult;
use soma_peer::PeerCommand;
use soma_proto_build::classroom::v1 as classroom;
use soma_proto_build::daemon::v1 as daemon;
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio_stream::{wrappers::BroadcastStream, StreamExt as TokioStreamExt};
use tonic::{Request, Response, Status};

use soma_socket::serve_grpc_unix;
/// Daemon shared state (peer id, command channel, listeners, event bus).
#[derive(Debug)]
pub struct DaemonState {
    pub peer_id: PeerId,
    pub peer_commands: mpsc::Sender<PeerCommand>,
    pub listen_addrs: Mutex<Vec<String>>,
    pub events: broadcast::Sender<daemon::DaemonEvent>,
}

impl DaemonState {
    pub async fn publish(&self, event: daemon::DaemonEvent) {
        let _ = self.events.send(event);
    }
}

#[derive(Clone)]
pub struct DaemonService {
    pub state: Arc<DaemonState>,
}

#[tonic::async_trait]
impl daemon::daemon_server::Daemon for DaemonService {
    type StreamEventsStream =
        Pin<Box<dyn Stream<Item = Result<daemon::DaemonEvent, Status>> + Send + 'static>>;

    async fn status(
        &self,
        _request: Request<daemon::StatusRequest>,
    ) -> Result<Response<daemon::StatusResponse>, Status> {
        let addrs = self.state.listen_addrs.lock().await.clone();
        Ok(Response::new(daemon::StatusResponse {
            peer_id: self.state.peer_id.to_string(),
            listen_addrs: addrs,
        }))
    }

    async fn join_class(
        &self,
        request: Request<daemon::JoinClassRequest>,
    ) -> Result<Response<daemon::JoinClassResponse>, Status> {
        let payload = request.into_inner();
        let target_peer_id = PeerId::from_str(&payload.target_peer_id)
            .map_err(|_| Status::invalid_argument("invalid target peer id"))?;

        let mut addrs = Vec::new();
        for addr in payload.target_multiaddrs {
            let parsed: libp2p::Multiaddr = addr
                .parse()
                .map_err(|_| Status::invalid_argument("invalid multiaddr in target_multiaddrs"))?;
            addrs.push(parsed);
        }
        if addrs.is_empty() {
            return Err(Status::invalid_argument("target_multiaddrs required"));
        }

        let request_id = format!("{:016x}", rand::random::<u64>());
        let join_request = classroom::JoinRequest {
            class_id: Some(classroom::ClassId {
                value: payload.class_id,
            }),
            peer_id: Some(classroom::PeerId {
                value: self.state.peer_id.to_string(),
            }),
            display_name: payload.display_name,
            device_name: payload.device_name,
            student_code: String::new(),
            requested_role: classroom::ClassRole::Student as i32,
            invite_proof: None,
            created_at: Some(Timestamp::from(SystemTime::now())),
        };

        self.state
            .peer_commands
            .send(PeerCommand::SendJoinRequest {
                target: target_peer_id,
                addrs,
                request_id: request_id.clone(),
                request: join_request,
            })
            .await
            .map_err(|_| Status::internal("peer task is not running"))?;

        self.state
            .publish(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::JoinSubmitted(
                    daemon::JoinSubmitEvent {
                        request_id: request_id.clone(),
                        target_peer_id: target_peer_id.to_string(),
                    },
                )),
            })
            .await;

        Ok(Response::new(daemon::JoinClassResponse { request_id }))
    }

    async fn stream_events(
        &self,
        _request: Request<daemon::StreamEventsRequest>,
    ) -> Result<Response<Self::StreamEventsStream>, Status> {
        let stream = BroadcastStream::new(self.state.events.subscribe())
            .filter_map(|msg: Result<daemon::DaemonEvent, _>| msg.ok())
            .map(Ok);
        Ok(Response::new(Box::pin(stream)))
    }
}

pub async fn serve_grpc(
    socket_path: PathBuf,
    server: daemon::daemon_server::DaemonServer<DaemonService>,
) -> SomaResult<()> {
    serve_grpc_unix(
        socket_path,
        tonic::transport::Server::builder().add_service(server),
        async {
            let _ = tokio::signal::ctrl_c().await;
        },
    )
    .await
}

use std::{path::PathBuf, pin::Pin, str::FromStr, sync::Arc, time::SystemTime};

use clap::{Parser, Subcommand};
use libp2p::{Multiaddr, PeerId};
use mimalloc::MiMalloc;
use prost_types::Timestamp;
use soma_core::SomaResult;
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, PeerEvent, spawn_ping_peer};
use soma_proto_build::classroom::v1 as classroom;
use soma_proto_build::daemon::v1 as daemon;
use tokio::{
    signal,
    sync::{broadcast, mpsc, Mutex},
};
use tokio_stream::{wrappers::BroadcastStream, StreamExt as TokioStreamExt};
use tonic::{transport::Server, Request, Response, Status};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-daemon", version)]
struct Args {
    #[command(subcommand)]
    cmd: Option<Command>,

    /// Unix socket path for desktop IPC.
    #[arg(long, env = "SOMA_DAEMON_SOCKET", default_value = "./soma-daemon.sock")]
    socket_path: PathBuf,

    /// Blob storage directory used by the daemon.
    #[arg(long, env = "SOMA_BLOB_DIR", default_value = "./blobs")]
    blob_dir: PathBuf,

    /// Listen multiaddrs for libp2p.
    #[arg(
        long,
        env = "SOMA_LISTEN_ADDRS",
        value_delimiter = ',',
        default_values_t = default_listen_addrs()
    )]
    listen_addrs: Vec<Multiaddr>,

    /// Optional bootstrap peers to dial on startup.
    #[arg(long, env = "SOMA_BOOTSTRAP_ADDRS", value_delimiter = ',')]
    bootstrap_addrs: Vec<Multiaddr>,

    /// Rendezvous nodes to register/discover against.
    #[arg(long, env = "SOMA_RDV_ADDRS", value_delimiter = ',')]
    rendezvous_addrs: Vec<Multiaddr>,

    /// Relay nodes to reserve slots against.
    #[arg(long, env = "SOMA_RELAY_ADDRS", value_delimiter = ',')]
    relay_addrs: Vec<Multiaddr>,

    /// Disable local mDNS discovery.
    #[arg(long, env = "SOMA_DISABLE_MDNS", default_value_t = false)]
    disable_mdns: bool,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate the daemon identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

/// Daemon runtime configuration.
#[derive(Debug, Clone)]
struct DaemonConfig {
    socket_path: PathBuf,
    blob_dir: PathBuf,
    identity_path: PathBuf,
    listen_addrs: Vec<Multiaddr>,
    bootstrap_addrs: Vec<Multiaddr>,
    rendezvous_addrs: Vec<Multiaddr>,
    relay_addrs: Vec<Multiaddr>,
    enable_mdns: bool,
}

impl DaemonConfig {
    fn from_args(args: &Args) -> Self {
        Self {
            socket_path: args.socket_path.clone(),
            blob_dir: args.blob_dir.clone(),
            identity_path: default_identity_path("daemon"),
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            relay_addrs: args.relay_addrs.clone(),
            enable_mdns: !args.disable_mdns,
        }
    }
}

#[derive(Debug)]
struct DaemonState {
    peer_id: PeerId,
    peer_commands: mpsc::Sender<PeerCommand>,
    listen_addrs: Mutex<Vec<String>>,
    events: broadcast::Sender<daemon::DaemonEvent>,
}

impl DaemonState {
    async fn publish(&self, event: daemon::DaemonEvent) {
        let _ = self.events.send(event);
    }
}

#[derive(Clone)]
struct DaemonService {
    state: Arc<DaemonState>,
}

#[tonic::async_trait]
impl daemon::daemon_server::Daemon for DaemonService {
    type StreamEventsStream =
        Pin<Box<dyn futures::Stream<Item = Result<daemon::DaemonEvent, Status>> + Send + 'static>>;

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
            let parsed: Multiaddr = addr
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

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("daemon"));
        let id = generate_identity(&path).expect("generate identity");
        println!(
            "generated daemon identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = DaemonConfig::from_args(&args);
    run(config).await
}

fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14007"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/udp/14207/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
        "/ip4/0.0.0.0/tcp/14107/ws"
            .parse()
            .expect("valid websocket multiaddr"),
    ]
}

async fn run(config: DaemonConfig) -> SomaResult<()> {
    let DaemonConfig {
        socket_path,
        blob_dir,
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_addrs,
        relay_addrs,
        enable_mdns,
    } = config;

    std::fs::create_dir_all(&blob_dir)?;

    let peer_config = PeerConfig {
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_nodes: rendezvous_addrs,
        relay_addrs,
        rendezvous_namespace: None,
        enable_mdns,
    };
    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;
    info!(%peer_id, ?socket_path, ?blob_dir, "soma-daemon starting");

    let (event_tx, _) = broadcast::channel(64);
    let state = Arc::new(DaemonState {
        peer_id,
        peer_commands: peer.commands.clone(),
        listen_addrs: Mutex::new(Vec::new()),
        events: event_tx,
    });

    let grpc_service = DaemonService {
        state: state.clone(),
    };
    let grpc_task = tokio::spawn(serve_grpc(socket_path.clone(), grpc_service));
    let peer_task = peer.task;
    let mut peer_events = peer.events;
    tokio::pin!(peer_task);
    tokio::pin!(grpc_task);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    handle_peer_event(&state, evt).await;
                } else {
                    break;
                }
            }
            res = &mut peer_task => {
                res??;
                break;
            }
            res = &mut grpc_task => {
                res??;
                break;
            }
            _ = signal::ctrl_c() => {
                let _ = peer.commands.send(PeerCommand::Shutdown).await;
                break;
            }
        }
    }

    if socket_path.exists() {
        let _ = std::fs::remove_file(socket_path);
    }

    Ok(())
}

async fn serve_grpc(socket_path: PathBuf, service: DaemonService) -> SomaResult<()> {
    if let Some(parent) = socket_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if socket_path.exists() {
        std::fs::remove_file(&socket_path)?;
    }
    let listener = tokio::net::UnixListener::bind(&socket_path)?;
    let incoming = tokio_stream::wrappers::UnixListenerStream::new(listener);
    Server::builder()
        .add_service(daemon::daemon_server::DaemonServer::new(service))
        .serve_with_incoming_shutdown(incoming, async {
            let _ = signal::ctrl_c().await;
        })
        .await
        .map_err(soma_core::Error::service)?;
    Ok(())
}

async fn handle_peer_event(state: &Arc<DaemonState>, evt: PeerEvent) {
    match evt {
        PeerEvent::NewListenAddr { address, peer_id } => {
            info!(%peer_id, listen_addr=%address, "daemon listening");
            let mut addrs = state.listen_addrs.lock().await;
            let addr = address.to_string();
            if !addrs.contains(&addr) {
                addrs.push(addr);
            }
        }
        PeerEvent::PingOk { rtt } => {
            info!(?rtt, "daemon ping ok");
        }
        PeerEvent::PingErr { error } => {
            warn!(%error, "daemon ping error");
        }
        PeerEvent::ConnectionEstablished { peer } => {
            info!(%peer, "daemon connected");
        }
        PeerEvent::ConnectionError { peer, error } => {
            warn!(?peer, %error, "daemon connection error");
        }
        PeerEvent::IdentifyReceived { peer, agent, protocols } => {
            info!(%peer, %agent, protocols, "daemon identify received");
        }
        PeerEvent::MdnsDiscovered { peers } => {
            info!(peers, "daemon mdns discovered peers");
        }
        PeerEvent::RendezvousDiscovered { registrations } => {
            info!(registrations, "daemon rendezvous discovered");
        }
        PeerEvent::RelayReserved { relay } => {
            info!(%relay, "daemon relay reservation accepted");
        }
        PeerEvent::RelayCircuitEstablished { relay } => {
            info!(%relay, "daemon relay circuit established");
        }
        PeerEvent::JoinRequestSubmitted { target, request_id } => {
            state.publish(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::JoinSubmitted(
                    daemon::JoinSubmitEvent {
                        request_id,
                        target_peer_id: target.to_string(),
                    },
                )),
            }).await;
        }
        PeerEvent::JoinDecision { from, decision } => {
            state.publish(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::JoinDecision(
                    daemon::JoinDecisionEvent {
                        from_peer_id: from.to_string(),
                        decision: Some(decision),
                    },
                )),
            }).await;
        }
        PeerEvent::JoinFailed { target, error } => {
            state.publish(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::JoinFailed(
                    daemon::JoinFailedEvent {
                        target_peer_id: target.to_string(),
                        error,
                    },
                )),
            }).await;
        }
        PeerEvent::ListenerClosed { reason } => {
            info!(?reason, "daemon listener closed");
        }
    }
}

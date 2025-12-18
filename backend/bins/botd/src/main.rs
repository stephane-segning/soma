use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::{Duration, SystemTime},
};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use clap::{Parser, Subcommand};
use libp2p::Multiaddr;
use mimalloc::MiMalloc;
use prometheus_client::{
    encoding::text::encode,
    metrics::{counter::Counter, family::Family},
    registry::Registry,
};
use prometheus_client_derive_encode::EncodeLabelSet;
use prost::Message;
use prost_types::Timestamp;
use rand::random;
use serde::{Deserialize, Serialize};
use soma_core::SomaResult;
use soma_metrics::SharedRegistry;
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, PeerEvent, spawn_ping_peer};
use soma_proto_build::classroom::v1::{
    ClassId, ClassRole, JoinDecision, JoinDecisionType, MembershipCapability, PeerId,
};
use tokio::signal;
use tracing::{info, warn};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-botd", version)]
struct Args {
    #[command(subcommand)]
    cmd: Option<Command>,

    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8080")]
    http_addr: SocketAddr,

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

    /// Disable mdns discovery (default on).
    #[arg(long, env = "SOMA_DISABLE_MDNS", default_value_t = false)]
    disable_mdns: bool,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate the botd identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("bot"));
        let id = generate_identity(&path)?;
        println!(
            "generated bot identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = BotConfig::from_args(&args);
    let metrics = BotMetrics::new();

    run(config, metrics).await
}

#[derive(Debug, Clone)]
struct BotConfig {
    identity_path: PathBuf,
    blob_dir: PathBuf,
    http_addr: SocketAddr,
    listen_addrs: Vec<Multiaddr>,
    bootstrap_addrs: Vec<Multiaddr>,
    rendezvous_addrs: Vec<Multiaddr>,
    relay_addrs: Vec<Multiaddr>,
    enable_mdns: bool,
}

impl BotConfig {
    fn from_args(args: &Args) -> Self {
        Self {
            identity_path: default_identity_path("bot"),
            blob_dir: args.blob_dir.clone(),
            http_addr: args.http_addr,
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            relay_addrs: args.relay_addrs.clone(),
            enable_mdns: !args.disable_mdns,
        }
    }
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct PingLabels {
    outcome: &'static str,
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct JoinDecisionLabels {
    outcome: &'static str,
}

#[derive(Clone)]
struct BotMetrics {
    registry: SharedRegistry,
    listeners: Family<(), Counter>,
    pings: Family<PingLabels, Counter>,
    join_decisions: Family<JoinDecisionLabels, Counter>,
}

impl BotMetrics {
    fn new() -> Self {
        let mut registry = Registry::with_prefix("soma_bot");

        let listeners = Family::<(), Counter>::default();
        registry.register(
            "listen_events_total",
            "Bot listen events",
            listeners.clone(),
        );

        let pings = Family::<PingLabels, Counter>::default();
        registry.register("ping_total", "Ping successes/failures", pings.clone());

        let join_decisions = Family::<JoinDecisionLabels, Counter>::default();
        registry.register(
            "join_decisions_total",
            "Join decisions by outcome",
            join_decisions.clone(),
        );

        Self {
            registry: std::sync::Arc::new(registry),
            listeners,
            pings,
            join_decisions,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct BotInfo {
    peer_id: String,
    blob_dir: PathBuf,
}

#[derive(Clone)]
struct BotState {
    info: BotInfo,
    issuer_peer_id: String,
    metrics: BotMetrics,
}

#[derive(Debug, Deserialize)]
struct JoinDecisionRequest {
    class_id: String,
    subject_peer_id: String,
    #[serde(default = "default_approve")]
    approve: bool,
    /// Optional override; defaults to STUDENT.
    role: Option<String>,
    /// Expiry for capability in seconds (defaults to 1 day).
    expires_in_secs: Option<u64>,
    /// Human-facing context kept in logs/metrics.
    display_name: Option<String>,
    device_name: Option<String>,
    student_code: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
struct MembershipCapabilityView {
    class_id: String,
    subject_peer_id: String,
    issuer_peer_id: String,
    role: String,
    issued_at: i64,
    expires_at: i64,
    encoded: String,
}

#[derive(Debug, Serialize)]
struct JoinDecisionView {
    decision_id: String,
    decision: String,
    class_id: String,
    subject_peer_id: String,
    reason: String,
    created_at: i64,
    decision_encoded: String,
    capability: Option<MembershipCapabilityView>,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

fn default_approve() -> bool {
    true
}

fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14005"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/tcp/14105/ws"
            .parse()
            .expect("valid ws multiaddr"),
        "/ip4/0.0.0.0/udp/14205/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
    ]
}

async fn run(config: BotConfig, metrics: BotMetrics) -> SomaResult<()> {
    std::fs::create_dir_all(&config.blob_dir)?;

    let peer_config = PeerConfig {
        identity_path: config.identity_path.clone(),
        listen_addrs: config.listen_addrs.clone(),
        bootstrap_addrs: config.bootstrap_addrs.clone(),
        rendezvous_nodes: config.rendezvous_addrs.clone(),
        relay_addrs: config.relay_addrs.clone(),
        rendezvous_namespace: None,
        enable_mdns: config.enable_mdns,
    };
    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;

    info!(
        %peer_id,
        http_addr = %config.http_addr,
        blob_dir = %config.blob_dir.display(),
        "starting soma-botd"
    );

    let http_handle = tokio::spawn({
        let state = BotState {
            info: BotInfo {
                peer_id: peer_id.to_string(),
                blob_dir: config.blob_dir.clone(),
            },
            issuer_peer_id: peer_id.to_string(),
            metrics: metrics.clone(),
        };
        async move { serve_http(config.http_addr, state).await }
    });
    let peer_task = peer.task;
    let mut peer_events = peer.events;
    tokio::pin!(peer_task);
    tokio::pin!(http_handle);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    match evt {
                        PeerEvent::NewListenAddr { address, peer_id } => {
                            metrics.listeners.get_or_create(&()).inc();
                            info!(%peer_id, listen_addr=%address, "bot listening");
                        }
                        PeerEvent::PingOk { rtt } => {
                            metrics.pings.get_or_create(&PingLabels { outcome: "ok" }).inc();
                            info!(?rtt, "ping success");
                        }
                        PeerEvent::PingErr { error } => {
                            metrics.pings.get_or_create(&PingLabels { outcome: "error" }).inc();
                            warn!(%error, "ping error");
                        }
                        PeerEvent::ConnectionEstablished { peer } => {
                            info!(%peer, "bot connection established");
                        }
                        PeerEvent::ConnectionError { peer, error } => {
                            warn!(?peer, %error, "bot connection error");
                        }
                        PeerEvent::IdentifyReceived { peer, agent, protocols } => {
                            info!(%peer, %agent, protocols, "bot identify received");
                        }
                        PeerEvent::MdnsDiscovered { peers } => {
                            info!(peers, "bot mdns discovered peers");
                        }
                        PeerEvent::RendezvousDiscovered { registrations } => {
                            info!(registrations, "bot rendezvous discovered");
                        }
                        PeerEvent::RelayReserved { relay } => {
                            info!(%relay, "bot relay reservation accepted");
                        }
                        PeerEvent::RelayCircuitEstablished { relay } => {
                            info!(%relay, "bot relay circuit established");
                        }
                        PeerEvent::ListenerClosed { reason } => {
                            warn!(?reason, "bot listener closed");
                        }
                        PeerEvent::JoinRequestSubmitted { .. } => {}
                        PeerEvent::JoinDecision { .. } => {}
                        PeerEvent::JoinFailed { .. } => {}
                    }
                } else {
                    break;
                }
            }
            res = &mut peer_task => {
                res??;
                break;
            }
            res = &mut http_handle => {
                res??;
                break;
            }
            _ = signal::ctrl_c() => {
                warn!("botd shutdown requested");
                let _ = peer.commands.send(PeerCommand::Shutdown).await;
                break;
            }
        }
    }

    Ok(())
}

async fn serve_http(http_addr: SocketAddr, state: BotState) -> SomaResult<()> {
    let shared = Arc::new(state);

    let registry = shared.metrics.registry.clone();

    let app = Router::new()
        .route("/info", get(info_handler))
        .route("/v1/join", post(join_handler))
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/metrics",
            get(move || {
                let registry = registry.clone();
                async move {
                    let mut buffer = String::new();
                    encode(&mut buffer, &registry).expect("encode metrics");
                    buffer
                }
            }),
        )
        .with_state(shared);

    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn info_handler(State(state): State<Arc<BotState>>) -> Json<BotInfo> {
    Json(state.info.clone())
}

async fn join_handler(
    State(state): State<Arc<BotState>>,
    Json(payload): Json<JoinDecisionRequest>,
) -> Result<Json<JoinDecisionView>, (StatusCode, Json<ErrorResponse>)> {
    let class_id = payload.class_id.trim();
    let subject = payload.subject_peer_id.trim();
    if class_id.is_empty() || subject.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "class_id and subject_peer_id are required".into(),
            }),
        ));
    }

    info!(
        %class_id,
        %subject,
        approve = payload.approve,
        display_name = ?payload.display_name,
        device_name = ?payload.device_name,
        student_code = ?payload.student_code,
        "join decision requested"
    );

    let issued_at = SystemTime::now();
    let expires_at = issued_at + Duration::from_secs(payload.expires_in_secs.unwrap_or(86_400));
    let decision_id = format!("{:016x}", random::<u64>());

    let role = parse_role(payload.role.as_deref());
    let (decision_type, reason, capability) = if payload.approve {
        let capability = MembershipCapability {
            class_id: Some(ClassId {
                value: class_id.to_string(),
            }),
            subject_peer_id: Some(PeerId {
                value: subject.to_string(),
            }),
            role: role as i32,
            permissions: vec![],
            issued_at: Some(Timestamp::from(issued_at)),
            expires_at: Some(Timestamp::from(expires_at)),
            issuer_peer_id: Some(PeerId {
                value: state.issuer_peer_id.clone(),
            }),
            issuer_cap: None,
            signed: None,
        };
        (
            JoinDecisionType::JoinApproved,
            payload
                .reason
                .unwrap_or_else(|| "approved by soma-botd".into()),
            Some(capability),
        )
    } else {
        (
            JoinDecisionType::JoinRejected,
            payload
                .reason
                .unwrap_or_else(|| "rejected by soma-botd".into()),
            None,
        )
    };

    let decision = JoinDecision {
        decision_id: decision_id.clone(),
        class_id: Some(ClassId {
            value: class_id.to_string(),
        }),
        subject_peer_id: Some(PeerId {
            value: subject.to_string(),
        }),
        decision: decision_type as i32,
        reason: reason.clone(),
        capability,
        created_at: Some(Timestamp::from(issued_at)),
    };

    let decision_view = JoinDecisionView {
        decision_id,
        decision: decision_type.as_str_name().to_string(),
        class_id: class_id.to_string(),
        subject_peer_id: subject.to_string(),
        reason,
        created_at: issued_at
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or_default(),
        decision_encoded: BASE64.encode(decision.encode_to_vec()),
        capability: decision.capability.as_ref().map(capability_to_view),
    };

    let outcome = if payload.approve { "approved" } else { "rejected" };
    state
        .metrics
        .join_decisions
        .get_or_create(&JoinDecisionLabels { outcome })
        .inc();

    Ok(Json(decision_view))
}

fn parse_role(input: Option<&str>) -> ClassRole {
    match input.map(|s| s.to_ascii_lowercase()) {
        Some(ref s) if s.contains("owner") => ClassRole::Owner,
        Some(ref s) if s.contains("editor") => ClassRole::Editor,
        Some(ref s) if s.contains("viewer") => ClassRole::Viewer,
        Some(ref s) if s.contains("bot") => ClassRole::Bot,
        Some(ref s) if s.contains("teacher") => ClassRole::Owner,
        _ => ClassRole::Student,
    }
}

fn capability_to_view(capability: &MembershipCapability) -> MembershipCapabilityView {
    let issued_at = capability
        .issued_at
        .as_ref()
        .map(|ts| ts.seconds)
        .unwrap_or_default();
    let expires_at = capability
        .expires_at
        .as_ref()
        .map(|ts| ts.seconds)
        .unwrap_or_default();

    MembershipCapabilityView {
        class_id: capability
            .class_id
            .as_ref()
            .map(|c| c.value.clone())
            .unwrap_or_default(),
        subject_peer_id: capability
            .subject_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_default(),
        issuer_peer_id: capability
            .issuer_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_default(),
        role: ClassRole::try_from(capability.role)
            .unwrap_or(ClassRole::Unspecified)
            .as_str_name()
            .to_string(),
        issued_at,
        expires_at,
        encoded: BASE64.encode(capability.encode_to_vec()),
    }
}

use clap::Parser;
use libp2p::Multiaddr;
use mimalloc::MiMalloc;
use prost::Message;
use soma_core::SomaResult;
use soma_membership::{JoinPolicy, build_join_decider};
use soma_membership::{
    MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST, decode_outgoing_join_request_payload,
};
use soma_net::{NetIdentity, default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, join::JoinDecider, spawn_ping_peer};
use soma_proto_build::daemon;
use soma_proto_build::spaceroom::JoinDecision;
use soma_storage::mailbox::MailboxRepository;
use soma_vdfs::BlobProvider;
use std::time::{Duration, SystemTime};
use tokio::{
    signal,
    sync::{Mutex, broadcast},
};
use tracing::info;
use tracing_subscriber::EnvFilter;

use std::sync::Arc;

mod blob_store;
mod config;
mod dispatch;
mod grpc;
mod handlers;

use blob_store::BlobStore;
use config::{Args, Command, DaemonConfig};
use dispatch::build_dispatcher;
use grpc::{DaemonService, DaemonState, serve_grpc};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

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

async fn run(config: DaemonConfig) -> SomaResult<()> {
    let DaemonConfig {
        socket_path,
        blob_dir,
        db_path,
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_addrs,
        relay_addrs,
        enable_mdns,
    } = config;

    std::fs::create_dir_all(&blob_dir)?;
    let blob_store = BlobStore::new(blob_dir.clone());
    let blob_provider: Arc<dyn BlobProvider> = Arc::new(blob_store.clone());
    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");
    let db_url = soma_core::db::normalize_sqlite_url(db_path.to_string_lossy().as_ref());
    info!(%db_url, scheme = "sqlite", "configuring database");
    let repos = soma_storage::bootstrap::connect_any(&db_url, &MIGRATOR).await?;

    let net_identity = NetIdentity::load_or_generate(&identity_path)?;
    let join_decider: std::sync::Arc<dyn JoinDecider> = build_join_decider(
        &repos,
        net_identity.keypair().clone(),
        net_identity.peer_id(),
        JoinPolicy::manual_only(),
    );

    let peer_config = PeerConfig::builder()
        .identity_path(identity_path)
        .listen_addrs(listen_addrs)
        .bootstrap_addrs(bootstrap_addrs)
        .rendezvous_nodes(rendezvous_addrs)
        .relay_addrs(relay_addrs)
        .enable_mdns(enable_mdns)
        .join_decider(join_decider.clone())
        .blob_provider(blob_provider)
        .build()
        .expect("peer config");

    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;
    info!(%peer_id, ?socket_path, ?blob_dir, "soma-daemon starting");

    let (event_tx, _) = broadcast::channel(64);
    let state = Arc::new(DaemonState {
        peer_id,
        peer_commands: peer.commands.clone(),
        listen_addrs: Mutex::new(Vec::new()),
        events: event_tx,
        repos,
        signer: net_identity.keypair().clone(),
        blob_store,
    });

    let grpc_service = daemon::daemon_server::DaemonServer::new(DaemonService {
        state: state.clone(),
    });

    let grpc_task = tokio::spawn(serve_grpc(socket_path.clone(), grpc_service));
    let peer_task = peer.task;
    let mut peer_events = peer.events;

    // Event handling: fan out to per-kind handlers via dispatcher.
    let dispatcher = build_dispatcher(state.clone()).await;

    spawn_mailbox_sweeper(state.clone());

    tokio::pin!(peer_task);
    tokio::pin!(grpc_task);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    dispatcher.dispatch(&state, &evt).await;
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

fn spawn_mailbox_sweeper(state: Arc<DaemonState>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5 * 60)).await;
            sweep_mailbox(state.as_ref()).await;
        }
    });
}

async fn sweep_mailbox(state: &DaemonState) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let _ = state.repos.mailbox().requeue_expired_leases(now_secs).await;

    let entries = match state.repos.mailbox().list_due(now_secs, 50).await {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries {
        match entry.kind.as_str() {
            MAILBOX_KIND_JOIN_DECISION => {
                let Some(subject_peer_id) = entry.subject_peer_id.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(target) = subject_peer_id.parse() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let lease_until = now_secs + 30;
                let leased = match state
                    .repos
                    .mailbox()
                    .lease(&entry.id, &state.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(_) => continue,
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(decision) = JoinDecision::decode(payload.as_slice()) else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let _ = state
                    .peer_commands
                    .send(PeerCommand::SendJoinDecision {
                        target,
                        addrs: Vec::new(),
                        delivery_id: entry.id.clone(),
                        decision,
                    })
                    .await;
            }
            MAILBOX_KIND_JOIN_REQUEST => {
                let Some(subject_peer_id) = entry.subject_peer_id.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(target) = subject_peer_id.parse() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let lease_until = now_secs + 30;
                let leased = match state
                    .repos
                    .mailbox()
                    .lease(&entry.id, &state.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(_) => continue,
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(outgoing) = decode_outgoing_join_request_payload(&payload) else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let mut addrs = Vec::new();
                for addr in outgoing.addrs {
                    if let Ok(parsed) = addr.parse::<Multiaddr>() {
                        addrs.push(parsed);
                    }
                }

                let _ = state
                    .peer_commands
                    .send(PeerCommand::SendJoinRequest {
                        target,
                        addrs,
                        delivery_id: entry.id.clone(),
                        request_id: outgoing.request_id,
                        request: outgoing.request,
                    })
                    .await;
            }
            _ => {}
        }
    }
}

use crate::behaviour::build_app_behaviour;
use crate::config::PeerConfig;
use crate::runtime::{extract_peer_id, run_swarm};
use crate::{PeerHandle, transport};
use soma_core::SomaResult;
use soma_net::NetIdentity;
use std::collections::{HashMap, HashSet};
use tokio::sync::mpsc;
use tracing::{info, warn};

/// Spawn a peer with ping + identify + optional mdns + rendezvous discovery.
///
/// The heavy lifting (identity load, swarm construction, dialing) runs in
/// a *detached* `tokio::spawn` task — this fn itself returns as soon as
/// that task is queued plus one more identity read for the peer id, so a
/// caller awaiting `spawn_peer`/`PeerLauncher::spawn` never observes a
/// stall here even if swarm construction (below) does stall.
pub fn spawn_peer(mut config: PeerConfig) -> SomaResult<PeerHandle> {
    let (command_tx, command_rx) = mpsc::channel(16);
    let (event_tx, event_rx) = mpsc::channel(64);
    let identity_path = config.identity_path.clone();
    let blob_provider = config.blob_provider.clone();

    let task = tokio::spawn(async move {
        info!("spawn_peer: task started, loading identity");
        let identity = NetIdentity::load_or_generate(&config.identity_path)?;
        let peer_id = identity.peer_id();

        let enable_mdns = config.enable_mdns;
        let join_decider = config.join_decider.clone();
        let keypair = identity.keypair().clone();
        info!(%peer_id, %enable_mdns, "spawn_peer: building libp2p swarm (tcp/quic/dns/ws/relay/behaviour)");
        // `spawn_peer` runs this whole block in a *detached* `tokio::spawn`
        // task (see this fn's doc comment) — nothing awaits `task` on the
        // happy path, only `soma_daemon::run`'s supervisor races it against
        // `peer_events.recv()` and only to relay a *later* death, not this
        // one. So if `build_peer_swarm` errors here, the `?` below would
        // otherwise return `Err` straight into the void: no log, no crash,
        // the daemon still reports "ready" (SQLite is independent of the
        // peer swarm) and the app looks fine while networking is silently
        // dead. This is exactly the failure mode that hid the
        // Android-specific websocket/DNS bug `transport.rs` now works
        // around — logging it loudly here means the *next* swarm-build
        // failure, on any platform and for any reason, is visible instead
        // of silent.
        let mut swarm = transport::build_peer_swarm(keypair, move |keypair, relay_client| {
            build_app_behaviour(enable_mdns, keypair, relay_client)
        })
        .await
        .inspect_err(|err| {
            tracing::error!(
                %peer_id,
                %err,
                "spawn_peer: build_peer_swarm failed — peer will not start (no listen, no \
                 dial, no mdns, no relay); daemon DB/UI stay usable but networking is dead"
            );
        })?;
        info!(%peer_id, "spawn_peer: swarm built, listening + dialing configured peers");
        let mut rendezvous_peers = HashSet::new();
        let mut relay_peers = HashMap::new();

        for addr in config.listen_addrs.drain(..) {
            if let Err(err) = swarm.listen_on(addr.clone()) {
                warn!(?err, ?addr, "failed to listen");
            }
        }

        for addr in &config.bootstrap_addrs {
            if let Err(err) = swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial bootstrap");
            }
        }

        for addr in &config.rendezvous_nodes {
            if let Some(peer_id) = extract_peer_id(addr) {
                rendezvous_peers.insert(peer_id);
            }
            if let Err(err) = swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial rendezvous node");
            }
        }

        for addr in &config.relay_addrs {
            if let Some(peer_id) = extract_peer_id(addr) {
                relay_peers.insert(peer_id, addr.clone());
            }
            if let Err(err) = swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial relay node");
            }
        }

        info!(%peer_id, "spawn_peer: entering run_swarm event loop");
        run_swarm(
            peer_id,
            config.rendezvous_namespace.unwrap_or_else(|| "soma".into()),
            config.relay_addrs,
            rendezvous_peers,
            relay_peers,
            join_decider.clone(),
            swarm,
            command_rx,
            event_tx,
            blob_provider,
            config.space_authorizer.clone(),
        )
        .await
    });

    let identity = NetIdentity::load_or_generate(&identity_path)?;

    Ok(PeerHandle {
        peer_id: identity.peer_id(),
        commands: command_tx,
        events: event_rx,
        task,
    })
}

/// Backwards-compatible helper for callers expecting the older ping-only API.
pub fn spawn_ping_peer(config: PeerConfig) -> SomaResult<PeerHandle> {
    spawn_peer(config)
}

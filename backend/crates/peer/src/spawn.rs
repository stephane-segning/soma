use crate::behaviour::build_app_behaviour;
use crate::config::PeerConfig;
use crate::runtime::{extract_peer_id, run_swarm};
use crate::{PeerHandle, transport};
use soma_core::SomaResult;
use soma_net::NetIdentity;
use std::collections::{HashMap, HashSet};
use tokio::sync::mpsc;
use tracing::warn;

/// Spawn a peer with ping + identify + optional mdns + rendezvous discovery.
pub fn spawn_peer(mut config: PeerConfig) -> SomaResult<PeerHandle> {
    let (command_tx, command_rx) = mpsc::channel(16);
    let (event_tx, event_rx) = mpsc::channel(64);
    let identity_path = config.identity_path.clone();
    let blob_provider = config.blob_provider.clone();

    let task = tokio::spawn(async move {
        let identity = NetIdentity::load_or_generate(&config.identity_path)?;
        let peer_id = identity.peer_id();

        let enable_mdns = config.enable_mdns;
        let join_decider = config.join_decider.clone();
        let keypair = identity.keypair().clone();
        let mut swarm = transport::build_peer_swarm(keypair, move |keypair, relay_client| {
            build_app_behaviour(enable_mdns, keypair, relay_client)
        })
        .await?;
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

use crate::PeerEvent;
use crate::behaviour::AppEvent;
use crate::runtime::{RuntimeState, relay_circuit_addr};
use libp2p::{identify, mdns, ping, relay, rendezvous, swarm::SwarmEvent};
use tracing::warn;

pub(super) async fn handle_swarm_event(state: &mut RuntimeState, event: SwarmEvent<AppEvent>) {
    match event {
        SwarmEvent::NewListenAddr { address, .. } => {
            state.swarm.add_external_address(address.clone());
            let _ = state.event_tx.try_send(PeerEvent::NewListenAddr {
                address,
                peer_id: state.peer_id,
            });
        }
        SwarmEvent::ListenerClosed { reason, .. } => {
            let _ = state.event_tx.try_send(PeerEvent::ListenerClosed {
                reason: format!("{reason:?}"),
            });
        }
        SwarmEvent::IncomingConnection { .. } => {}
        SwarmEvent::OutgoingConnectionError {
            peer_id: failed_peer,
            error,
            ..
        } => {
            let _ = state.event_tx.try_send(PeerEvent::ConnectionError {
                peer: failed_peer,
                error: error.to_string(),
            });
        }
        SwarmEvent::ConnectionClosed {
            peer_id: closed_peer,
            ..
        } => {
            let _ = state.event_tx.try_send(PeerEvent::ConnectionError {
                peer: Some(closed_peer),
                error: "closed".into(),
            });
        }
        SwarmEvent::ConnectionEstablished {
            peer_id: remote, ..
        } => handle_connection_established(state, remote),
        SwarmEvent::Behaviour(AppEvent::Ping(ping::Event { result, .. })) => match result {
            Ok(rtt) => {
                let _ = state.event_tx.try_send(PeerEvent::PingOk { rtt });
            }
            Err(err) => {
                let _ = state.event_tx.try_send(PeerEvent::PingErr {
                    error: format!("{err}"),
                });
            }
        },
        SwarmEvent::Behaviour(AppEvent::Relay(event)) => handle_relay_event(state, event),
        SwarmEvent::Behaviour(AppEvent::Identify(identify::Event::Received {
            peer_id,
            info,
            ..
        })) => {
            let _ = state.event_tx.try_send(PeerEvent::IdentifyReceived {
                peer: peer_id,
                agent: info.agent_version,
                protocols: info.protocols.len(),
                public_key: Some(info.public_key),
            });
        }
        SwarmEvent::Behaviour(AppEvent::Identify(_)) => {}
        SwarmEvent::Behaviour(AppEvent::Mdns(mdns::Event::Discovered(list))) => {
            for (_peer, addr) in &list {
                let _ = state.swarm.dial(addr.clone());
            }
            let _ = state
                .event_tx
                .try_send(PeerEvent::MdnsDiscovered { peers: list.len() });
        }
        SwarmEvent::Behaviour(AppEvent::Mdns(_)) => {}
        SwarmEvent::Behaviour(AppEvent::Rendezvous(event)) => handle_rendezvous_event(state, event),
        SwarmEvent::Behaviour(AppEvent::Join(event)) => {
            crate::runtime::join::handle_join_event(state, event).await;
        }
        SwarmEvent::Behaviour(AppEvent::JoinDecision(event)) => {
            crate::runtime::join::handle_join_decision_event(state, event).await;
        }
        SwarmEvent::Behaviour(AppEvent::IssuerOffer(event)) => {
            crate::runtime::issuer::handle_issuer_offer_event(state, event).await;
        }
        SwarmEvent::Behaviour(AppEvent::Blob(event)) => {
            crate::runtime::blob::handle_blob_event(state, event).await;
        }
        _ => {}
    }
}

fn handle_connection_established(state: &mut RuntimeState, remote: libp2p::PeerId) {
    let _ = state
        .event_tx
        .try_send(PeerEvent::ConnectionEstablished { peer: remote });

    if let Some(relay_addr) = state.relay_peers.get(&remote) {
        if state.requested_reservations.insert(remote) {
            if let Some(circuit) = relay_circuit_addr(&state.peer_id, relay_addr) {
                if let Err(err) = state.swarm.listen_on(circuit.clone()) {
                    warn!(?err, ?circuit, "failed to request relay reservation");
                }
            }
        }
    }

    if state.rendezvous_peers.contains(&remote) {
        let namespace = rendezvous::Namespace::new(state.rendezvous_namespace.clone())
            .unwrap_or_else(|_| rendezvous::Namespace::from_static("soma"));

        if let Err(err) =
            state
                .swarm
                .behaviour_mut()
                .rendezvous
                .register(namespace.clone(), remote, None)
        {
            warn!(?err, "rendezvous register failed");
        } else {
            state
                .swarm
                .behaviour_mut()
                .rendezvous
                .discover(Some(namespace), None, None, remote);
        }
    }
}

fn handle_relay_event(state: &RuntimeState, event: relay::client::Event) {
    match event {
        relay::client::Event::ReservationReqAccepted { relay_peer_id, .. } => {
            let _ = state.event_tx.try_send(PeerEvent::RelayReserved {
                relay: relay_peer_id,
            });
        }
        relay::client::Event::OutboundCircuitEstablished { relay_peer_id, .. } => {
            let _ = state.event_tx.try_send(PeerEvent::RelayCircuitEstablished {
                relay: relay_peer_id,
            });
        }
        _ => {}
    }
}

fn handle_rendezvous_event(state: &mut RuntimeState, event: rendezvous::client::Event) {
    match event {
        rendezvous::client::Event::Discovered { registrations, .. } => {
            let mut total = 0;
            for registration in registrations {
                total += 1;
                for addr in registration.record.addresses() {
                    let _ = state.swarm.dial(addr.clone());
                }
            }
            let _ = state.event_tx.try_send(PeerEvent::RendezvousDiscovered {
                registrations: total,
            });
        }
        rendezvous::client::Event::DiscoverFailed {
            rendezvous_node,
            error,
            ..
        }
        | rendezvous::client::Event::RegisterFailed {
            rendezvous_node,
            error,
            ..
        } => {
            let _ = state.event_tx.try_send(PeerEvent::ConnectionError {
                peer: Some(rendezvous_node),
                error: format!("rendezvous error: {error:?}"),
            });
        }
        _ => {}
    }
}

use libp2p::{Swarm, SwarmBuilder, identity, noise, relay, swarm::NetworkBehaviour, tls, yamux};
use soma_core::SomaResult;

/// Facade for building the peer swarm with the required transport stack order.
///
/// Ensures transports are composed as TCP -> QUIC -> DNS -> WebSocket -> relay client -> behaviour
/// to satisfy libp2p's typestate ordering while letting callers supply their own behaviour builder.
pub async fn build_peer_swarm<B, F>(
    keypair: identity::Keypair,
    build_behaviour: F,
) -> SomaResult<Swarm<B>>
where
    B: NetworkBehaviour,
    F: FnOnce(identity::Keypair, relay::client::Behaviour) -> B,
{
    let builder = SwarmBuilder::with_existing_identity(keypair.clone())
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default().nodelay(true),
            (tls::Config::new, noise::Config::new),
            yamux::Config::default,
        )
        .map_err(soma_core::Error::service)?
        .with_quic()
        .with_dns()
        .map_err(soma_core::Error::service)?;

    let builder = builder
        .with_websocket(
            (tls::Config::new, noise::Config::new),
            yamux::Config::default,
        )
        .await
        .map_err(soma_core::Error::service)?
        .with_relay_client(tls::Config::new, yamux::Config::default)
        .map_err(soma_core::Error::service)?;

    let builder = builder
        .with_behaviour(|keypair, relay_client| build_behaviour(keypair.clone(), relay_client))
        .map_err(soma_core::Error::service)?;

    Ok(builder.build())
}

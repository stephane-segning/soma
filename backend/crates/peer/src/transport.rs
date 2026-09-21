use libp2p::{Swarm, SwarmBuilder, identity, noise, relay, swarm::NetworkBehaviour, tls, yamux};
use soma_core::SomaResult;

/// Facade for building the peer swarm with the required transport stack order.
///
/// Ensures transports are composed as TCP -> QUIC -> DNS -> WebSocket -> relay client -> behaviour
/// to satisfy libp2p's typestate ordering while letting callers supply their own behaviour builder.
///
/// Android is the exception to "WebSocket" — see the `#[cfg(target_os = "android")]`
/// branch below.
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
        .with_quic();

    // Both `.with_dns()` here *and* `SwarmBuilder::with_websocket()` below
    // build a `libp2p_dns::tokio::Transport` under the hood, and for the
    // `tokio` provider that unconditionally calls
    // `hickory_resolver::system_conf::read_system_conf()`, i.e.
    // `File::open("/etc/resolv.conf")` (see that crate's
    // `system_conf/unix.rs`) — regardless of whether anything ever dials a
    // DNS-based multiaddr. Android has no such file: DNS there is
    // per-network, handed out by `netd`/`ConnectivityManager`, never a
    // global resolv.conf, so the read fails with a plain `ENOENT`.
    //
    // Confirmed by hand on a Pixel AVD (Android 16 / API 37, emulator):
    // before this fix, `build_peer_swarm` returned
    // `Err("proto error: io error: No such file or directory (os error 2)")`
    // out of the plain `.with_dns()` call below — and because `spawn_peer`'s
    // swarm-building task is a *detached* `tokio::spawn` whose `Result`
    // nothing awaited, that error used to vanish with zero log output (see
    // `spawn.rs`'s `build_peer_swarm(...).await` for the logging now added
    // for exactly this class of failure). The daemon still reported "ready"
    // (SQLite is independent of the peer swarm), so the app looked fine
    // while the peer was completely dead: no listen, no dial, no mDNS, no
    // relay.
    //
    // Fix, in two parts:
    //  1. Right here: use `.with_dns_config()` with a hardcoded resolver
    //     config instead of `.with_dns()` on Android, so construction never
    //     opens any file — `ResolverConfig::default()` is a fixed list of
    //     public DNS servers (Google's), not a system lookup.
    //  2. Below: `.with_websocket()`'s *internal second* DNS transport
    //     (built solely to resolve `dns4`/`dns6` websocket addresses) has
    //     no such config knob — it always calls `Transport::system()`
    //     directly, with no way to inject a config from outside `libp2p`.
    //     Skip websocket transport wiring on Android entirely and go
    //     straight to the relay-client shortcut `libp2p` exposes on the
    //     pre-websocket phase for exactly this (see its
    //     `builder/phase/websocket.rs`). Cost: no `ws`/`wss` listen or dial
    //     addresses on Android (`desktop_daemon::runtime` defaults to a
    //     plain `tcp` listen address on this target for the same reason).
    //     TCP, QUIC, DNS (via the fixed config from part 1), mDNS and relay
    //     (so rendezvous/NAT traversal) are all unaffected.
    #[cfg(not(target_os = "android"))]
    let builder = builder.with_dns().map_err(soma_core::Error::service)?;

    #[cfg(target_os = "android")]
    let builder = {
        tracing::warn!(
            "build_peer_swarm: Android has no /etc/resolv.conf — using a fixed public-DNS \
             config instead of the system resolver, and skipping websocket transport (its \
             internal DNS resolver has no config override); tcp/quic/mdns/relay unaffected — \
             see backend/crates/peer/src/transport.rs"
        );
        builder.with_dns_config(libp2p::dns::ResolverConfig::default(), libp2p::dns::ResolverOpts::default())
    };

    #[cfg(not(target_os = "android"))]
    let builder = builder
        .with_websocket(
            (tls::Config::new, noise::Config::new),
            yamux::Config::default,
        )
        .await
        .map_err(soma_core::Error::service)?;

    let builder = builder
        .with_relay_client(tls::Config::new, yamux::Config::default)
        .map_err(soma_core::Error::service)?;

    let builder = builder
        .with_behaviour(|keypair, relay_client| build_behaviour(keypair.clone(), relay_client))
        .map_err(soma_core::Error::service)?;

    Ok(builder.build())
}

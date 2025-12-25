use std::{
    env, fs,
    path::{Path, PathBuf},
};

use libp2p::{PeerId, Swarm, SwarmBuilder, identity, noise, swarm::NetworkBehaviour, tls, yamux};
use soma_core::SomaResult;

/// Manages libp2p identities and their filesystem locations.
#[derive(Clone, Debug)]
pub struct IdentityManager {
    base_dir: Option<PathBuf>,
}

impl IdentityManager {
    /// Create a manager that uses `SOMA_DATA_DIR` when present, otherwise `./data`.
    pub fn from_env() -> Self {
        let base_dir = env::var("SOMA_DATA_DIR")
            .ok()
            .map(PathBuf::from);
        Self { base_dir }
    }

    /// Create a manager with an explicit base directory.
    pub fn new(base_dir: impl Into<Option<PathBuf>>) -> Self {
        Self {
            base_dir: base_dir.into(),
        }
    }

    /// Compute a deterministic identity path for a service.
    pub fn default_identity_path(&self, service_name: &str) -> PathBuf {
        let base = self
            .base_dir
            .clone()
            .unwrap_or_else(|| PathBuf::from("data"));
        base.join(service_name).join("identity.key")
    }

    /// Generate a new identity at the given path and return it.
    pub fn generate(&self, path: impl AsRef<Path>) -> SomaResult<NetIdentity> {
        let id = NetIdentity::generate();
        id.save(path)?;
        Ok(id)
    }

    /// Load an identity from disk, generating and persisting a new one if missing.
    pub fn load_or_generate(&self, path: impl AsRef<Path>) -> SomaResult<NetIdentity> {
        NetIdentity::load_or_generate(path)
    }
}

/// Thin wrapper around a libp2p keypair with convenience helpers for logging and persistence.
#[derive(Clone)]
pub struct NetIdentity {
    keypair: identity::Keypair,
    peer_id: PeerId,
}

impl NetIdentity {
    /// Generate a new ECDSA identity.
    pub fn generate() -> Self {
        let keypair = identity::Keypair::generate_ecdsa();
        let peer_id = keypair.public().to_peer_id();
        Self { keypair, peer_id }
    }

    /// Load an identity from disk, generating and persisting a new one if missing.
    pub fn load_or_generate(path: impl AsRef<Path>) -> SomaResult<Self> {
        let path = path.as_ref();
        if path.exists() {
            let bytes = fs::read(path)?;
            let keypair = identity::Keypair::from_protobuf_encoding(&bytes)
                .map_err(soma_core::Error::service)?;
            let peer_id = keypair.public().to_peer_id();
            Ok(Self { keypair, peer_id })
        } else {
            let id = Self::generate();
            id.save(path)?;
            Ok(id)
        }
    }

    /// Persist the identity to disk in libp2p protobuf encoding.
    pub fn save(&self, path: impl AsRef<Path>) -> SomaResult<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let encoded = self
            .keypair
            .to_protobuf_encoding()
            .map_err(soma_core::Error::service)?;
        fs::write(path, encoded)?;
        Ok(())
    }

    /// Access the underlying keypair.
    pub fn keypair(&self) -> &identity::Keypair {
        &self.keypair
    }

    /// Return the peer id derived from the public key.
    pub fn peer_id(&self) -> PeerId {
        self.peer_id
    }
}

/// Build a tokio-backed libp2p swarm for the provided behaviour.
pub async fn build_swarm<B>(keypair: identity::Keypair, behaviour: B) -> SomaResult<Swarm<B>>
where
    B: NetworkBehaviour,
{
    let builder = SwarmBuilder::with_existing_identity(keypair).with_tokio();

    // IMPORTANT: The `SwarmBuilder` uses a typestate API. To combine multiple transports
    // (TCP + QUIC + DNS + WebSocket), the order matters:
    // TCP -> QUIC -> DNS -> WebSocket -> Behaviour.
    let builder = builder
        .with_tcp(
            libp2p::tcp::Config::default().nodelay(true),
            (tls::Config::new, noise::Config::new),
            yamux::Config::default,
        )
        .map_err(soma_core::Error::service)?;

    let builder = builder.with_quic();

    let builder = builder.with_dns().map_err(soma_core::Error::service)?;

    let builder = builder
        .with_websocket(
            (tls::Config::new, noise::Config::new),
            yamux::Config::default,
        )
        .await
        .map_err(soma_core::Error::service)?;

    let builder = builder
        .with_behaviour(|_| behaviour)
        .map_err(soma_core::Error::service)?;

    Ok(builder.build())
}

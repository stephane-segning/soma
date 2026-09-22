//! Roster replication policy for `/soma/roster/1`.
//!
//! Serving a roster is an authorization decision; ingesting one is a
//! verification decision, and they are not the same. Serving only needs
//! to know the caller belongs. Ingesting must not believe a single word
//! the sender says: every row is re-verified against the locally pinned
//! owner key by `soma_membership::verify_third_party_membership`, so a
//! relayed row is as trustworthy as a first-hand one and a forged one
//! is rejected no matter who carried it.
//!
//! This is what lets two non-owner members authorize each other. Before
//! it, a joiner recorded only its own membership, so it refused every
//! peer except the owner and every document had to route through the
//! owner.

use std::sync::Arc;

use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use prost::Message;
use soma_membership::{PeerKeyResolver, verify_third_party_membership};
use soma_peer::RosterProvider;
use soma_proto_build::space::MembershipCapability;
use soma_storage::RepositoryProvider;
use tracing::{debug, warn};

/// Refuse absurd rosters outright rather than verifying thousands of
/// signatures because a peer asked us to. Well above any real space.
const MAX_ROSTER_ENTRIES: usize = 512;

#[cfg(test)]
mod tests;

pub struct StorageRosterSync {
    repos: Arc<dyn RepositoryProvider>,
    local_peer_id: PeerId,
    /// Our own public key. `peer_public_keys` only ever holds *remote*
    /// peers learned via Identify, so without this a node cannot verify
    /// a capability it signed itself — which is every row an owner is
    /// offered back by its own members.
    local_public_key: PublicKey,
}

impl StorageRosterSync {
    pub fn new(
        repos: Arc<dyn RepositoryProvider>,
        local_peer_id: PeerId,
        local_public_key: PublicKey,
    ) -> Self {
        Self {
            repos,
            local_peer_id,
            local_public_key,
        }
    }

    fn repos(&self) -> &dyn RepositoryProvider {
        self.repos.as_ref()
    }
}

/// Resolves a peer's authenticated key from the persisted
/// `peer_public_keys` table, which `IdentifyStoreHandler` fills on every
/// Identify exchange. Same shape as the bot's resolver, and for the
/// same reason: this provider is constructed before `DaemonState`
/// exists (the peer must be configured before it can be spawned), so
/// it cannot reach the in-memory Identify cache that lives there.
///
/// This is why roster ingestion works in the normal case — you join a
/// space *through* its owner, so you have already Identify'd the owner
/// whose signature you now need to check. A row signed by a delegated
/// issuer you have never met cannot be resolved, and is refused rather
/// than assumed good.
struct StoredPeerKeyResolver<'a> {
    repos: &'a dyn RepositoryProvider,
    local: (&'a PeerId, &'a PublicKey),
}

#[async_trait]
impl PeerKeyResolver for StoredPeerKeyResolver<'_> {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey> {
        if peer == self.local.0 {
            return Some(self.local.1.clone());
        }
        self.repos
            .peer_keys_repo()
            .get(&peer.to_string())
            .await
            .ok()
            .flatten()
            .and_then(|row| PublicKey::try_decode_protobuf(&row.public_key).ok())
    }
}

#[async_trait]
impl RosterProvider for StorageRosterSync {
    async fn roster_for(&self, from: &PeerId, space_id: &str) -> Option<Vec<Vec<u8>>> {
        // Same gate as document sync, and for the same reason: the
        // roster of a space says who is in it, which is not public.
        if !crate::space_peers(self.repos(), space_id, &self.local_peer_id)
            .await
            .contains(from)
        {
            debug!(peer = %from, %space_id, "roster: refused, not a member");
            return None;
        }

        let rows = match self
            .repos()
            .membership_repo()
            .list_memberships(space_id)
            .await
        {
            Ok(rows) => rows,
            Err(err) => {
                warn!(%space_id, %err, "roster: failed to list memberships");
                return Some(Vec::new());
            }
        };

        // Only rows that carry their signed capability are worth
        // sending: one without it cannot be verified by the receiver,
        // so it would be dropped on arrival anyway.
        Some(rows.into_iter().filter_map(|m| m.capability).collect())
    }

    async fn ingest_roster(
        &self,
        from: &PeerId,
        space_id: &str,
        members: Vec<Vec<u8>>,
    ) -> Vec<PeerId> {
        if members.len() > MAX_ROSTER_ENTRIES {
            warn!(
                peer = %from,
                %space_id,
                count = members.len(),
                "roster: refusing an implausibly large roster"
            );
            return Vec::new();
        }

        let resolver = StoredPeerKeyResolver {
            repos: self.repos(),
            local: (&self.local_peer_id, &self.local_public_key),
        };
        let repo = self.repos().membership_repo();
        let mut learned: Vec<PeerId> = Vec::new();

        for bytes in members {
            let cap = match MembershipCapability::decode(bytes.as_slice()) {
                Ok(cap) => cap,
                Err(err) => {
                    debug!(peer = %from, %space_id, %err, "roster: undecodable entry");
                    continue;
                }
            };

            // The whole security property lives in this call: it checks
            // the signature against the *pinned* owner, refuses a space
            // with no anchor, and refuses a row describing us.
            let row = match verify_third_party_membership(
                repo.as_ref(),
                &resolver,
                &self.local_peer_id,
                space_id,
                &cap,
            )
            .await
            {
                Ok(row) => row,
                Err(err) => {
                    debug!(peer = %from, %space_id, %err, "roster: entry rejected");
                    continue;
                }
            };

            // `upsert_membership` is authority-gated and returns false
            // when an existing row blocks the write — a verified row is
            // still not allowed to overwrite a better-attested one.
            match repo.upsert_membership(&row).await {
                Ok(true) => {
                    if let Ok(peer) = row.subject_peer_id.parse() {
                        learned.push(peer);
                    }
                }
                Ok(false) => debug!(
                    %space_id,
                    subject = %row.subject_peer_id,
                    "roster: entry did not displace the existing row"
                ),
                Err(err) => warn!(%space_id, %err, "roster: failed to persist entry"),
            }
        }

        if !learned.is_empty() {
            debug!(peer = %from, %space_id, count = learned.len(), "roster: learned members");
        }
        learned
    }
}

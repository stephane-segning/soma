//! Shared test doubles for the membership-forgery regression tests.
//!
//! `#[cfg(test)]`-only. Kept in one place so `trust.rs`, `join_decisions.rs`,
//! and `join_decider/storage.rs` exercise the exact same fake rather than
//! three subtly-different hand-rolled copies.

use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use soma_core::SomaResult;
use soma_storage::membership::{
    JoinDecision as StoredDecision, JoinRequest as StoredJoinRequest, MembershipRepository, Space,
    SpaceMembership,
};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::trust::PeerKeyResolver;

/// Minimal in-memory `MembershipRepository` covering exactly the methods
/// the membership-forgery fix's call graph exercises
/// (`resolve_trust_anchor`, `pin_trust_anchor`,
/// `verify_inbound_issuer_capability`, `verify_and_apply_inbound_join_decision`,
/// `apply_join_decision`). Everything else panics if called — mirroring
/// the pattern already established by `space_creation.rs`'s
/// `RecordingMembershipRepo`, just covering more of the trait since these
/// tests exercise more of it.
#[derive(Default)]
pub(crate) struct FakeMembershipRepo {
    pub(crate) spaces: Mutex<HashMap<String, Space>>,
    pub(crate) outgoing_requests: Mutex<Vec<StoredJoinRequest>>,
    pub(crate) memberships: Mutex<HashMap<(String, String), SpaceMembership>>,
    pub(crate) decisions: Mutex<Vec<StoredDecision>>,
}

impl FakeMembershipRepo {
    /// Seed an outgoing (`is_outgoing = true`) join request as if this
    /// process (`subject_peer_id`) had itself previously called
    /// `JoinSpace` targeting `target_peer_id` for `space_id`. Tests use
    /// this to simulate "the local user legitimately asked this peer
    /// about this space".
    pub(crate) fn seed_outgoing_request(
        &self,
        space_id: &str,
        subject_peer_id: &PeerId,
        target_peer_id: &PeerId,
    ) {
        self.outgoing_requests
            .lock()
            .expect("requests lock")
            .push(StoredJoinRequest {
                request_id: format!("req-{space_id}-{target_peer_id}"),
                space_id: space_id.to_string(),
                subject_peer_id: subject_peer_id.to_string(),
                display_name: String::new(),
                device_name: String::new(),
                requested_role: 0,
                created_at: 0,
                payload: None,
                target_peer_id: Some(target_peer_id.to_string()),
                status: "pending".into(),
                attempts: 0,
                next_attempt_at: 0,
                last_error: None,
                is_outgoing: true,
            });
    }
}

#[async_trait]
impl MembershipRepository for FakeMembershipRepo {
    async fn upsert_space(&self, space: &Space) -> SomaResult<()> {
        // Mirrors the real SQL's COALESCE semantics: `owner_peer_id` is
        // sticky once set; `display_name` only overwritten when provided.
        let mut spaces = self.spaces.lock().expect("spaces lock");
        match spaces.get_mut(&space.space_id) {
            Some(existing) => {
                if existing.owner_peer_id.is_none() {
                    existing.owner_peer_id = space.owner_peer_id.clone();
                }
                if space.display_name.is_some() {
                    existing.display_name = space.display_name.clone();
                }
            }
            None => {
                spaces.insert(space.space_id.clone(), space.clone());
            }
        }
        Ok(())
    }

    async fn upsert_space_genesis(&self, _space_id: &str, _genesis: Vec<u8>) -> SomaResult<()> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn get_space_genesis(&self, _space_id: &str) -> SomaResult<Option<Vec<u8>>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn get_space(&self, space_id: &str) -> SomaResult<Option<Space>> {
        Ok(self
            .spaces
            .lock()
            .expect("spaces lock")
            .get(space_id)
            .cloned())
    }

    async fn list_spaces(
        &self,
        _owner_peer_id: Option<&str>,
        _query: Option<&str>,
        _created_after: Option<i64>,
        _created_before: Option<i64>,
        _limit: u32,
        _offset: u32,
    ) -> SomaResult<Vec<Space>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn delete_space(&self, _space_id: &str) -> SomaResult<u64> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn upsert_membership(&self, membership: &SpaceMembership) -> SomaResult<bool> {
        // Mirrors the real SQL's authority-gated conflict policy: allow
        // when there's no existing row, when the issuer is unchanged, or
        // when the new issuer is the space's pinned owner.
        let mut memberships = self.memberships.lock().expect("memberships lock");
        let key = (
            membership.space_id.clone(),
            membership.subject_peer_id.clone(),
        );
        if let Some(existing) = memberships.get(&key) {
            let owner = self
                .spaces
                .lock()
                .expect("spaces lock")
                .get(&membership.space_id)
                .and_then(|s| s.owner_peer_id.clone());
            let allowed = existing.issuer_peer_id == membership.issuer_peer_id
                || Some(membership.issuer_peer_id.clone()) == owner;
            if !allowed {
                return Ok(false);
            }
        }
        memberships.insert(key, membership.clone());
        Ok(true)
    }

    async fn delete_membership(&self, _space_id: &str, _subject_peer_id: &str) -> SomaResult<u64> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn get_membership(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<SpaceMembership>> {
        Ok(self
            .memberships
            .lock()
            .expect("memberships lock")
            .get(&(space_id.to_string(), subject_peer_id.to_string()))
            .cloned())
    }

    async fn list_memberships(&self, _space_id: &str) -> SomaResult<Vec<SpaceMembership>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn list_memberships_by_subject(
        &self,
        _subject_peer_id: &str,
    ) -> SomaResult<Vec<SpaceMembership>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn record_join_decision(&self, decision: &StoredDecision) -> SomaResult<()> {
        self.decisions
            .lock()
            .expect("decisions lock")
            .push(decision.clone());
        Ok(())
    }

    async fn latest_join_decision(
        &self,
        _space_id: &str,
        _subject_peer_id: &str,
    ) -> SomaResult<Option<StoredDecision>> {
        Ok(None)
    }

    async fn upsert_join_request(&self, req: &StoredJoinRequest) -> SomaResult<()> {
        self.outgoing_requests
            .lock()
            .expect("requests lock")
            .push(req.clone());
        Ok(())
    }

    async fn delete_join_request(&self, _request_id: &str) -> SomaResult<u64> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn get_join_request(&self, _request_id: &str) -> SomaResult<Option<StoredJoinRequest>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn list_join_requests(&self) -> SomaResult<Vec<StoredJoinRequest>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn list_join_requests_filtered(
        &self,
        _target_peer_id: Option<&str>,
        _is_outgoing: Option<bool>,
        _limit: Option<u32>,
        _offset: Option<u32>,
    ) -> SomaResult<Vec<StoredJoinRequest>> {
        unimplemented!("not exercised by the membership-forgery regression tests")
    }

    async fn find_outgoing_join_request(
        &self,
        space_id: &str,
        target_peer_id: &str,
    ) -> SomaResult<Option<StoredJoinRequest>> {
        Ok(self
            .outgoing_requests
            .lock()
            .expect("requests lock")
            .iter()
            .rev()
            .find(|r| {
                r.is_outgoing
                    && r.space_id == space_id
                    && r.target_peer_id.as_deref() == Some(target_peer_id)
            })
            .cloned())
    }
}

/// A [`PeerKeyResolver`] over a fixed, test-supplied `(PeerId, PublicKey)`
/// table — stands in for a real Identify cache / `peer_public_keys` table.
pub(crate) struct FixedKeyResolver(pub(crate) Vec<(PeerId, PublicKey)>);

#[async_trait]
impl PeerKeyResolver for FixedKeyResolver {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey> {
        self.0
            .iter()
            .find(|(id, _)| id == peer)
            .map(|(_, key)| key.clone())
    }
}

/// Minimal in-memory `IssuerRepository` for the bot-recruitment
/// (`join_decider::storage::self_issued_delegate_role`) regression tests.
/// Only `get`/`upsert`/`delete` are exercised; the rest panic loudly if
/// ever called, mirroring [`FakeMembershipRepo`]'s established style.
#[derive(Default)]
pub(crate) struct FakeIssuerRepo {
    caps: Mutex<HashMap<(String, String), soma_storage::issuer::IssuerCapability>>,
}

impl FakeIssuerRepo {
    pub(crate) fn seed(&self, cap: soma_storage::issuer::IssuerCapability) {
        self.caps
            .lock()
            .expect("caps lock")
            .insert((cap.space_id.clone(), cap.delegate_peer_id.clone()), cap);
    }
}

#[async_trait]
impl soma_storage::issuer::IssuerRepository for FakeIssuerRepo {
    async fn upsert(&self, cap: &soma_storage::issuer::IssuerCapability) -> SomaResult<()> {
        self.seed(cap.clone());
        Ok(())
    }

    async fn get(
        &self,
        space_id: &str,
        delegate_peer_id: &str,
    ) -> SomaResult<Option<soma_storage::issuer::IssuerCapability>> {
        Ok(self
            .caps
            .lock()
            .expect("caps lock")
            .get(&(space_id.to_string(), delegate_peer_id.to_string()))
            .cloned())
    }

    async fn list_by_space(
        &self,
        _space_id: &str,
    ) -> SomaResult<Vec<soma_storage::issuer::IssuerCapability>> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    async fn update_status(
        &self,
        _space_id: &str,
        _delegate_peer_id: &str,
        _status: &str,
    ) -> SomaResult<u64> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    async fn delete(&self, space_id: &str, delegate_peer_id: &str) -> SomaResult<u64> {
        let removed = self
            .caps
            .lock()
            .expect("caps lock")
            .remove(&(space_id.to_string(), delegate_peer_id.to_string()));
        Ok(if removed.is_some() { 1 } else { 0 })
    }
}

/// Minimal in-memory `InviteRepository` for the invite-redemption
/// regression tests. Mirrors [`FakeIssuerRepo`]'s style exactly: only the
/// methods the invite auto-approval path exercises are implemented with
/// real behaviour (`get`/`insert`/`try_consume`), matching the real
/// `SqlInviteRepository`'s guarded-`UPDATE` semantics for `try_consume` so
/// the replay-protection tests exercise the actual conflict policy, not a
/// simplified stand-in of it.
#[derive(Default)]
pub(crate) struct FakeInviteRepo {
    invites: Mutex<HashMap<(String, String), soma_storage::invites::Invite>>,
}

impl FakeInviteRepo {
    pub(crate) fn seed(&self, invite: soma_storage::invites::Invite) {
        self.invites.lock().expect("invites lock").insert(
            (invite.space_id.clone(), invite.invite_nonce.clone()),
            invite,
        );
    }
}

#[async_trait]
impl soma_storage::invites::InviteRepository for FakeInviteRepo {
    async fn insert(&self, invite: &soma_storage::invites::Invite) -> SomaResult<()> {
        self.seed(invite.clone());
        Ok(())
    }

    async fn get(
        &self,
        space_id: &str,
        invite_nonce: &str,
    ) -> SomaResult<Option<soma_storage::invites::Invite>> {
        Ok(self
            .invites
            .lock()
            .expect("invites lock")
            .get(&(space_id.to_string(), invite_nonce.to_string()))
            .cloned())
    }

    async fn list_by_space(
        &self,
        _space_id: &str,
    ) -> SomaResult<Vec<soma_storage::invites::Invite>> {
        unimplemented!("not exercised by the invite-redemption regression tests")
    }

    async fn revoke(&self, space_id: &str, invite_nonce: &str, revoked_at: i64) -> SomaResult<u64> {
        let mut invites = self.invites.lock().expect("invites lock");
        match invites.get_mut(&(space_id.to_string(), invite_nonce.to_string())) {
            Some(invite) if invite.revoked_at.is_none() => {
                invite.revoked_at = Some(revoked_at);
                Ok(1)
            }
            _ => Ok(0),
        }
    }

    async fn try_consume(&self, space_id: &str, invite_nonce: &str, now: i64) -> SomaResult<bool> {
        let mut invites = self.invites.lock().expect("invites lock");
        let Some(invite) = invites.get_mut(&(space_id.to_string(), invite_nonce.to_string()))
        else {
            return Ok(false);
        };
        let eligible = invite.revoked_at.is_none()
            && invite.expires_at.map(|exp| exp > now).unwrap_or(true)
            && (invite.multi_use || invite.redeemed_count == 0);
        if !eligible {
            return Ok(false);
        }
        invite.redeemed_count += 1;
        Ok(true)
    }
}

/// An always-empty `PeerPublicKeyRepository`. `StorageBackedJoinDecider::new`
/// constructs one unconditionally, but the bot-recruitment auto-approval
/// path never calls `.resolve()` on it (that's the point of gating on
/// local ground truth instead of a signature check) — so "always `None`"
/// is sufficient, and any real use would fail loudly in a way that's easy
/// to trace back here.
#[derive(Default)]
pub(crate) struct EmptyPeerKeyRepo;

#[async_trait]
impl soma_storage::peers::PeerPublicKeyRepository for EmptyPeerKeyRepo {
    async fn upsert(&self, _peer_id: &str, _public_key: &[u8], _updated_at: i64) -> SomaResult<()> {
        Ok(())
    }

    async fn get(&self, _peer_id: &str) -> SomaResult<Option<soma_storage::peers::PeerPublicKey>> {
        Ok(None)
    }
}

/// A [`soma_storage::RepositoryProvider`] wiring [`FakeMembershipRepo`] +
/// [`FakeIssuerRepo`] + [`EmptyPeerKeyRepo`] together — enough surface for
/// `join_decider::storage::StorageBackedJoinDecider` (the only consumer in
/// this crate that needs a full `RepositoryProvider` rather than one repo
/// trait at a time). The other four accessors are never called by that
/// code path and panic loudly if that ever changes.
#[derive(Default)]
pub(crate) struct FakeRepositoryProvider {
    pub(crate) membership: std::sync::Arc<FakeMembershipRepo>,
    pub(crate) issuer: std::sync::Arc<FakeIssuerRepo>,
    pub(crate) invites: std::sync::Arc<FakeInviteRepo>,
    pub(crate) peer_keys: std::sync::Arc<EmptyPeerKeyRepo>,
}

impl soma_storage::RepositoryProvider for FakeRepositoryProvider {
    fn membership_repo(&self) -> std::sync::Arc<dyn MembershipRepository> {
        self.membership.clone()
    }

    fn issuer_repo(&self) -> std::sync::Arc<dyn soma_storage::issuer::IssuerRepository> {
        self.issuer.clone()
    }

    fn invite_repo(&self) -> std::sync::Arc<dyn soma_storage::invites::InviteRepository> {
        self.invites.clone()
    }

    fn mailbox_repo(&self) -> std::sync::Arc<dyn soma_storage::mailbox::MailboxRepository> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    fn peer_keys_repo(&self) -> std::sync::Arc<dyn soma_storage::peers::PeerPublicKeyRepository> {
        self.peer_keys.clone()
    }

    fn document_repo(&self) -> std::sync::Arc<dyn soma_storage::documents::DocumentRepository> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    fn page_repo(&self) -> std::sync::Arc<dyn soma_storage::pages::PageRepository> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    fn blob_repo(&self) -> std::sync::Arc<dyn soma_storage::blobs::BlobRepository> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    fn agent_config_repo(
        &self,
    ) -> std::sync::Arc<dyn soma_storage::agent_config::AgentConfigRepository> {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }

    fn pool(&self) -> sqlx_utils::types::Pool {
        unimplemented!("not exercised by the bot-recruitment regression tests")
    }
}

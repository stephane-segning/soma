use soma_core::{Error, SomaResult};
use tracing::info;

use crate::state::DaemonState;

use super::{
    DaemonHandle,
    types::{RevokeIssuerCapabilityInput, RevokeSpaceInput},
};

/// Shared "owner or subject" authorization gate for membership-affecting
/// daemon operations (`revoke_space`, `revoke_issuer_capability`). Pure
/// so it's unit-testable without spinning up a live `DaemonState` — see
/// `handle/issuer.rs`'s `resolve_expires_at` for the established pattern
/// this follows.
///
/// `owner_peer_id` is `None` when the space's trust anchor isn't pinned
/// locally yet (e.g. a space this peer joined before the trust-anchor fix
/// landed and has received no inbound decision for since) — that fails
/// closed: an unprovable "am I the owner" is treated as "no", never as
/// "yes".
fn caller_is_owner_or_subject(
    owner_peer_id: Option<&str>,
    subject_peer_id: &str,
    caller: &str,
) -> bool {
    subject_peer_id == caller || owner_peer_id == Some(caller)
}

impl DaemonHandle {
    /// Revoke a space membership row. Returns `true` if a row was deleted.
    ///
    /// # Authorization
    ///
    /// Previously this had no authorization check at all: any local
    /// caller could revoke any `(space_id, subject_peer_id)` pair. The
    /// caller (this daemon's own identity, `self.state.peer_id`) must now
    /// be either:
    ///   - the space's locally pinned owner (`spaces.owner_peer_id`), or
    ///   - the subject being revoked — revoking your own membership
    ///     ("leave a space") is always self-authorized and needs no
    ///     pinned owner to check against.
    ///
    /// Anything else is rejected. A delegated issuer (bot) revoking a
    /// membership it approved is intentionally NOT supported here: the
    /// signed `Revocation` model in `proto/space/v1/membership.proto`
    /// (with its `IssuerRevocationPolicy`) is unimplemented end-to-end and
    /// out of scope for this fix — see the fix report's residual-risk
    /// notes.
    ///
    /// If the revoked membership is the local peer's own, the page/document
    /// cache for that space is also cleared.
    pub async fn revoke_space(&self, input: RevokeSpaceInput) -> SomaResult<bool> {
        let RevokeSpaceInput {
            space_id,
            subject_peer_id,
            ..
        } = input;
        let repo = self.state.repos.membership_repo();
        let caller = self.state.peer_id.to_string();
        let is_self_revoke = subject_peer_id == caller;

        if !is_self_revoke {
            let owner_peer_id = repo
                .get_space(&space_id)
                .await?
                .and_then(|space| space.owner_peer_id);
            if !caller_is_owner_or_subject(owner_peer_id.as_deref(), &subject_peer_id, &caller) {
                return Err(Error::service(
                    "not authorized to revoke this membership: caller is neither the space owner nor the subject",
                ));
            }
        }

        let rows = repo.delete_membership(&space_id, &subject_peer_id).await?;

        if rows > 0 && is_self_revoke {
            clear_space_local_cache(&self.state, &space_id).await?;
        }
        Ok(rows > 0)
    }

    /// Revoke a delegated bot's issuer capability. Returns `true` if the
    /// `issuer_capabilities` row was deleted.
    ///
    /// Previously there was no revoke path at all reaching
    /// `IssuerRepository::delete` anywhere in the codebase (ADR-0003:
    /// "Bots are explicit space members and can be removed by space
    /// owners" — nothing implemented the "removed" half). Authorized
    /// identically to [`Self::revoke_space`]: the caller must be either
    /// the space's locally pinned owner, or the bot itself
    /// (self-deregistration).
    ///
    /// Also best-effort deletes the matching `space_memberships` row for
    /// `(space_id, delegate_peer_id)`, if one exists. A delegated bot is
    /// now (since the bot-recruitment fix — see
    /// `soma_membership::join_decider::storage::self_issued_delegate_role`)
    /// an explicit space member in its own right, not just a name in
    /// `issuer_capabilities`; deleting only the delegation row would
    /// revoke the bot's ability to issue memberships to *others* while
    /// leaving its own membership (and therefore its ability to keep
    /// mirroring — `SpaceAuthorizer::can_read_space` checks exactly this
    /// row) fully intact. Failure to delete the membership row is logged
    /// but does not fail the call — the issuer-capability deletion is the
    /// authoritative signal the caller asked for, and is the row
    /// `IssuerRepository::delete` exists to remove.
    pub async fn revoke_issuer_capability(
        &self,
        input: RevokeIssuerCapabilityInput,
    ) -> SomaResult<bool> {
        let RevokeIssuerCapabilityInput {
            space_id,
            delegate_peer_id,
            ..
        } = input;
        let membership_repo = self.state.repos.membership_repo();
        let caller = self.state.peer_id.to_string();
        let is_self_revoke = delegate_peer_id == caller;

        if !is_self_revoke {
            let owner_peer_id = membership_repo
                .get_space(&space_id)
                .await?
                .and_then(|space| space.owner_peer_id);
            if !caller_is_owner_or_subject(owner_peer_id.as_deref(), &delegate_peer_id, &caller) {
                return Err(Error::service(
                    "not authorized to revoke this bot: caller is neither the space owner nor the bot itself",
                ));
            }
        }

        let rows = self
            .state
            .repos
            .issuer_repo()
            .delete(&space_id, &delegate_peer_id)
            .await?;

        if let Err(err) = membership_repo
            .delete_membership(&space_id, &delegate_peer_id)
            .await
        {
            tracing::warn!(
                %err, %space_id, %delegate_peer_id,
                "issuer capability revoked but failed to also delete the bot's space_memberships row"
            );
        }

        Ok(rows > 0)
    }
}

pub(crate) async fn clear_space_local_cache(state: &DaemonState, space_id: &str) -> SomaResult<()> {
    let page_rows = state
        .repos
        .page_repo()
        .delete_pages_for_space(space_id)
        .await?;
    let document_rows = state
        .repos
        .document_repo()
        .delete_documents_for_space(space_id)
        .await?;

    info!(
        %space_id,
        page_rows,
        document_rows,
        "cleared local page/document cache for revoked space membership"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mandatory regression coverage (item 4): an unauthorized caller —
    /// neither the space's pinned owner nor the subject/bot being
    /// revoked — must be rejected. This is the exact gate both
    /// `revoke_space` and `revoke_issuer_capability` run before touching
    /// storage.
    #[test]
    fn unrelated_caller_is_not_authorized() {
        assert!(
            !caller_is_owner_or_subject(Some("owner-peer"), "bot-peer", "random-third-party"),
            "a caller that is neither the owner nor the subject must be rejected"
        );
    }

    #[test]
    fn the_space_owner_is_authorized() {
        assert!(caller_is_owner_or_subject(
            Some("owner-peer"),
            "bot-peer",
            "owner-peer"
        ));
    }

    #[test]
    fn the_subject_itself_is_authorized_to_self_revoke() {
        assert!(caller_is_owner_or_subject(
            Some("owner-peer"),
            "bot-peer",
            "bot-peer"
        ));
    }

    #[test]
    fn self_revoke_is_authorized_even_with_no_pinned_owner() {
        // A space whose trust anchor isn't pinned locally yet must still
        // let the subject revoke its own row ("leave a space").
        assert!(caller_is_owner_or_subject(None, "bot-peer", "bot-peer"));
    }

    #[test]
    fn unpinned_owner_fails_closed_for_a_non_subject_caller() {
        // No pinned owner to check against, and the caller isn't the
        // subject either: an unprovable "am I the owner" must be treated
        // as "no", never as "yes".
        assert!(!caller_is_owner_or_subject(
            None,
            "bot-peer",
            "random-third-party"
        ));
    }
}

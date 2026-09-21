//! Space invite handle methods: create / list / revoke (owner side),
//! inspect (offline, invitee side), redeem (invitee side — dials the
//! issuer and submits a `JoinRequest`, reusing `joins::dispatch_join_request`
//! for the actual delivery bookkeeping so the two don't duplicate it).

use soma_core::SomaResult;
use soma_membership::InviteValidity as MembershipInviteValidity;
use soma_proto_build::space::SpaceRole;

use super::{
    DaemonHandle, invalid,
    joins::dispatch_join_request,
    parse_multiaddrs,
    types::{
        CreateInviteInput, InviteInspectionRecord, InviteRecord, InviteValidity, RedeemInviteInput,
        RevokeInviteInput,
    },
};

impl DaemonHandle {
    /// Create and persist a signed invite for `input.space_id`.
    ///
    /// # Authorization
    /// This daemon's own identity (`self.state.peer_id`) must be the
    /// space's pinned owner — see `soma_membership::create_invite`.
    ///
    /// Bootstrap multiaddrs are always this peer's own current listen
    /// addresses (the same set [`DaemonHandle::status`] reports); callers
    /// don't supply them.
    pub async fn create_invite(&self, input: CreateInviteInput) -> SomaResult<InviteRecord> {
        let CreateInviteInput {
            space_id,
            role,
            ttl_secs,
            label,
            multi_use,
        } = input;

        if space_id.trim().is_empty() {
            return Err(invalid("space_id required"));
        }
        let role = if role.trim().is_empty() {
            SpaceRole::Member
        } else {
            soma_membership::parse_role_str(&role).ok_or_else(|| invalid("invalid role"))?
        };
        let ttl_secs = (ttl_secs > 0).then_some(ttl_secs);
        let bootstrap_multiaddrs = self.state.listen_addrs.lock().await.clone();

        let summary = soma_membership::create_invite(
            self.state.repos.as_ref(),
            &self.state.signer,
            &self.state.peer_id,
            &space_id,
            role,
            ttl_secs,
            bootstrap_multiaddrs,
            label,
            multi_use,
        )
        .await?;

        Ok(to_invite_record(summary))
    }

    /// List every invite ever issued for `space_id` (revoked/expired
    /// included), newest first.
    pub async fn list_invites(&self, space_id: &str) -> SomaResult<Vec<InviteRecord>> {
        let rows = soma_membership::list_invites(self.state.repos.as_ref(), space_id).await?;
        Ok(rows.into_iter().map(to_invite_record).collect())
    }

    /// Revoke an invite so it can no longer be redeemed. Owner-gated —
    /// see `soma_membership::revoke_invite`.
    pub async fn revoke_invite(&self, input: RevokeInviteInput) -> SomaResult<bool> {
        let RevokeInviteInput { space_id, id } = input;
        soma_membership::revoke_invite(
            self.state.repos.as_ref(),
            &self.state.peer_id,
            &space_id,
            &id,
        )
        .await
    }

    /// Decode + offline-verify a `soma://invite/...` link. Touches
    /// neither the network nor any I/O — safe to call before the
    /// invitee ever dials anyone, so the renderer can show a trustworthy
    /// confirmation screen first. Never fails: every failure mode is a
    /// typed [`InviteValidity`] variant on the result instead.
    pub fn inspect_invite_link(&self, link: &str) -> InviteInspectionRecord {
        to_inspection_record(soma_membership::inspect_invite_link(link))
    }

    /// Redeem a `soma://invite/...` link: verify it (fail closed), pin
    /// the verified issuer as this space's trust anchor, and submit a
    /// `JoinRequest` to the issuer at the invite's bootstrap multiaddrs.
    /// Returns the same shape as [`DaemonHandle::join_space`] — a
    /// `request_id` the caller correlates against `stream_events` for the
    /// eventual `JoinDecision`.
    pub async fn redeem_invite(&self, input: RedeemInviteInput) -> SomaResult<String> {
        let RedeemInviteInput {
            link,
            display_name,
            device_name,
        } = input;

        let redemption = soma_membership::redeem_invite(
            self.state.repos.as_ref(),
            &self.state.signer,
            &link,
            display_name,
            device_name,
        )
        .await?;

        let addrs = parse_multiaddrs(redemption.bootstrap_multiaddrs)?;
        if addrs.is_empty() {
            return Err(invalid("invite has no usable bootstrap multiaddrs"));
        }

        dispatch_join_request(
            self,
            &redemption.space_id,
            redemption.issuer_peer_id,
            addrs,
            redemption.join_request,
        )
        .await
    }
}

fn to_invite_record(summary: soma_membership::InviteSummary) -> InviteRecord {
    InviteRecord {
        space_id: summary.space_id,
        id: summary.id,
        link: summary.link,
        issuer_peer_id: summary.issuer_peer_id,
        role: soma_membership::role_to_str(summary.role).to_string(),
        expires_at: summary.expires_at.unwrap_or(0),
        label: summary.label.unwrap_or_default(),
        multi_use: summary.multi_use,
        created_at: summary.created_at,
        revoked_at: summary.revoked_at.unwrap_or(0),
        redeemed_count: summary.redeemed_count,
    }
}

fn to_inspection_record(inspection: soma_membership::InviteInspection) -> InviteInspectionRecord {
    InviteInspectionRecord {
        validity: match inspection.validity {
            MembershipInviteValidity::Valid => InviteValidity::Valid,
            MembershipInviteValidity::InvalidSignature => InviteValidity::InvalidSignature,
            MembershipInviteValidity::Expired => InviteValidity::Expired,
            MembershipInviteValidity::Malformed => InviteValidity::Malformed,
        },
        space_id: inspection.space_id,
        space_label: inspection.space_label,
        role: inspection
            .role
            .map(soma_membership::role_to_str)
            .map(str::to_string),
        issuer_peer_id: inspection.issuer_peer_id,
        expires_at: inspection.expires_at,
        bootstrap_multiaddrs: inspection.bootstrap_multiaddrs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspection_validity_maps_one_to_one() {
        // Guards against the two `InviteValidity` enums (membership crate
        // vs this crate's proto-free mirror) silently drifting apart —
        // if a new variant is ever added to one, this match's
        // exhaustiveness (no wildcard arm) fails to compile until the
        // other is updated too.
        for validity in [
            MembershipInviteValidity::Valid,
            MembershipInviteValidity::InvalidSignature,
            MembershipInviteValidity::Expired,
            MembershipInviteValidity::Malformed,
        ] {
            let inspection = soma_membership::InviteInspection {
                validity,
                space_id: None,
                space_label: None,
                role: None,
                issuer_peer_id: None,
                expires_at: None,
                bootstrap_multiaddrs: Vec::new(),
            };
            let mapped = to_inspection_record(inspection).validity;
            let expected = match validity {
                MembershipInviteValidity::Valid => InviteValidity::Valid,
                MembershipInviteValidity::InvalidSignature => InviteValidity::InvalidSignature,
                MembershipInviteValidity::Expired => InviteValidity::Expired,
                MembershipInviteValidity::Malformed => InviteValidity::Malformed,
            };
            assert_eq!(mapped, expected);
        }
    }
}

use std::{str::FromStr, time::SystemTime};

use libp2p::PeerId;
use soma_core::SomaResult;
use soma_membership::issue_owned_issuer_capability_to_storage;

use super::{
    DaemonHandle, invalid,
    types::IssueIssuerCapabilityInput,
};

impl DaemonHandle {
    /// Issue an owner-gated issuer capability for `target_peer_id` over
    /// `space_id`. Stores the signed delegation locally. Returns `true` on
    /// success (the only success path), so the napi shim can present it as a
    /// boolean to JS.
    pub async fn issue_issuer_capability(
        &self,
        input: IssueIssuerCapabilityInput,
    ) -> SomaResult<bool> {
        let IssueIssuerCapabilityInput {
            space_id,
            target_peer_id,
            expires_at,
            alias,
        } = input;

        if space_id.trim().is_empty() {
            return Err(invalid("space_id required"));
        }
        if target_peer_id.trim().is_empty() {
            return Err(invalid("target_peer_id required"));
        }
        let target_peer_id =
            PeerId::from_str(&target_peer_id).map_err(|_| invalid("invalid target_peer_id"))?;

        let expires_at = if expires_at == 0 {
            None
        } else {
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map_err(|_| invalid("system clock before unix epoch"))?
                .as_secs() as i64;
            if expires_at <= now {
                return Err(invalid("expires_at must be in the future"));
            }
            Some(expires_at)
        };

        // Collapse whitespace-only aliases into None so the storage layer
        // never holds blank labels; trim everything else.
        let alias = alias.and_then(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        issue_owned_issuer_capability_to_storage(
            self.state.repos.as_ref(),
            &self.state.signer,
            &self.state.peer_id,
            &space_id,
            &target_peer_id,
            expires_at,
            alias,
        )
        .await?;
        Ok(true)
    }
}

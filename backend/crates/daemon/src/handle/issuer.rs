use std::{str::FromStr, time::SystemTime};

use libp2p::PeerId;
use soma_core::SomaResult;
use soma_membership::{bot_status, issue_owned_issuer_capability_to_storage};
use soma_peer::PeerCommand;
use tracing::warn;

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
            scopes,
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

        let issuer_cap = issue_owned_issuer_capability_to_storage(
            self.state.repos.as_ref(),
            &self.state.signer,
            &self.state.peer_id,
            &space_id,
            &target_peer_id,
            expires_at,
            alias,
            bot_status::PENDING,
            scopes,
        )
        .await?;

        // Fire `pending` event so the renderer's Bots tab can show the
        // row in the right initial state without waiting for the
        // network handshake.
        self.state
            .publish(soma_proto_build::daemon::DaemonEvent {
                event: Some(
                    soma_proto_build::daemon::daemon_event::Event::BotStatusChanged(
                        soma_proto_build::daemon::BotStatusChangedEvent {
                            space_id: space_id.clone(),
                            delegate_peer_id: target_peer_id.to_string(),
                            status: bot_status::PENDING.to_string(),
                        },
                    ),
                ),
            })
            .await;

        // Kick off the libp2p offer. The delivery_id is a per-issuance
        // correlation string; only one offer is outstanding per
        // (space, delegate) pair at a time, so the natural composite
        // works without a separate id source.
        let delivery_id = format!("{}|{}", space_id, target_peer_id);
        let send = self.state.peer_commands.try_send(PeerCommand::SendIssuerOffer {
            target: target_peer_id,
            addrs: Vec::new(),
            delivery_id,
            space_id: space_id.clone(),
            capability: issuer_cap,
        });
        if let Err(err) = send {
            // Peer task isn't running. The capability is persisted as
            // `pending` — operator can retry by re-issuing. We log and
            // fire `failed` so the renderer reflects the broken state.
            warn!(?err, "issuer offer dispatch failed (peer task unreachable)");
            let _ = self
                .state
                .repos
                .issuer_repo()
                .update_status(
                    &space_id,
                    &target_peer_id.to_string(),
                    bot_status::FAILED,
                )
                .await;
            self.state
                .publish(soma_proto_build::daemon::DaemonEvent {
                    event: Some(
                        soma_proto_build::daemon::daemon_event::Event::BotStatusChanged(
                            soma_proto_build::daemon::BotStatusChangedEvent {
                                space_id,
                                delegate_peer_id: target_peer_id.to_string(),
                                status: bot_status::FAILED.to_string(),
                            },
                        ),
                    ),
                })
                .await;
        }

        Ok(true)
    }
}

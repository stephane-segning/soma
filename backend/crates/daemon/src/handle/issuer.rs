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

/// Maximum lifetime that the daemon will sign into an issuer capability,
/// regardless of what the caller requests.
///
/// **180 days** (15_552_000 s) is the chosen ceiling. Rationale:
///  - Long enough that a legitimate bot deployment never hits it
///    accidentally (six months covers any reasonable quarterly/semi-annual
///    rotation cycle).
///  - Short enough to bound the blast radius if a capability is
///    compromised or the delegate peer goes rogue: worst-case exposure is
///    six months, not forever.
///  - The renderer's "Never" toggle passes `expires_at = 0`; the daemon
///    translates `0` → `now + MAX` rather than letting an unbounded
///    capability propagate. Callers that explicitly request a lifetime
///    longer than the ceiling receive an `invalid(…)` error so they can
///    correct the request rather than silently getting a shorter-than-asked
///    expiry.
pub const MAX_ISSUER_CAPABILITY_LIFETIME_SECS: u64 = 180 * 86_400; // 180 days

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

        // Resolve `expires_at` against the daemon-side policy ceiling.
        //
        // Contract with callers (renderer, napi shim, tests):
        //  - `expires_at == 0`  → "Never" toggle; translate to
        //    `now + MAX_ISSUER_CAPABILITY_LIFETIME_SECS` so the signed
        //    capability is always time-bounded.
        //  - `expires_at > 0 && expires_at <= now` → already-elapsed; reject.
        //  - `expires_at > now + MAX` → exceeds the ceiling; reject.
        //  - Otherwise → accept as-is.
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map_err(|_| invalid("system clock before unix epoch"))?
            .as_secs() as i64;
        let expires_at = Some(resolve_expires_at(expires_at, now)?);

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

// ---------------------------------------------------------------------------
// Policy helpers — extracted for unit-testing without a live DaemonState.
// ---------------------------------------------------------------------------

/// Resolve an `expires_at` epoch-seconds value against the daemon policy
/// ceiling.
///
/// Returns `Ok(resolved_expires_at_secs)` where the value is always
/// `Some(…)` — the daemon never persists an unbounded capability.
///
/// # Errors
/// - `expires_at > 0 && expires_at <= now_secs` → already elapsed.
/// - `expires_at > now_secs + MAX_ISSUER_CAPABILITY_LIFETIME_SECS` → exceeds
///   ceiling.
pub(crate) fn resolve_expires_at(
    expires_at: i64,
    now_secs: i64,
) -> Result<i64, soma_core::Error> {
    let max_expires_at = now_secs + MAX_ISSUER_CAPABILITY_LIFETIME_SECS as i64;
    if expires_at == 0 {
        Ok(max_expires_at)
    } else {
        if expires_at <= now_secs {
            return Err(invalid("expires_at must be in the future"));
        }
        if expires_at > max_expires_at {
            return Err(invalid(
                "expires_at exceeds maximum issuer capability lifetime",
            ));
        }
        Ok(expires_at)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Approximate "now" for test purposes — 2026-01-01 00:00:00 UTC.
    const FAKE_NOW: i64 = 1_767_225_600_i64;

    #[test]
    fn zero_becomes_ceiling() {
        let resolved = resolve_expires_at(0, FAKE_NOW).unwrap();
        assert_eq!(resolved, FAKE_NOW + MAX_ISSUER_CAPABILITY_LIFETIME_SECS as i64);
    }

    #[test]
    fn valid_future_date_accepted() {
        // One day in the future — well within the ceiling.
        let one_day = FAKE_NOW + 86_400;
        let resolved = resolve_expires_at(one_day, FAKE_NOW).unwrap();
        assert_eq!(resolved, one_day);
    }

    #[test]
    fn exact_ceiling_accepted() {
        let ceiling = FAKE_NOW + MAX_ISSUER_CAPABILITY_LIFETIME_SECS as i64;
        let resolved = resolve_expires_at(ceiling, FAKE_NOW).unwrap();
        assert_eq!(resolved, ceiling);
    }

    #[test]
    fn one_second_past_ceiling_rejected() {
        let over = FAKE_NOW + MAX_ISSUER_CAPABILITY_LIFETIME_SECS as i64 + 1;
        let err = resolve_expires_at(over, FAKE_NOW).unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("exceeds maximum"),
            "unexpected error message: {msg}"
        );
    }

    #[test]
    fn past_timestamp_rejected() {
        let past = FAKE_NOW - 1;
        let err = resolve_expires_at(past, FAKE_NOW).unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("future"),
            "unexpected error message: {msg}"
        );
    }

    #[test]
    fn now_itself_rejected() {
        // `expires_at == now` is not in the future.
        let err = resolve_expires_at(FAKE_NOW, FAKE_NOW).unwrap_err();
        assert!(err.to_string().contains("future"));
    }
}

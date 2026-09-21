//! Scope-keyed AI provider config — read/write/clear for the process-wide
//! default scope and a per-space scope.
//!
//! # Authorization
//!
//! The **default** scope is local-process config with no multi-peer
//! concept attached (nothing about it is ever shared over the P2P
//! protocol), so no caller-identity check applies — any local caller of
//! this daemon may read or write it.
//!
//! The **space** scope is different: it decides which LLM backend (and
//! whose API key) every member's chat traffic in that space flows
//! through, which is a space-wide, cost- and confidentiality-sensitive
//! setting. Unlike [`super::revoke::revoke_space`](super::DaemonHandle::revoke_space),
//! there is no "subject" to self-authorize against — there's no
//! self-service analog to "leave a space" for "reconfigure this space's
//! AI provider". So:
//!   - **Writes** (`upsert`, `clear`) require the caller to be the
//!     space's locally pinned owner (`spaces.owner_peer_id`). An
//!     unprovable "am I the owner" (`owner_peer_id` unpinned locally)
//!     fails closed — same precedent as `revoke.rs`.
//!   - **Reads** (`get`) require the caller to at least be a member —
//!     looser than writes (mirrors typical RBAC: read ⊆ members, write ⊆
//!     owner), and cheap to check since `AgentService` already re-reads
//!     config on every call (see `ensure_membership`).
//!
//! A space id equal to [`DEFAULT_AGENT_CONFIG_SCOPE`] is rejected
//! outright before either check runs — space ids are CUIDs and can't
//! literally collide with that sentinel, but callers must not rely on
//! that going unenforced.

use soma_core::{Error, SomaResult};
use soma_storage::agent_config::{
    AgentProviderConfigPatch, AgentProviderConfigRow, DEFAULT_AGENT_CONFIG_SCOPE,
};

use super::DaemonHandle;
use super::types::{AgentProviderConfigRecord, ApiKeyWrite, UpsertAgentProviderConfigInput};
use crate::handle::{ensure_membership, now_ms};

/// Space-scope AI-provider-config write gate: the caller must be the
/// space's locally pinned owner. See the module doc comment for why this
/// differs from `revoke.rs`'s "owner or subject" rule (no subject
/// analog here).
fn caller_is_space_owner(owner_peer_id: Option<&str>, caller: &str) -> bool {
    owner_peer_id == Some(caller)
}

fn reject_default_sentinel(space_id: &str) -> SomaResult<()> {
    if space_id == DEFAULT_AGENT_CONFIG_SCOPE {
        return Err(Error::service(
            "space_id must not equal the reserved \"default\" scope sentinel",
        ));
    }
    Ok(())
}

fn record_from_row(row: Option<AgentProviderConfigRow>) -> AgentProviderConfigRecord {
    let Some(row) = row else {
        return AgentProviderConfigRecord::default();
    };
    AgentProviderConfigRecord {
        provider: row.provider,
        base_url: row.base_url,
        api_key: row.api_key,
        chat_model: row.chat_model,
        embed_model: row.embed_model,
        request_timeout_ms: row.request_timeout_ms,
        poll_interval_ms: row.poll_interval_ms,
        updated_at_ms: Some(row.updated_at_ms),
    }
}

impl DaemonHandle {
    /// Read the process-wide default scope. Never fails on "not found" —
    /// an unsaved default scope reads back as an all-`None` record, the
    /// same shape a caller would see after `agent_config_clear_default`.
    pub async fn agent_config_get_default(&self) -> SomaResult<AgentProviderConfigRecord> {
        let repo = self.state.repos.agent_config_repo();
        Ok(record_from_row(repo.get(DEFAULT_AGENT_CONFIG_SCOPE).await?))
    }

    /// Read one space's scope. Requires the caller to be a member of
    /// `space_id` (see module doc comment); an unsaved space scope reads
    /// back as an all-`None` record, same as the default scope.
    pub async fn agent_config_get_space(
        &self,
        space_id: &str,
    ) -> SomaResult<AgentProviderConfigRecord> {
        reject_default_sentinel(space_id)?;
        ensure_membership(&self.state, space_id).await?;
        let repo = self.state.repos.agent_config_repo();
        Ok(record_from_row(repo.get(space_id).await?))
    }

    /// Create-or-replace the default scope's overrides. No caller-identity
    /// check — see module doc comment.
    pub async fn agent_config_upsert_default(
        &self,
        input: UpsertAgentProviderConfigInput,
        api_key: ApiKeyWrite,
    ) -> SomaResult<AgentProviderConfigRecord> {
        self.upsert_agent_config_scope(DEFAULT_AGENT_CONFIG_SCOPE, input, api_key)
            .await
    }

    /// Create-or-replace one space's overrides. Requires the caller to be
    /// `space_id`'s locally pinned owner (see module doc comment).
    /// `input.poll_interval_ms` must be `None` — a space scope never
    /// overrides the poll interval.
    pub async fn agent_config_upsert_space(
        &self,
        space_id: &str,
        input: UpsertAgentProviderConfigInput,
        api_key: ApiKeyWrite,
    ) -> SomaResult<AgentProviderConfigRecord> {
        reject_default_sentinel(space_id)?;
        if input.poll_interval_ms.is_some() {
            return Err(Error::service(
                "poll_interval_ms is only configurable on the default scope",
            ));
        }
        self.authorize_space_owner(space_id).await?;
        self.upsert_agent_config_scope(space_id, input, api_key)
            .await
    }

    /// Reset the default scope to fully inherit the compiled-in
    /// defaults. Returns `true` if a row existed and was removed.
    pub async fn agent_config_clear_default(&self) -> SomaResult<bool> {
        let rows = self
            .state
            .repos
            .agent_config_repo()
            .delete(DEFAULT_AGENT_CONFIG_SCOPE)
            .await?;
        Ok(rows > 0)
    }

    /// Reset one space's scope to fully inherit the default scope.
    /// Requires the caller to be `space_id`'s locally pinned owner (see
    /// module doc comment). Returns `true` if a row existed and was
    /// removed.
    pub async fn agent_config_clear_space(&self, space_id: &str) -> SomaResult<bool> {
        reject_default_sentinel(space_id)?;
        self.authorize_space_owner(space_id).await?;
        let rows = self
            .state
            .repos
            .agent_config_repo()
            .delete(space_id)
            .await?;
        Ok(rows > 0)
    }

    async fn authorize_space_owner(&self, space_id: &str) -> SomaResult<()> {
        let owner_peer_id = self
            .state
            .repos
            .membership_repo()
            .get_space(space_id)
            .await?
            .and_then(|space| space.owner_peer_id);
        let caller = self.state.peer_id.to_string();
        if !caller_is_space_owner(owner_peer_id.as_deref(), &caller) {
            return Err(Error::service(
                "not authorized to configure this space's AI provider: caller is not the space owner",
            ));
        }
        Ok(())
    }

    async fn upsert_agent_config_scope(
        &self,
        scope: &str,
        input: UpsertAgentProviderConfigInput,
        api_key: ApiKeyWrite,
    ) -> SomaResult<AgentProviderConfigRecord> {
        let repo = self.state.repos.agent_config_repo();
        let now = now_ms();
        repo.upsert(
            scope,
            &AgentProviderConfigPatch {
                provider: input.provider,
                base_url: input.base_url,
                chat_model: input.chat_model,
                embed_model: input.embed_model,
                request_timeout_ms: input.request_timeout_ms,
                poll_interval_ms: input.poll_interval_ms,
            },
            now,
        )
        .await?;
        match api_key {
            ApiKeyWrite::Unchanged => {}
            ApiKeyWrite::Clear => repo.set_api_key(scope, None, now).await?,
            ApiKeyWrite::Set(key) => repo.set_api_key(scope, Some(&key), now).await?,
        }
        Ok(record_from_row(repo.get(scope).await?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors `revoke.rs`'s `unrelated_caller_is_not_authorized`: a
    /// caller that is neither the pinned owner (there is no "subject"
    /// analog for this operation — see the module doc comment) must be
    /// rejected.
    #[test]
    fn unrelated_caller_is_not_authorized() {
        assert!(!caller_is_space_owner(
            Some("owner-peer"),
            "random-third-party"
        ));
    }

    #[test]
    fn the_space_owner_is_authorized() {
        assert!(caller_is_space_owner(Some("owner-peer"), "owner-peer"));
    }

    #[test]
    fn unpinned_owner_fails_closed() {
        // No pinned owner to check against: an unprovable "am I the
        // owner" must be treated as "no", never as "yes" — even for the
        // device's own identity.
        assert!(!caller_is_space_owner(None, "some-peer"));
    }

    #[test]
    fn a_bare_default_record_has_no_updated_at() {
        let record = record_from_row(None);
        assert_eq!(record.updated_at_ms, None);
        assert_eq!(record.provider, None);
        assert_eq!(record.api_key, None);
    }
}

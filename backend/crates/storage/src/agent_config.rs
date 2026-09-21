//! Scope-keyed AI provider configuration. One row per scope — either the
//! process-wide default ([`DEFAULT_AGENT_CONFIG_SCOPE`]) or a space id.
//! Every overridable column is nullable: `NULL` means "this scope doesn't
//! override that column" (resolution order — space row -> default row ->
//! the caller's own compiled-in constants — is a `desktop-agent` concern,
//! not this crate's; see `desktop_agent::config::resolve_workspace`).
//!
//! `api_key` is deliberately writable only through [`AgentConfigRepository::set_api_key`],
//! never through [`AgentConfigRepository::upsert`] — see that method's doc
//! comment for why (a future `SecretStore` swap should only have to
//! replace that one method).

use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx::Row;
use sqlx_utils::types::Pool;

/// Sentinel scope for the process-wide default row. Space ids are CUIDs
/// and can't literally collide with this, but callers must not rely on
/// that — `soma_daemon::handle::agent_config` guards against a space id
/// equal to this constant explicitly.
pub const DEFAULT_AGENT_CONFIG_SCOPE: &str = "default";

/// One scope's row, exactly as persisted. `api_key` carries the real
/// cleartext value — this type is for trusted in-process Rust callers
/// only (`desktop-agent`'s config resolver, building a Bearer header) and
/// must never be serialized onto a client-facing DTO. See
/// `soma_daemon::handle_types::AgentProviderConfigRecord`'s doc comment
/// for the presenter-facing projection (`has_api_key: bool`, no value).
#[derive(Debug, Clone)]
pub struct AgentProviderConfigRow {
    pub scope: String,
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub request_timeout_ms: Option<i64>,
    pub poll_interval_ms: Option<i64>,
    pub updated_at_ms: i64,
}

/// Whole-state overwrite for the non-secret columns of one scope's row.
/// `None` on any field clears that column back to "inherit" — this is a
/// full replace of every field named here, not a sparse patch, matching
/// the "auto-save on blur" settings UI, which always holds (and re-sends)
/// the complete form state for a scope. `api_key` is excluded on purpose;
/// write it via [`AgentConfigRepository::set_api_key`].
#[derive(Debug, Clone, Default)]
pub struct AgentProviderConfigPatch {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub request_timeout_ms: Option<i64>,
    pub poll_interval_ms: Option<i64>,
}

#[async_trait]
pub trait AgentConfigRepository: Send + Sync {
    /// `None` when nothing has ever been written for `scope` — every
    /// column implicitly "inherits".
    async fn get(&self, scope: &str) -> SomaResult<Option<AgentProviderConfigRow>>;

    /// Create-or-replace the non-secret columns for `scope`. Never
    /// touches `api_key` (its own `ON CONFLICT` SET list excludes that
    /// column), so calling this after `set_api_key` does not clobber a
    /// previously-saved key.
    async fn upsert(
        &self,
        scope: &str,
        patch: &AgentProviderConfigPatch,
        updated_at_ms: i64,
    ) -> SomaResult<()>;

    /// Set (`Some`) or clear (`None`) just the `api_key` column for
    /// `scope`, creating a bare row (every other column left `NULL`) if
    /// none exists yet. Kept as its own method — not folded into
    /// [`upsert`](Self::upsert) — so a future `SecretStore` swap (OS
    /// keychain, etc.) only has to replace this one method's
    /// implementation; every caller's API shape stays the same.
    async fn set_api_key(
        &self,
        scope: &str,
        api_key: Option<&str>,
        updated_at_ms: i64,
    ) -> SomaResult<()>;

    /// Whole-row delete — every column (including the key) reverts to
    /// inherit. Returns the number of rows removed (0 or 1).
    async fn delete(&self, scope: &str) -> SomaResult<u64>;
}

#[derive(Clone, Debug)]
pub struct SqlAgentConfigRepository {
    pool: Pool,
}

impl SqlAgentConfigRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl AgentConfigRepository for SqlAgentConfigRepository {
    async fn get(&self, scope: &str) -> SomaResult<Option<AgentProviderConfigRow>> {
        let row = sqlx::query(
            r#"
            SELECT scope, provider, base_url, api_key, chat_model, embed_model,
                   request_timeout_ms, poll_interval_ms, updated_at_ms
            FROM agent_provider_configs
            WHERE scope = $1
            "#,
        )
        .bind(scope)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_row))
    }

    async fn upsert(
        &self,
        scope: &str,
        patch: &AgentProviderConfigPatch,
        updated_at_ms: i64,
    ) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO agent_provider_configs (
                scope, provider, base_url, chat_model, embed_model,
                request_timeout_ms, poll_interval_ms, updated_at_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT(scope) DO UPDATE SET
                provider = excluded.provider,
                base_url = excluded.base_url,
                chat_model = excluded.chat_model,
                embed_model = excluded.embed_model,
                request_timeout_ms = excluded.request_timeout_ms,
                poll_interval_ms = excluded.poll_interval_ms,
                updated_at_ms = excluded.updated_at_ms
            "#,
        )
        .bind(scope)
        .bind(&patch.provider)
        .bind(&patch.base_url)
        .bind(&patch.chat_model)
        .bind(&patch.embed_model)
        .bind(patch.request_timeout_ms)
        .bind(patch.poll_interval_ms)
        .bind(updated_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn set_api_key(
        &self,
        scope: &str,
        api_key: Option<&str>,
        updated_at_ms: i64,
    ) -> SomaResult<()> {
        // Same create-or-update shape as `upsert`, but the `SET` list
        // names only `api_key` + `updated_at_ms` — every other column on
        // an existing row keeps its current value.
        sqlx::query(
            r#"
            INSERT INTO agent_provider_configs (scope, api_key, updated_at_ms)
            VALUES ($1, $2, $3)
            ON CONFLICT(scope) DO UPDATE SET
                api_key = excluded.api_key,
                updated_at_ms = excluded.updated_at_ms
            "#,
        )
        .bind(scope)
        .bind(api_key)
        .bind(updated_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn delete(&self, scope: &str) -> SomaResult<u64> {
        let res = sqlx::query("DELETE FROM agent_provider_configs WHERE scope = $1")
            .bind(scope)
            .execute(&self.pool)
            .await
            .map_err(Error::service)?;

        Ok(res.rows_affected())
    }
}

fn map_row(row: sqlx::any::AnyRow) -> AgentProviderConfigRow {
    AgentProviderConfigRow {
        scope: row.get("scope"),
        provider: row.get("provider"),
        base_url: row.get("base_url"),
        api_key: row.get("api_key"),
        chat_model: row.get("chat_model"),
        embed_model: row.get("embed_model"),
        request_timeout_ms: row.get("request_timeout_ms"),
        poll_interval_ms: row.get("poll_interval_ms"),
        updated_at_ms: row.get("updated_at_ms"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn repo() -> SqlAgentConfigRepository {
        static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
        // `sqlite::memory:` gives every *connection* its own isolated
        // database — with the pool's default of several connections, a
        // query can land on a fresh, unmigrated one ("no such table")
        // even though migration itself already succeeded on a different
        // connection. Pinning the pool to one connection keeps every
        // query in a test on the same in-memory database.
        let pool = soma_core::db::DbFactory::any("sqlite::memory:", &MIGRATOR)
            .max_connections(1)
            .build_any()
            .await
            .expect("build in-memory pool");
        SqlAgentConfigRepository::new(pool)
    }

    #[tokio::test]
    async fn missing_scope_reads_as_none() {
        let repo = repo().await;
        assert!(repo.get("default").await.expect("get").is_none());
    }

    #[tokio::test]
    async fn upsert_then_get_round_trips_every_column() {
        let repo = repo().await;
        repo.upsert(
            "default",
            &AgentProviderConfigPatch {
                provider: Some("openai-compatible".into()),
                base_url: Some("https://example.com/v1".into()),
                chat_model: Some("gpt-x".into()),
                embed_model: Some("embed-x".into()),
                request_timeout_ms: Some(15_000),
                poll_interval_ms: Some(9_000),
            },
            1_000,
        )
        .await
        .expect("upsert");

        let row = repo.get("default").await.expect("get").expect("row exists");
        assert_eq!(row.provider.as_deref(), Some("openai-compatible"));
        assert_eq!(row.base_url.as_deref(), Some("https://example.com/v1"));
        assert_eq!(row.chat_model.as_deref(), Some("gpt-x"));
        assert_eq!(row.embed_model.as_deref(), Some("embed-x"));
        assert_eq!(row.request_timeout_ms, Some(15_000));
        assert_eq!(row.poll_interval_ms, Some(9_000));
        assert_eq!(row.api_key, None, "upsert must never touch api_key");
        assert_eq!(row.updated_at_ms, 1_000);
    }

    #[tokio::test]
    async fn upsert_overwrites_a_field_back_to_null() {
        let repo = repo().await;
        let full = AgentProviderConfigPatch {
            provider: Some("openai-compatible".into()),
            base_url: Some("https://example.com".into()),
            chat_model: Some("gpt-x".into()),
            embed_model: None,
            request_timeout_ms: None,
            poll_interval_ms: None,
        };
        repo.upsert("space-1", &full, 1_000).await.expect("first upsert");

        // A second whole-state upsert with `base_url: None` must clear
        // it, proving this is a full replace, not a sparse patch that
        // only ever adds fields.
        repo.upsert(
            "space-1",
            &AgentProviderConfigPatch {
                base_url: None,
                ..full
            },
            2_000,
        )
        .await
        .expect("second upsert");

        let row = repo.get("space-1").await.expect("get").expect("row exists");
        assert_eq!(row.base_url, None);
        assert_eq!(row.chat_model.as_deref(), Some("gpt-x"), "untouched field survives");
    }

    #[tokio::test]
    async fn set_api_key_does_not_disturb_other_columns() {
        let repo = repo().await;
        repo.upsert(
            "default",
            &AgentProviderConfigPatch {
                chat_model: Some("gpt-x".into()),
                ..Default::default()
            },
            1_000,
        )
        .await
        .expect("upsert");

        repo.set_api_key("default", Some("sk-secret"), 2_000)
            .await
            .expect("set key");

        let row = repo.get("default").await.expect("get").expect("row exists");
        assert_eq!(row.api_key.as_deref(), Some("sk-secret"));
        assert_eq!(row.chat_model.as_deref(), Some("gpt-x"), "unrelated column preserved");
        assert_eq!(row.updated_at_ms, 2_000);
    }

    #[tokio::test]
    async fn set_api_key_creates_a_bare_row_when_none_existed() {
        let repo = repo().await;
        repo.set_api_key("space-1", Some("sk-secret"), 1_000)
            .await
            .expect("set key");

        let row = repo.get("space-1").await.expect("get").expect("row exists");
        assert_eq!(row.api_key.as_deref(), Some("sk-secret"));
        assert_eq!(row.chat_model, None);
    }

    #[tokio::test]
    async fn clearing_the_key_is_distinct_from_never_setting_it() {
        // Both end in `api_key == None`, but only one of them exercised
        // the clear path — proves `set_api_key(None)` genuinely writes
        // rather than being a no-op that happens to already match.
        let repo = repo().await;

        // Never set at all.
        repo.upsert("space-a", &AgentProviderConfigPatch::default(), 1_000)
            .await
            .expect("upsert a");
        assert_eq!(repo.get("space-a").await.expect("get a").unwrap().api_key, None);

        // Set, then explicitly cleared.
        repo.set_api_key("space-b", Some("sk-secret"), 1_000)
            .await
            .expect("set b");
        assert_eq!(
            repo.get("space-b").await.expect("get b").unwrap().api_key.as_deref(),
            Some("sk-secret")
        );
        repo.set_api_key("space-b", None, 2_000).await.expect("clear b");
        let cleared = repo.get("space-b").await.expect("get b again").unwrap();
        assert_eq!(cleared.api_key, None);
        assert_eq!(cleared.updated_at_ms, 2_000, "clearing still bumps updated_at_ms");
    }

    #[tokio::test]
    async fn delete_removes_the_row_entirely() {
        let repo = repo().await;
        repo.upsert("space-1", &AgentProviderConfigPatch::default(), 1_000)
            .await
            .expect("upsert");
        assert_eq!(repo.delete("space-1").await.expect("delete"), 1);
        assert!(repo.get("space-1").await.expect("get").is_none());
        assert_eq!(repo.delete("space-1").await.expect("delete again"), 0);
    }
}

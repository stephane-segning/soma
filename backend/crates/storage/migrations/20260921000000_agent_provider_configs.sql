-- Scope-keyed AI provider configuration. One row per scope: either the
-- process-wide default (scope = 'default') or a space id. Every
-- overridable column is nullable — NULL means "inherit" (space row ->
-- default row -> the embedding runtime's own compiled-in constants; this
-- table has no opinion on what those constants are).
--
-- Replaces the single global JSON blob previously stored under the Tauri
-- store key `agent.config` (desktop-only — `desktop-bff` could never
-- reach it, see AGENTS.md's old "Agent runtime configuration" section).
-- Hard cutover: no migration of old store data, no dual-read fallback.
--
-- `api_key` is written independently of the other columns (see
-- `soma-storage`'s `AgentConfigRepository::set_api_key`) so a future
-- `SecretStore` (OS keychain, etc.) can replace just that write/read path
-- without changing any caller's API shape. Stored in cleartext today —
-- OS-keychain-backed storage is explicitly deferred (the `keyring` crate
-- doesn't support Android, which would break the mobile build).
--
-- `poll_interval_ms` is meaningful only for `scope = 'default'`; a
-- space-scope row never sets it. Enforced by `soma-daemon`'s
-- `DaemonHandle` (rejects a space-scope write that sets it), not a DB
-- constraint, so the schema stays portable across SQLite/Postgres.
CREATE TABLE IF NOT EXISTS agent_provider_configs (
    scope TEXT PRIMARY KEY,
    provider TEXT,
    base_url TEXT,
    api_key TEXT,
    chat_model TEXT,
    embed_model TEXT,
    request_timeout_ms INTEGER,
    poll_interval_ms INTEGER,
    updated_at_ms INTEGER NOT NULL
);

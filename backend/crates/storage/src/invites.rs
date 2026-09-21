//! Issued space invites, keyed by `(space_id, invite_nonce)` — the local
//! ground truth `soma_membership::invite` checks a redeeming `JoinRequest`
//! against, mirroring how `issuer.rs`'s `issuer_capabilities` table is the
//! local ground truth `join_decider::storage::self_issued_delegate_role`
//! checks a bot-recruitment `JoinRequest` against.
//!
//! Replay protection lives entirely in [`InviteRepository::try_consume`]:
//! a single UPDATE, guarded in its `WHERE` clause, so a concurrent double
//! redemption of a single-use invite can never both succeed — whichever
//! caller's UPDATE commits first satisfies `redeemed_count = 0`; the
//! loser's UPDATE affects zero rows. No separate "consumed nonces" table
//! is needed because `invite_nonce` is already the primary key of the row
//! being conditionally updated.

use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

#[derive(Debug, Clone)]
pub struct Invite {
    pub space_id: String,
    /// Base64url (no padding) of the invite's random nonce bytes — see
    /// `soma_common::invite_link` for why this is a `String` here even
    /// though the wire proto (`InviteState.invite_nonce`) carries raw
    /// bytes: every other id-shaped column in this schema is `TEXT`, and
    /// a `TEXT` primary key sidesteps any question of whether a `BLOB`
    /// primary key column is well-supported across both SQLite and
    /// Postgres (this schema's two `AnyPool` backends) — no existing
    /// table in this schema uses one.
    pub invite_nonce: String,
    pub issuer_peer_id: String,
    /// `soma_membership::roles::role_to_str` representation, matching
    /// `space_memberships.role`'s convention.
    pub default_role: String,
    pub expires_at: Option<i64>,
    pub label: Option<String>,
    pub multi_use: bool,
    pub created_at: i64,
    pub revoked_at: Option<i64>,
    /// Incremented by `try_consume` on every successful redemption. For a
    /// single-use invite this is always `0` or `1`; for a multi-use
    /// invite it is an observability counter only (redemption is never
    /// blocked on it).
    pub redeemed_count: i64,
    /// `prost::Message::encode_to_vec()` of the full signed `InviteState`
    /// this row was created from — the canonical record of exactly what
    /// was signed, so a decider never has to reconstruct or re-derive it.
    pub state: Vec<u8>,
}

#[async_trait]
pub trait InviteRepository: Send + Sync {
    async fn insert(&self, invite: &Invite) -> SomaResult<()>;
    async fn get(&self, space_id: &str, invite_nonce: &str) -> SomaResult<Option<Invite>>;
    /// List every invite ever issued for `space_id`, newest first —
    /// revoked and expired rows included, so the owner-facing UI can show
    /// full history, not just currently-redeemable links.
    async fn list_by_space(&self, space_id: &str) -> SomaResult<Vec<Invite>>;
    /// Mark an invite revoked. Idempotent: revoking an already-revoked
    /// invite still returns `Ok`, `rows_affected` reflects whether this
    /// call was the one that set it.
    async fn revoke(&self, space_id: &str, invite_nonce: &str, revoked_at: i64) -> SomaResult<u64>;
    /// Atomically check eligibility AND record one redemption in a single
    /// guarded `UPDATE`, so two concurrent redemptions of the same
    /// single-use invite can never both succeed. Returns `true` iff THIS
    /// call was the one that consumed it (an invite that doesn't exist,
    /// is revoked, is expired, or is single-use and already redeemed all
    /// return `false` — never an error, since "not eligible" is an
    /// ordinary outcome, not a failure of the call itself).
    async fn try_consume(&self, space_id: &str, invite_nonce: &str, now: i64) -> SomaResult<bool>;
}

#[derive(Clone, Debug)]
pub struct SqlInviteRepository {
    pool: Pool,
}

impl SqlInviteRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl InviteRepository for SqlInviteRepository {
    async fn insert(&self, invite: &Invite) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO invites (
                space_id, invite_nonce, issuer_peer_id, default_role, expires_at,
                label, multi_use, created_at, revoked_at, redeemed_count, state
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
        )
        .bind(&invite.space_id)
        .bind(&invite.invite_nonce)
        .bind(&invite.issuer_peer_id)
        .bind(&invite.default_role)
        .bind(invite.expires_at)
        .bind(&invite.label)
        .bind(invite.multi_use as i64)
        .bind(invite.created_at)
        .bind(invite.revoked_at)
        .bind(invite.redeemed_count)
        .bind(&invite.state)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get(&self, space_id: &str, invite_nonce: &str) -> SomaResult<Option<Invite>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, invite_nonce, issuer_peer_id, default_role, expires_at,
                   label, multi_use, created_at, revoked_at, redeemed_count, state
            FROM invites
            WHERE space_id = $1 AND invite_nonce = $2
            "#,
        )
        .bind(space_id)
        .bind(invite_nonce)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_row))
    }

    async fn list_by_space(&self, space_id: &str) -> SomaResult<Vec<Invite>> {
        let rows = sqlx::query(
            r#"
            SELECT space_id, invite_nonce, issuer_peer_id, default_role, expires_at,
                   label, multi_use, created_at, revoked_at, redeemed_count, state
            FROM invites
            WHERE space_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(space_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_row).collect())
    }

    async fn revoke(&self, space_id: &str, invite_nonce: &str, revoked_at: i64) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            UPDATE invites
            SET revoked_at = $3
            WHERE space_id = $1 AND invite_nonce = $2 AND revoked_at IS NULL
            "#,
        )
        .bind(space_id)
        .bind(invite_nonce)
        .bind(revoked_at)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn try_consume(&self, space_id: &str, invite_nonce: &str, now: i64) -> SomaResult<bool> {
        let res = sqlx::query(
            r#"
            UPDATE invites
            SET redeemed_count = redeemed_count + 1
            WHERE space_id = $1 AND invite_nonce = $2
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > $3)
              AND (multi_use = 1 OR redeemed_count = 0)
            "#,
        )
        .bind(space_id)
        .bind(invite_nonce)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected() > 0)
    }
}

impl Repository<Invite> for SqlInviteRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Model for Invite {
    type Id = (String, String);

    fn get_id(&self) -> Option<Self::Id> {
        Some((self.space_id.clone(), self.invite_nonce.clone()))
    }
}

fn map_row(row: sqlx::any::AnyRow) -> Invite {
    Invite {
        space_id: row.get("space_id"),
        invite_nonce: row.get("invite_nonce"),
        issuer_peer_id: row.get("issuer_peer_id"),
        default_role: row.get("default_role"),
        expires_at: row.get("expires_at"),
        label: row.get("label"),
        multi_use: row.get::<i64>("multi_use") != 0,
        created_at: row.get("created_at"),
        revoked_at: row.get("revoked_at"),
        redeemed_count: row.get("redeemed_count"),
        state: row.get("state"),
    }
}

trait AnyRowExt {
    fn get<T: sqlx::Type<sqlx::Any> + for<'r> sqlx::Decode<'r, sqlx::Any> + Send + 'static>(
        &self,
        col: &str,
    ) -> T;
}

impl AnyRowExt for sqlx::any::AnyRow {
    fn get<T: sqlx::Type<sqlx::Any> + for<'r> sqlx::Decode<'r, sqlx::Any> + Send + 'static>(
        &self,
        col: &str,
    ) -> T {
        sqlx::Row::get(self, col)
    }
}

#[cfg(test)]
mod tests {
    //! Exercises `SqlInviteRepository` against a REAL (in-memory) SQLite
    //! connection, not `soma_membership::test_support::FakeInviteRepo` —
    //! the replay-protection guarantee is a property of the actual SQL in
    //! `try_consume`'s `WHERE` clause, and a hand-rolled Rust fake proves
    //! nothing about whether that SQL is correct. See
    //! `agent_config.rs::tests::repo` for the exact pattern this mirrors.
    use super::*;

    async fn repo() -> SqlInviteRepository {
        static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
        // `sqlite::memory:` gives every *connection* its own isolated
        // database — pin the pool to one connection so every query in a
        // test lands on the same in-memory database (see
        // `agent_config.rs::tests::repo`'s identical comment).
        let pool = soma_core::db::DbFactory::any("sqlite::memory:", &MIGRATOR)
            .max_connections(1)
            .build_any()
            .await
            .expect("build in-memory pool");
        SqlInviteRepository::new(pool)
    }

    fn sample(space_id: &str, nonce: &str) -> Invite {
        Invite {
            space_id: space_id.to_string(),
            invite_nonce: nonce.to_string(),
            issuer_peer_id: "owner-peer".to_string(),
            default_role: "editor".to_string(),
            expires_at: None,
            label: Some("Form 4 Maths".to_string()),
            multi_use: false,
            created_at: 1_000,
            revoked_at: None,
            redeemed_count: 0,
            state: vec![1, 2, 3],
        }
    }

    #[tokio::test]
    async fn insert_then_get_round_trips_every_column() {
        let repo = repo().await;
        repo.insert(&sample("space-1", "nonce-1"))
            .await
            .expect("insert");

        let stored = repo
            .get("space-1", "nonce-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.issuer_peer_id, "owner-peer");
        assert_eq!(stored.default_role, "editor");
        assert_eq!(stored.label.as_deref(), Some("Form 4 Maths"));
        assert!(!stored.multi_use);
        assert_eq!(stored.redeemed_count, 0);
        assert_eq!(stored.state, vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn get_returns_none_for_an_unknown_nonce() {
        let repo = repo().await;
        assert!(repo.get("space-1", "nope").await.expect("get").is_none());
    }

    /// Mandatory regression test (real SQL, not the fake): a single-use
    /// invite's nonce can be consumed exactly once.
    #[tokio::test]
    async fn try_consume_single_use_nonce_cannot_be_replayed() {
        let repo = repo().await;
        repo.insert(&sample("space-1", "nonce-1"))
            .await
            .expect("insert");

        assert!(
            repo.try_consume("space-1", "nonce-1", 2_000)
                .await
                .expect("first consume"),
            "first redemption of a single-use invite must succeed"
        );
        assert!(
            !repo
                .try_consume("space-1", "nonce-1", 2_001)
                .await
                .expect("second consume"),
            "replaying an already-consumed single-use nonce must fail"
        );

        let stored = repo
            .get("space-1", "nonce-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.redeemed_count, 1);
    }

    /// Two "simultaneous" redemption attempts against the SAME row: only
    /// one may win. Real concurrency (parallel tasks racing the same
    /// pool) is exercised, not just sequential calls, to prove the
    /// guard's atomicity holds under contention, not merely in the
    /// happy-path ordering the sequential test above already covers.
    #[tokio::test]
    async fn concurrent_redemption_of_a_single_use_invite_only_one_wins() {
        static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
        // Needs >1 connection for genuine concurrency, unlike `repo()`'s
        // single-connection pool.
        let pool = soma_core::db::DbFactory::any("sqlite::memory:", &MIGRATOR)
            .max_connections(1) // sqlite::memory: is per-connection; see below
            .build_any()
            .await
            .expect("build in-memory pool");
        // sqlite::memory: databases are per-connection, so genuine
        // cross-connection concurrency needs a file-backed (shared)
        // SQLite database instead — a plain in-memory one can't be
        // shared across the >1 connections real concurrency requires.
        drop(pool);
        let dir = tempdir();
        let db_path = dir.join("invites-concurrency-test.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.display());
        let pool = soma_core::db::DbFactory::any(&url, &MIGRATOR)
            .max_connections(4)
            .build_any()
            .await
            .expect("build file-backed pool");
        let repo = SqlInviteRepository::new(pool);
        repo.insert(&sample("space-1", "nonce-1"))
            .await
            .expect("insert");

        let repo = std::sync::Arc::new(repo);
        let mut tasks = Vec::new();
        for i in 0..8u32 {
            let repo = repo.clone();
            tasks.push(tokio::spawn(async move {
                repo.try_consume("space-1", "nonce-1", 2_000 + i as i64)
                    .await
                    .expect("try_consume")
            }));
        }
        let mut wins = 0;
        for task in tasks {
            if task.await.expect("task panicked") {
                wins += 1;
            }
        }
        assert_eq!(
            wins, 1,
            "exactly one of 8 concurrent redemption attempts must win"
        );

        let stored = repo
            .get("space-1", "nonce-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.redeemed_count, 1);
        let _ = std::fs::remove_file(&db_path);
    }

    #[tokio::test]
    async fn try_consume_multi_use_allows_repeated_redemption() {
        let repo = repo().await;
        let mut invite = sample("space-1", "nonce-1");
        invite.multi_use = true;
        repo.insert(&invite).await.expect("insert");

        for attempt in 0..5 {
            assert!(
                repo.try_consume("space-1", "nonce-1", 2_000 + attempt)
                    .await
                    .expect("consume"),
                "multi-use redemption {attempt} should succeed"
            );
        }

        let stored = repo
            .get("space-1", "nonce-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.redeemed_count, 5);
    }

    #[tokio::test]
    async fn try_consume_rejects_a_revoked_invite() {
        let repo = repo().await;
        repo.insert(&sample("space-1", "nonce-1"))
            .await
            .expect("insert");
        assert_eq!(
            repo.revoke("space-1", "nonce-1", 1_500)
                .await
                .expect("revoke"),
            1
        );

        assert!(
            !repo
                .try_consume("space-1", "nonce-1", 2_000)
                .await
                .expect("consume"),
            "a revoked invite must never be consumable"
        );
    }

    #[tokio::test]
    async fn try_consume_rejects_an_expired_invite() {
        let repo = repo().await;
        let mut invite = sample("space-1", "nonce-1");
        invite.expires_at = Some(1_500);
        repo.insert(&invite).await.expect("insert");

        assert!(
            !repo
                .try_consume("space-1", "nonce-1", 2_000)
                .await
                .expect("consume"),
            "an invite past its expires_at must never be consumable"
        );
    }

    /// Mandatory regression test (real SQL): an invite issued for one
    /// space cannot be consumed under a different space_id, even with
    /// the identical nonce -- the composite primary key is what enforces
    /// this.
    #[tokio::test]
    async fn try_consume_ignores_an_invite_issued_for_a_different_space() {
        let repo = repo().await;
        repo.insert(&sample("space-A", "nonce-1"))
            .await
            .expect("insert");

        assert!(
            !repo
                .try_consume("space-B", "nonce-1", 2_000)
                .await
                .expect("consume"),
            "an invite for space A must not be consumable under space B"
        );
        let untouched = repo
            .get("space-A", "nonce-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(untouched.redeemed_count, 0);
    }

    #[tokio::test]
    async fn revoke_is_idempotent_and_reports_whether_it_changed_anything() {
        let repo = repo().await;
        repo.insert(&sample("space-1", "nonce-1"))
            .await
            .expect("insert");

        assert_eq!(
            repo.revoke("space-1", "nonce-1", 1_500)
                .await
                .expect("first revoke"),
            1,
            "first revoke of a live invite affects one row"
        );
        assert_eq!(
            repo.revoke("space-1", "nonce-1", 1_600)
                .await
                .expect("second revoke"),
            0,
            "revoking an already-revoked invite affects zero rows"
        );
    }

    #[tokio::test]
    async fn list_by_space_returns_newest_first_and_only_that_space() {
        let repo = repo().await;
        let mut a = sample("space-1", "nonce-a");
        a.created_at = 1_000;
        let mut b = sample("space-1", "nonce-b");
        b.created_at = 2_000;
        let other = sample("space-2", "nonce-c");
        repo.insert(&a).await.expect("insert a");
        repo.insert(&b).await.expect("insert b");
        repo.insert(&other).await.expect("insert other");

        let rows = repo.list_by_space("space-1").await.expect("list");
        assert_eq!(
            rows.iter()
                .map(|r| r.invite_nonce.as_str())
                .collect::<Vec<_>>(),
            vec!["nonce-b", "nonce-a"],
            "newest first, and scoped to the requested space only"
        );
    }

    fn tempdir() -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("soma-invites-test-{:016x}", rand_u64_from_time()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn rand_u64_from_time() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64
    }
}

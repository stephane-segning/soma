//! Shared `#[cfg(test)]` scaffolding for bot event-handler tests.
//!
//! Unlike `soma_membership`'s fakes (`crate::test_support` there), there's
//! no trait-object seam to fake here: `BotState.repos` is the concrete
//! `soma_storage::RepositoryFactory`, wired straight to a SQLx `AnyPool`.
//! So "construct a `BotState`" necessarily means "stand up a real (if
//! throwaway) SQLite database and run the real migrations" -- there is no
//! lighter-weight substitute available at this layer. Kept in one place so
//! `identify_store.rs` and `issuer_inbound.rs` exercise the exact same
//! setup rather than subtly-different hand-rolled copies.

use std::path::PathBuf;

use libp2p::PeerId;
use libp2p::identity::Keypair;
use soma_peer::PeerCommand;
use soma_storage::RepositoryFactory;
use tokio::sync::mpsc;

use crate::commands::bot::http::{BotInfo, BotState};
use crate::commands::bot::metrics::BotMetrics;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");

/// Stand up a throwaway SQLite-backed `RepositoryFactory` with real
/// migrations applied. The returned `TempDir` must be kept alive for as
/// long as `repos` is in use (dropping it deletes the database file).
pub(super) async fn test_repos() -> (tempfile::TempDir, RepositoryFactory) {
    let dir = tempfile::tempdir().expect("tempdir");
    let db_path = dir.path().join("bot-event-handler-test.db");
    let url = format!("sqlite://{}", db_path.display());
    let repos = soma_storage::bootstrap::connect_any(&url, &MIGRATOR)
        .await
        .expect("connect test db");
    (dir, repos)
}

/// Build a `BotState` around already-connected `repos`, an arbitrary
/// signing identity, and a fresh (never-full, so `.send().await` never
/// blocks in a test) `PeerCommand` channel. Returns the receiver too, so
/// tests can assert on commands the handler under test dispatched.
pub(super) fn test_state(
    repos: RepositoryFactory,
    peer_id: PeerId,
    signer: Keypair,
) -> (BotState, mpsc::Receiver<PeerCommand>) {
    let (tx, rx) = mpsc::channel::<PeerCommand>(8);
    let state = BotState {
        info: BotInfo {
            peer_id: peer_id.to_string(),
            blob_dir: PathBuf::from("."),
        },
        peer_id,
        metrics: BotMetrics::new(),
        repos,
        signer,
        peer_commands: tx,
    };
    (state, rx)
}

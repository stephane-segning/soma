//! `somad bot` — headless peer (bot/admin modes).
//!
//! Ported from the former `bins/botd`. Shared peer logic lives in
//! `crates/peer`; storage in `crates/storage`; HTTP/admin surfaces and
//! event handlers live in this module (they're bot-specific orchestration).

mod config;
mod event_handlers;
mod http;
mod metrics;
mod runtime;

pub use config::Args;

pub async fn run(args: Args) -> anyhow::Result<()> {
    runtime::run(args).await
}

//! Route registration. Each `POST /api/v1/<command>` handler is a
//! one-line adapter that defers to `desktop_api::*`, mirroring the
//! `#[tauri::command]` surface exposed by `desktop-commands` 1:1.
//!
//! Submodules are split per domain to mirror the layout of
//! `desktop-api`. Adding a new command means lifting the matching
//! `#[tauri::command]` from `desktop-commands` into the parallel
//! `axum`-flavored shim in this directory.

use std::sync::Arc;

use axum::Router;
use desktop_api::AppState;

use crate::ws;

mod agent;
mod agent_config;
mod blobs;
mod daemon;
mod documents;
mod invites;
mod practice;
mod search;
mod spaces;

/// Per-request body cap for the `blobs_*` routes that carry payload
/// bytes. axum's default `Json` / `Bytes` extractor caps at 2 MiB, which
/// is too tight for a real blob upload (images, PDFs, recorded audio).
/// 100 MiB matches the renderer's expectation that "anything that fits
/// in memory" uploads in a single round-trip. Routes that don't carry
/// binary payloads stay on the global axum default.
pub(crate) const BLOB_UPLOAD_MAX_BYTES: usize = 100 * 1024 * 1024;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .merge(spaces::router())
        .merge(invites::router())
        .merge(documents::router())
        .merge(blobs::router())
        .merge(daemon::router())
        .merge(agent::router())
        .merge(agent_config::router())
        .merge(practice::router())
        .merge(search::router())
        // `any`, not `get`: WebSocket upgrades are `GET` on HTTP/1.1 but
        // `CONNECT` from HTTP/2 clients onward — see the axum `ws` module
        // docs. SSE is gone (hard cutover, no dual SSE+WS path).
        .route("/api/v1/ws", ws::route())
}

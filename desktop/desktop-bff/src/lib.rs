//! Authenticated HTTP/WebSocket presenter that wraps the `desktop-api`
//! handler surface.
//!
//! The Tauri shell exposes the same handlers via `#[tauri::command]`s in
//! `desktop-commands`; this crate exposes them as axum routes so the
//! `@soma/sdk`'s `httpTransport` can drive them across the network — the
//! backend role for the web target (REST + WebSocket, not a bespoke
//! service; see the crate's role in AGENTS.md's "Desktop Host").
//!
//! Wire shape:
//! * Commands → `POST {baseUrl}/api/v1/<command_name>` with JSON body
//!   (the args object directly — no `{args: ...}` envelope, matching what
//!   `desktop-sdk/src/transport/http.ts` sends).
//! * Events  → `GET {baseUrl}/api/v1/ws` over WebSocket (SSE is gone —
//!   hard cutover). See `ws`'s module doc for the full frame contract.
//! * Blob bytes → `GET {baseUrl}/api/v1/blobs/{space_id}/{cid}`, suitable
//!   for `<img src>`. See `routes::blobs`'s doc comment.
//!
//! Every request — including the WebSocket upgrade — must present a
//! bearer token (see `auth`'s module doc). There is no unauthenticated
//! route in this crate.
//!
//! Business logic stays in `desktop-api` — every route here is a one-liner
//! that maps `args → desktop_api::*::* → ApiError`.

pub mod auth;
pub mod error;
pub mod routes;
pub mod state;
pub mod ws;

pub use error::ApiError;
pub use state::{BffConfig, UserDataDir, build_router};

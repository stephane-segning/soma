//! HTTP/SSE presenter that wraps the `desktop-api` handler surface.
//!
//! The Tauri shell exposes the same handlers via `#[tauri::command]`s in
//! `desktop-commands`; this crate exposes them as axum routes so the
//! `@soma/sdk`'s `httpTransport` can drive them across the network.
//!
//! Wire shape:
//! * Commands → `POST {baseUrl}/api/v1/<command_name>` with JSON body
//!   (the args object directly — no `{args: ...}` envelope, matching what
//!   `desktop-sdk/src/transport/http.ts` sends).
//! * Events  → `GET {baseUrl}/api/v1/events` over SSE; each message is a
//!   JSON-encoded `DomainEvent`, tagged with event name `domain_event`.
//!
//! Business logic stays in `desktop-api` — every route here is a one-liner
//! that maps `args → desktop_api::*::* → ApiError`.

pub mod error;
pub mod routes;
pub mod sse;
pub mod state;

pub use error::ApiError;
pub use state::{BffConfig, build_router};

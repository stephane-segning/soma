//! Non-daemon main-process services for the Soma Tauri shell.
//!
//! Mirrors the old Electron `desktop/soma/src/main/services/*` modules that
//! do not directly drive `soma-daemon` / `soma-agentd`:
//!
//! * [`logger`] — tracing setup (winston/daily-rotate parity).
//! * [`app_store`] — `tauri-plugin-store` wrapper for settings + reactDb.
//! * [`upload_payload_store`] — staging area for renderer-to-daemon uploads.
//! * [`blob_processing`] — zip helpers for blob exports.
//! * [`blob_protocol`] — `soma-blob://` URI scheme registration.
//! * [`events`] — domain / agent event broadcasters that fan out to all
//!   webview windows.

pub mod app_store;
pub mod blob_processing;
pub mod blob_protocol;
pub mod events;
pub mod logger;
pub mod practice;
pub mod upload_payload_store;

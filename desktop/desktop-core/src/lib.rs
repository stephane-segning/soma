//! Shared types, errors, and event payloads for the Soma Tauri desktop shell.
//!
//! This crate intentionally has no Tauri or daemon dependencies — it is the
//! lowest layer in the desktop runtime and is consumed by every other
//! `desktop-*` crate.

pub mod error;
pub mod events;

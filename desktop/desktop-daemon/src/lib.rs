//! In-process daemon runtime + client surface.
//!
//! Replaces the Electron-side `addon-runtime.ts` (daemon half) +
//! `daemon-client.ts` + `daemon-client/types.ts`. Phase 1 carries the
//! lifecycle wrapper only; the full client surface lands in Phase 2.

pub mod blob_reader;
pub mod events;
pub mod runtime;

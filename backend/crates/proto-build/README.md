# `soma-proto-build`

`backend/crates/proto-build` is the Rust-side contract consumer for the shared `.proto` definitions.

- Source contracts: `proto/`
- Default proto root: resolved from `CARGO_MANIFEST_DIR` to the workspace `proto/` directory
- Override for split-readiness work: set `SOMA_PROTO_ROOT=/absolute/path/to/proto`
- Generated Rust sources are not checked in; Cargo builds them into `OUT_DIR`

This crate is intentionally small so it can later be replaced by a published `soma-proto` crate with minimal downstream churn.

~~- Refactor `backend/bins/*` so `main.rs` only boots (parse CLI + init tracing + call `run_*`), moving runtime logic into library/app modules.~~
~~- Extract shared tracing init into `soma-core` (`soma_core::telemetry`) and switch all Rust binaries to use it.~~
~~- Fix Rust workspace dependency policy violations (move leaf `reqwest` pin to `backend/Cargo.toml`, align `soma-cache` to `workspace.package`).~~
~~- Reduce duplication by extracting: (1) mailbox/outbox worker used by `daemon` and `botd`, (2) shared filesystem blob backend implementing `BlobProvider`.~~
- Split large modules into cohesive submodules: `soma-peer` (protocol modules) and `soma-membership` (decider/workflows/payloads).
- Add/refresh docs for newcomers: repo layering, where to add features, and “controller vs service” examples; update `docs/src/architecture/blobs-vdfs.md` if blob rules change.

# Protos & Codegen

Soma defines its local IPC and peer-facing message schemas in `proto/` using Protocol Buffers.

## Where the `.proto` files live

- Daemon IPC (desktop): `proto/daemon/v1/daemon.proto`
- Agent IPC (desktop helper): `proto/agent/v1/agent.proto`
- Membership/capabilities: `proto/space/v1/membership.proto`

## How Rust bindings are generated

Rust types and gRPC service stubs are built at compile time by the `soma-proto-build` crate:

- Crate: `backend/crates/proto-build`
- Build script: `backend/crates/proto-build/build.rs`
- Modules re-exported from: `backend/crates/proto-build/src/lib.rs`

`build.rs` uses `tonic_prost_build` to compile the `.proto` files into the crate’s `OUT_DIR`, and `tonic::include_proto!` pulls them into Rust modules.

Practical implications:

- Editing a `.proto` file will trigger rebuilds automatically (`cargo:rerun-if-changed=...`).
- There is no checked-in generated Rust code; it is produced by Cargo builds.

## Buf configuration

The repo includes Buf config files under `proto/`:

- `proto/buf.yaml`
- `proto/buf.gen.yaml`

They currently act as scaffolding for linting/managed-mode workflows; Rust codegen is performed by Cargo (`tonic_prost_build`) rather than a Buf plugin.

## Quick local checks

- Compile bindings: `cd backend && cargo build -p soma-proto-build`
- Compile a binary that uses the protos: `cd backend && cargo build -p soma-daemon`

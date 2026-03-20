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

The build script defaults to the workspace `proto/` directory, but it also accepts `SOMA_PROTO_ROOT` as an override. That keeps local builds working today while making it possible to point the backend at an external contracts checkout later.

Practical implications:

- Editing a `.proto` file will trigger rebuilds automatically (`cargo:rerun-if-changed=...`).
- There is no checked-in generated Rust code; it is produced by Cargo builds.

## Buf configuration

The repo includes Buf config files under `proto/`:

- `proto/buf.yaml`
- `proto/buf.gen.yaml`

They currently act as scaffolding for linting/managed-mode workflows; Rust codegen is performed by Cargo (`tonic_prost_build`) rather than a Buf plugin.

Buf is also the right place to keep future cross-repo lint/breaking checks once contracts move out of this monorepo.

## How TypeScript bindings are generated

TypeScript bindings for Electron/Node consumers live in `desktop/desktop-proto` as the `@soma/proto` workspace package.

- Generator package: `desktop/desktop-proto`
- Generated sources: `desktop/desktop-proto/src/gen`
- Published surface today: `@soma/proto/daemon/*`, `@soma/proto/agent/*`, `@soma/proto/space/*`

The package also supports `SOMA_PROTO_ROOT` so it can generate from an external proto checkout without changing consumer imports.

## Quick local checks

- Compile Rust bindings: `cargo build -p soma-proto-build`
- Compile a Rust binary that uses the protos: `cargo build -p soma-daemon`
- Generate TypeScript bindings: `pnpm --filter @soma/proto run generate`
- Generate TypeScript bindings from an alternate checkout: `SOMA_PROTO_ROOT=/absolute/path/to/proto pnpm --filter @soma/proto run generate`

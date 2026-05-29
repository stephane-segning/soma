# Protos & Codegen

Soma defines its peer-facing (libp2p) message schemas in `proto/` using
Protocol Buffers. These are Rust-only wire formats; the desktop renderer no
longer uses them for IPC (it talks to the Tauri host over commands — see
below).

## Where the `.proto` files live

- Daemon peer messages: `proto/daemon/v1/daemon.proto`
- Agent messages: `proto/agent/v1/agent.proto`
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

## How TypeScript types reach the renderer

The `.proto` files are **Rust-only** — they describe the libp2p wire formats.
There is no longer a TypeScript proto-codegen package: `desktop/desktop-proto`
(`@soma/proto`) was removed with the Electron app.

The renderer no longer speaks gRPC. The Tauri host exposes its behaviour as
`#[tauri::command]`s, and `tauri-specta` walks that command graph to emit
TypeScript wire types into `desktop/desktop-sdk/src/bindings/`. The renderer
consumes them through the typed `@soma/sdk` facade — never by hand-writing wire
types and never from generated proto stubs.

## Quick local checks

- Compile Rust bindings: `cargo build -p soma-proto-build`
- Compile a Rust crate that uses the protos: `cargo build -p somad`
- Regenerate the `@soma/sdk` bindings: build the Tauri host (the specta export
  runs as part of the `desktop-commands` build); the output lands in
  `desktop/desktop-sdk/src/bindings/`.

# `desktop/soma-app` (Tauri)

Soma desktop UI (Tauri v2 + React).

- Renderer: `desktop/soma-app/src`
- Main process (Rust): `desktop/soma-app/src-tauri`

## Prerequisites

- Rust toolchain (for the Tauri main process)
- Node.js + `pnpm` (workspace)
- `soma-daemon` running locally (desktop apps do not start it)

Optional:

- `soma-agentd` running locally (for chat/rerank/drift helpers)

## Development

From the repo root:

```bash
pnpm --filter soma-app tauri:dev
```

Or from this folder:

```bash
pnpm tauri:dev
```

## Environment variables

- `SOMA_DAEMON_SOCKET` (default: `/tmp/soma-daemon.sock`)
- `SOMA_AGENTD_SOCKET` (default: `/tmp/soma-agentd.sock`)

## Blobs

Blobs are daemon-owned and content-addressed:

- Uploads go to `soma-daemon` (`UploadBlob`)
- Renderer reads bytes via `soma-blob://daemon/{space_id}/{cid}` (custom protocol backed by `Daemon/ReadBlob`)

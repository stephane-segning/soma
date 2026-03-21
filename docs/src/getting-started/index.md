# Getting Started

This is the current development path for the repo as it exists today.

The quickest useful setup is:

- `soma-daemon`
- `soma-agentd`
- `desktop/soma`

Add `soma-botd`, `soma-relayd`, and `soma-rendezvousd` only when you need peer/network flows.

## Prerequisites

- Rust toolchain with Cargo
- Node.js and `pnpm`
- optional: `just` for the repo shortcuts

Install JS dependencies from the repo root:

```bash
pnpm install
```

## Fast Local Loop

From the repo root, in separate terminals:

```bash
just run-daemon
```

```bash
just run-agentd
```

```bash
just run-soma-desktop
```

This uses the repo's dev-stage socket layout under `/tmp`, including:

- `/tmp/soma-daemon-dev.sock`
- `/tmp/soma-agentd-dev.sock`

The `just` recipes also keep local data under `.data/` instead of scattering it across the repo root.

## What Each Process Does

- `soma-daemon`: local peer/backend for spaces, pages, documents, blobs, memberships, and peer connectivity
- `soma-agentd`: local helper for chat, embeddings, rerank, and drift resolution
- `desktop/soma`: main Electron UI; Electron main talks to daemon and agentd over local IPC

## Optional: Run Tapia

Tapia is currently a lighter desktop app than Soma.

Today it is best treated as a focused typing-practice companion: short passages, generated drills, and local session feedback.

```bash
pnpm --filter tapia run dev
```

It shares stage/socket conventions, but its current feature surface is not as backend-integrated as Soma.

## Optional: Run Peer/Infra Services

Use these when validating discovery, relays, or hosted peer flows:

```bash
just run-botd
just run-relayd
just run-rendezvousd
```

Notes:

- `soma-botd` does not blindly auto-approve joins by default; approval depends on the bot holding valid issuer capability material or on a manual decision path
- `soma-relayd` and `soma-rendezvousd` expose health/metrics HTTP endpoints in addition to libp2p listeners

## Useful Checks

```bash
just test-backend
just test-desktop-all
```

For docs:

```bash
pnpm --filter @soma/docs run build
```

## Troubleshooting

- if Soma does not start cleanly, verify that `soma-daemon` is already running on the expected socket
- if agent features are unavailable, verify that `soma-agentd` is running on the matching stage socket
- if peer flows fail, start with `RUST_LOG=debug` and add `soma-botd` / relay / rendezvous only after the local daemon path works

## More Specific Docs

- `docs/src/development/agentd-models.md`
- `docs/src/development/daemon-grpcurl.md`
- `docs/src/development/desktop-config.md`
- `docs/src/architecture/peer-connectivity.md`

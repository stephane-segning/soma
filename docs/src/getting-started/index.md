# Getting Started

This is the current development path for the repo as it exists today.

The quickest useful setup is:

- `desktop/soma` (Electron app — embeds the daemon + agent runtimes in-process
  via the `@soma/node` napi addon)

Add `somad` (with the `bot`, `relay`, or `rendezvous` subcommand) only when you
need peer/network flows that aren't satisfied by mDNS on the local machine.

## Prerequisites

- Rust toolchain with Cargo
- Node.js and `pnpm`
- optional: `just` for the repo shortcuts

Install JS dependencies from the repo root:

```bash
pnpm install
```

## Fast Local Loop

From the repo root:

```bash
just desktop-run-soma
```

The desktop app starts the embedded daemon + agent runtimes inside the Electron
main process; there is no separate daemon binary to launch and no Unix socket
involved. Local data lives under Electron's `userData` directory.

## What Each Process Does

- `desktop/soma` (Electron): main UI. Electron main loads the `@soma/node` napi
  addon, which embeds the libp2p peer / blob store / agent runtime; the
  renderer talks to main over Electron IPC.

## Optional: Run Tapia

Tapia is currently a lighter desktop app than Soma.

Today it is best treated as a focused typing-practice companion: short
passages, generated drills, and local session feedback.

```bash
pnpm --filter tapia run dev
```

## Optional: Run Peer/Infra Services

Use these when validating discovery, relays, or hosted peer flows:

```bash
just backend-run-bot
just backend-run-relay
just backend-run-rendezvous
```

Notes:

- `somad bot` does not blindly auto-approve joins by default; approval depends
  on the bot holding valid issuer capability material or on a manual decision
  path.
- `somad relay` and `somad rendezvous` expose health/metrics HTTP endpoints in
  addition to libp2p listeners.

## Useful Checks

```bash
just backend-test
just desktop-test-all
```

For docs:

```bash
pnpm --filter @soma/docs run build
```

## Troubleshooting

- The daemon runs inside the Electron main process; if Soma fails to start,
  watch the Electron main logs for `starting @soma/node addon runtime` and any
  error that follows. There is no separate daemon process to inspect.
- For peer-flow issues, start with `RUST_LOG=debug` on the Electron main
  process and bring up `somad bot` / `somad relay` / `somad rendezvous` only
  after the local in-process daemon path works.

## More Specific Docs

- `docs/src/development/agentd-models.md`
- `docs/src/development/desktop-config.md`
- `docs/src/architecture/peer-connectivity.md`

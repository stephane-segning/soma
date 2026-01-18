# Getting Started

Follow these steps to run the full Soma stack (daemon, Soma desktop app, and optional server peers) on your development machine.

## Prerequisites

- Rust toolchain with Cargo installed.
- Node.js (24+) plus `pnpm`.
- This repository cloned locally (it contains both the Soma daemon and the Tapia desktop apps).
- Optional: Docker/Kubernetes access if you plan to run local rendezvous or relay services.

## 1. Clone the Repository

```bash
git clone https://github.com/stephane-segning/soma soma
cd soma
```

The Rust workspace lives under `backend/`. The desktop apps (Soma and Tapia) live under `desktop/`. Install desktop dependencies with `pnpm`:

```bash
cd desktop
pnpm install
```

## 2. Start the Soma Daemon

```bash
cd backend
RUST_LOG=info cargo run --release -p soma-daemon
```

- On first run the daemon creates a keypair and prints its Peer ID.
- It registers with the configured rendezvous server (or uses mDNS on LAN) and listens on a local Unix socket gRPC interface (no HTTP surface).
- Logs indicate whether it connected to relays or downloaded class metadata.
- The socket path defaults to `/tmp/soma-daemon.sock` (set via `--socket-path` or `SOMA_DAEMON_SOCKET`). Desktop apps must be configured with this path to connect; for example, by setting the `SOMA_DAEMON_SOCKET` environment variable for the app. gRPC methods are defined in `proto/daemon/v1/daemon.proto`.

## 3. Start Soma (Electron/Chromium)

```bash
cd desktop/soma
pnpm dev
```

- Soma expects the local daemon to already be running at the configured Unix socket path (`SOMA_DAEMON_SOCKET`) and surfaces errors if it cannot connect (check the developer console).
- Development builds use Vite for the renderer (hot reload) and Electron for the desktop shell/main process.

## 4. Start Tapia (optional)

```bash
cd desktop/tapia
pnpm dev
```

Tapia is a typing companion app; it can be developed independently, but it can also reuse daemon APIs for shared state.

## 5. Launch a Bot (Optional but Recommended)

Bots make onboarding realistic by auto-approving join requests.

```bash
cd backend
RUST_LOG=info cargo run --release -p soma-botd
```

- Ensure the bot stores its identity in a distinct data directory so it does not collide with your user agent.
- Configure which class it manages and provide IssuerCapability material (via CLI flags or config files).

If you want a separate desktop-only companion process for local automation or local AI helpers, run:

```bash
cd backend
RUST_LOG=info cargo run --release -p soma-agentd
```

For local LLM chat with GGUF models (and “base vs instruct” behavior), see `docs/src/development/agentd-models.md`.

## 6. Simulate a Join Flow

1. In Soma, enter or select the class the bot manages.
2. Soma asks the daemon to emit a `JoinRequest`.
3. Watch the bot logs for approval and Soma for the resulting membership confirmation.

If peers cannot discover one another, verify that both the bot and user daemon are connected to the same rendezvous namespace or can see each other via mDNS.

## 7. (Optional) Run Local Rendezvous/Relay Services

- Use the libp2p rendezvous example (`cargo run --example rendezvous_server`) or the Helm charts under `deploy/` to host the discovery service locally.[^rendezvous]
- For NAT testing, run a libp2p Circuit Relay (`cargo run --example relay` or the provided container images).[^relay]
- Point your daemons to the local multiaddresses via config or environment variables.

## 8. Development Tips

- Keep three terminals open (daemon, UI, bot) so you can correlate actions end-to-end.
- Set `RUST_LOG=debug` for verbose networking traces when diagnosing libp2p issues.
- Identity data typically lives under `~/.soma*`; remove or rename those directories to simulate a clean user.
- You can run multiple user agents by specifying different data directories and API ports for each daemon.

With these components running locally you can develop UI features, extend daemon protocols, and validate onboarding flows without relying on external infrastructure.

[^rendezvous]: https://docs.libp2p.io/concepts/discovery-routing/rendezvous/
[^relay]: https://docs.libp2p.io/concepts/nat/circuit-relay/

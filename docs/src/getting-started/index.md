# Getting Started

Follow these steps to run the full Soma stack (daemon, Tapia UI, and bots) on your development machine.

## Prerequisites

- Rust toolchain with Cargo installed.
- Node.js (24+) plus `pnpm`.
- This repository cloned locally (it contains both the Soma daemon and the Tapia desktop apps).
- Optional: Docker/Kubernetes access if you plan to run local rendezvous or relay services.

## 1. Clone the Repository

```bash
git clone <this-repo-url> soma
cd soma
```

The Rust workspace lives under `backend/`. The desktop apps (Soma and Tapia) live under `desktop/app/`. Install desktop dependencies with `pnpm`:

```bash
cd desktop/app
pnpm install
```

## 2. Start the Soma Daemon

```bash
cd backend
RUST_LOG=info cargo run --release -p soma-daemon
```

- On first run the daemon creates a keypair and prints its Peer ID.
- It registers with the configured rendezvous server (or uses mDNS on LAN) and starts the local IPC/HTTP endpoint that Tapia will consume.
- Logs indicate whether it connected to relays or downloaded class metadata.

## 3. Start Tapia (Electron UI)

```bash
cd desktop/app/tapia
pnpm dev
```

- Tapia looks for the local daemon, launches it if needed, and surfaces errors if it cannot connect (check the developer console).
- Development builds typically hot-reload the React app while Electron stays running.

You can also run the main Soma desktop app similarly:

```bash
cd desktop/app/soma
pnpm dev
```

## 4. Launch a Bot (Optional but Recommended)

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

## 5. Simulate a Join Flow

1. In Tapia, enter or select the class the bot manages.
2. Tapia asks the daemon to emit a `JoinRequest`.
3. Watch the bot logs for approval and Tapia for the resulting membership confirmation.

If peers cannot discover one another, verify that both the bot and user daemon are connected to the same rendezvous namespace or can see each other via mDNS.

## 6. (Optional) Run Local Rendezvous/Relay Services

- Use the libp2p rendezvous example (`cargo run --example rendezvous_server`) or the Helm charts under `deploy/` to host the discovery service locally.[^rendezvous]
- For NAT testing, run a libp2p Circuit Relay (`cargo run --example relay` or the provided container images).[^relay]
- Point your daemons to the local multiaddresses via config or environment variables.

## 7. Development Tips

- Keep three terminals open (daemon, Tapia, bot) so you can correlate actions end-to-end.
- Set `RUST_LOG=debug` for verbose networking traces when diagnosing libp2p issues.
- Identity data typically lives under `~/.soma*`; remove or rename those directories to simulate a clean user.
- You can run multiple user agents by specifying different data directories and API ports for each daemon.

With these components running locally you can develop UI features, extend daemon protocols, and validate onboarding flows without relying on external infrastructure.

[^rendezvous]: https://docs.libp2p.io/concepts/discovery-routing/rendezvous/
[^relay]: https://docs.libp2p.io/concepts/nat/circuit-relay/

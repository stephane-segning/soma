# Packaging and Deployment

Soma ships as a desktop application plus a small set of cloud services. This page summarizes how we package the binaries and operate the networking infrastructure.

## Desktop Application Packaging

- **Targets** – Linux `.deb` packages (and optional `.AppImage`/`.tar.gz`) plus macOS `.pkg` installers. Windows support would require an alternative IPC transport and is currently out of scope.
- **Contents** – Soma + Tapia desktop apps (Electron/Chromium) are installed alongside `soma-daemon` (and optionally `soma-agentd`) as separate binaries.
- **Build tooling** – Electron builds the desktop apps; daemon/agent are built as Rust binaries. The bundle packaging step combines published artifacts into `.deb/.rpm` (Linux) or `.pkg` (macOS).
- **Installation details** – On Linux, packages install systemd unit files; on macOS, packages install launchd plists. Services are not auto-enabled by default; operators/users can enable them if they want the daemon running in the background.
- **Convenience scripts** – bundle releases also publish `install.sh` / `uninstall.sh` helper scripts that download and install/remove the right package for your OS/arch.

## Supporting Infrastructure

Two lightweight libp2p services run in Kubernetes to help peers discover and connect to each other:

### Rendezvous Server

- Runs the libp2p rendezvous discovery protocol, allowing peers to register under namespaces like `soma-prod` or `soma-dev`.[^rendezvous]
- Deployed via Helm, usually as a simple Deployment with a public LoadBalancer Service exposing TCP/QUIC ports.
- Configuration includes the namespace TTL, registration limits, and (optionally) persistent storage if the implementation is not purely in-memory.

### Circuit Relay Nodes

- Provide `/p2p-circuit` addresses for peers that cannot accept inbound connections because of restrictive NAT or firewalls.[^relay]
- Multiple relay pods can be deployed for redundancy; each can use a Kubernetes Secret to persist its private key so the Peer ID remains stable across restarts.
- Peers can learn about relays via static config or rendezvous announcements and will attempt hole punching (DCUtR) to upgrade connections whenever possible.

### Optional Hosted Bots

- Some classes rely on always-on bots (e.g., system-wide onboarding). Those bots can also be containerized and deployed via Helm with environment variables specifying class IDs, IssuerCapabilities, or admin tokens.

## Release and Operations Workflow

1. Build and sign Soma desktop installers, embedding the matching `soma-daemon` version.
2. Publish artifacts (GitHub Releases, download portal, or auto-update server).
3. Update Helm chart values with new container tags for rendezvous, relays, or hosted bots.
4. Use `helm upgrade` to roll out infrastructure changes; Kubernetes handles restarts and liveness probes keep pods healthy.
5. Monitor relay bandwidth/memory and rendezvous registration counts to plan scaling.

The infrastructure components never store user content—they only facilitate peer discovery and encrypted transport—so PII risk stays on user-controlled devices while still delivering reliable connectivity.

[^rendezvous]: https://docs.libp2p.io/concepts/discovery-routing/rendezvous/
[^relay]: https://docs.libp2p.io/concepts/nat/circuit-relay/

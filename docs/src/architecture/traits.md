# Trait-First Convention

This repo now prefers **traits as the default abstraction**. Patterns to follow:

- **Behavior lives behind traits.** Define a trait in the owning crate (e.g., peer, HTTP, IPC) and implement it per binary or adapter. Avoid scattered helper functions.
- **Small structs or newtypes implement traits.** Keep logic attached to concrete types instead of “free-floating” functions. Use free functions only for pure, stateless utilities.
- **Default methods over helper modules.** Put common runners/wrappers as default trait methods when possible (e.g., `run()` on a service trait).
- **Ownership lives where the capability belongs.** Define the trait near the core capability (peer, storage, HTTP, IPC), then implement it in consumers (bins/adapters).
- **Testing via contracts.** Unit tests should target trait contracts, using lightweight mock implementations to validate behavior.
- **Binaries stay thin.** Bins should compose trait implementations and call `run()`, not host business logic.

Examples to apply next:

- Peer identity/spawn: trait in `soma-peer`, implemented by daemon/botd/bffd.
- HTTP services: trait in `soma-core` (or service crate), implemented per bin.
- Unix IPC/gRPC: trait in `soma-socket`, implemented by daemon/agentd.

Keep traits cohesive, name methods for intent, and avoid leaking unrelated concerns into a single trait.

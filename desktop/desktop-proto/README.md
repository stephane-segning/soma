# `@soma/proto`

`desktop/desktop-proto` is the workspace package that generates Node/Electron TypeScript bindings from the shared `.proto` contracts.

- Source contracts: `proto/`
- Default proto root: `../../proto` from this package
- Override for split-readiness work: set `SOMA_PROTO_ROOT=/absolute/path/to/proto`
- Generation entrypoints: `daemon/v1/daemon.proto`, `agent/v1/agent.proto`, `space/v1/membership.proto`

Useful commands:

- `pnpm --filter @soma/proto run generate`
- `pnpm --filter @soma/proto run proto:daemon`
- `pnpm --filter @soma/proto run proto:agent`
- `pnpm --filter @soma/proto run proto:space`

The package remains workspace-local for now, but its generation path is intentionally externalizable so a future contracts repo can publish the same API surface with minimal consumer changes.

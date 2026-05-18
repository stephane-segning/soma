# `cargo xtask`

This repo uses a small Rust CLI (`xtask/`) for automation that must be portable and CI-friendly.

`cargo xtask` is part of the backend-owned toolchain. It is the right place for Rust workspace automation and Cargo-oriented CI helpers, not for desktop pnpm workflows or general repo scripting.

`cargo xtask` is wired via `.cargo/config.toml`, so you can run it from the repo root without extra setup. You can also run it explicitly from `backend/`, which is the clearer ownership model as the repo moves toward less root-level coupling.

## Common commands

Show help:

```bash
cargo xtask --help
cd backend && cargo xtask --help
```

Read versions used by CI:

```bash
cargo xtask version workspace --path Cargo.toml
cd backend && cargo xtask version workspace --path ../Cargo.toml
```

## Ownership boundaries

Use `cargo xtask` for tasks that are primarily about:

- Cargo workspace metadata and version resolution
- backend CI preparation that should stay cross-platform and shell-light
- structured machine-readable output consumed by GitHub Actions

Do not move these concerns into `cargo xtask`:

- `pnpm` install, lint, build, or release flows owned by `desktop/`
- Electron app development commands
- ad hoc root-level glue that would hide which workspace actually owns the command

## CI integration

GitHub Actions workflows use `cargo xtask` for Cargo workspace version resolution (e.g. resolving the workspace version label consumed by `release-server.yml`). The desktop and server release pipelines themselves live entirely in their own workflows (`release-desktop.yml`, `release-server.yml`) — `xtask` is not involved in bundling, packaging, or asset publication.

## Extending xtask

When adding a new subcommand:

- Keep inputs explicit (flags/env) and outputs stable (especially JSON consumed by CI).
- Prefer cross-platform Rust filesystem/process APIs over shell logic.
- Prefer backend-specific ownership. If a task mainly exists to operate `desktop/`, keep it in the desktop workspace instead.

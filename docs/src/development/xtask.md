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

- `pnpm` install, lint, build, or packaging flows owned by `desktop/`
- Electron app development commands
- ad hoc root-level glue that would hide which workspace actually owns the command

## Local packaging (desktop/packaging)

For local packaging tests (using local build artifacts), use the TypeScript CLI under `desktop/packaging`. This is intentionally outside `cargo xtask` because packaging spans Electron artifacts and desktop workspace concerns:

```bash
pnpm --filter @soma/packaging run bundle -- --os linux --arch amd64
```

This outputs to `artifacts/bundle-local/<os>-<arch>/` by default and expects:

- daemon + agent binaries at `target/release/`
- desktop artifacts in `desktop/soma/dist` and `desktop/tapia/dist`

## Release bundle (CI / GitHub assets)

The CI release bundle is built with the same TypeScript CLI, but it pulls published assets from GitHub releases and prints a JSON payload for workflow outputs. `cargo xtask` may help resolve backend metadata for CI, but it is not the bundle builder:

```bash
export GITHUB_REPOSITORY=owner/repo
export GITHUB_TOKEN=...

pnpm --filter @soma/packaging run bundle:release -- --os linux --arch amd64
```

Optional flags:

- `--daemons-version <x.y.z>` (otherwise resolves latest `daemons-v*`)
- `--desktop-version <x.y.z>` (otherwise resolves latest `desktop-v*`)
- `--bundle-version <label>` (otherwise uses a timestamp)
- `--out-dir <path>` (default `artifacts/bundle`)

## CI integration

GitHub Actions workflows use `cargo xtask` for Cargo workspace version resolution and `@soma/packaging` for bundle packaging:

- Version resolution: `cargo xtask version workspace ...`
- Bundle build: `pnpm --filter @soma/packaging run bundle:release ...` (prints JSON used to set action outputs)

This split is deliberate:

- backend CI logic stays close to the Rust workspace
- desktop packaging stays close to the desktop workspace
- the root repo can orchestrate both without collapsing them into one tool

## Extending xtask

When adding a new subcommand:

- Keep inputs explicit (flags/env) and outputs stable (especially JSON consumed by CI).
- Prefer cross-platform Rust filesystem/process APIs over shell logic.
- Prefer backend-specific ownership. If a task mainly exists to operate `desktop/`, keep it in the desktop workspace instead.

# `cargo xtask`

This repo uses a small Rust CLI (`xtask/`) for automation that must be **portable** and **CI-friendly** (replacing checked-in bash/python scripts).

`cargo xtask` is wired via `.cargo/config.toml`, so you can run it from the repo root without extra setup.

## Common commands

Show help:

```bash
cargo xtask --help
```

Read versions used by CI:

```bash
cargo xtask version workspace --path Cargo.toml
```

## Local packaging (desktop/packaging)

For local packaging tests (using local build artifacts), use the TypeScript CLI under `desktop/packaging`:

```bash
pnpm --filter @soma/packaging run bundle -- --os linux --arch amd64
```

This outputs to `artifacts/bundle-local/<os>-<arch>/` by default and expects:

- daemon + agent binaries at `target/release/`
- desktop artifacts in `desktop/soma/dist` and `desktop/tapia/dist`

## Release bundle (CI / GitHub assets)

The CI release bundle is built with the same TypeScript CLI, but it pulls published assets from GitHub releases and prints a JSON payload for workflow outputs:

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

## Packaging templates (`install.sh` / `uninstall.sh`)

The bundle build renders templates from `desktop/packaging/templates/` into the per-platform staging directory, including `install.sh` and `uninstall.sh`.

Notes:

- Templates use **Nunjucks** syntax (`{{var}}`) and are rendered in strict mode (missing vars fail the build).
- `install.sh` / `uninstall.sh` are intentionally shipped as artifacts; they are generated during the bundle build and placed next to the packaged artifacts under `artifacts/bundle/<os>-<arch>/`.

## CI integration

GitHub Actions workflows use `cargo xtask` for Cargo workspace version resolution and `@soma/packaging` for bundle packaging:

- Version resolution: `cargo xtask version workspace ...`
- Bundle build: `pnpm --filter @soma/packaging run bundle:release ...` (prints JSON used to set action outputs)

## Extending xtask

When adding a new subcommand:

- Keep inputs explicit (flags/env) and outputs stable (especially JSON consumed by CI).
- Prefer cross-platform Rust filesystem/process APIs over shell logic.

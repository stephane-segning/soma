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
cargo xtask version desktop --path desktop/soma/package.json
```

Build a release bundle (downloads release assets, renders templates, produces `.deb/.rpm` on Linux or `.pkg` on macOS, and prints JSON to stdout):

```bash
export GITHUB_REPOSITORY=owner/repo
export GITHUB_TOKEN=...

cargo xtask release bundle --os linux --arch amd64
```

Optional flags:

- `--daemons-version <x.y.z>` (otherwise resolves latest `daemons-v*`)
- `--desktop-version <x.y.z>` (otherwise resolves latest `desktop-v*`)
- `--bundle-version <label>` (otherwise uses a timestamp)
- `--out-dir <path>` (default `artifacts/bundle`)

## Packaging templates (`install.sh` / `uninstall.sh`)

The bundle build renders templates from `.github/packaging/templates/` into the per-platform staging directory, including `install.sh` and `uninstall.sh`.

Notes:

- Templates use **Handlebars** syntax (`{{var}}`) and are rendered by `cargo xtask` in strict mode (missing vars fail the build).
- `install.sh` / `uninstall.sh` are intentionally shipped as artifacts; they are generated during the bundle build and placed next to the packaged artifacts under `artifacts/bundle/<os>-<arch>/`.

## CI integration

GitHub Actions workflows and composite actions call `cargo xtask ...` instead of repo-local python helpers:

- Version resolution: `cargo xtask version ...`
- Bundle build: `cargo xtask release bundle ...` (prints JSON used to set action outputs)

## Extending xtask

When adding a new subcommand:

- Keep inputs explicit (flags/env) and outputs stable (especially JSON consumed by CI).
- Prefer cross-platform Rust filesystem/process APIs over shell logic.

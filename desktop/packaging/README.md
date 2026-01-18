# @soma/packaging

Local packaging helper for Soma + Tapia desktop bundles. This CLI mirrors the CI bundling logic but uses local build artifacts.

## Requirements

- Linux: `fpm` in PATH
- macOS: `pkgbuild` in PATH
- Desktop artifacts built with `electron-builder`
- Daemon + agent built via `cargo build -p soma-daemon -p soma-agentd --release`

## Usage

From the repo root:

```bash
pnpm --filter @soma/packaging run bundle -- --os linux --arch amd64
```

Release bundle (downloads published assets and prints JSON for CI; default output `artifacts/bundle`):

```bash
pnpm --filter @soma/packaging run bundle:release -- --os linux --arch amd64
```

Requires `GITHUB_REPOSITORY` and `GITHUB_TOKEN` (or `--repo`/`--token`).

Common flags:

- `--os <linux|macos>`
- `--arch <amd64|arm64>`
- `--out-dir <path>` (default: `artifacts/bundle-local`)
- `--adhoc-sign-macos` / `--no-adhoc-sign-macos` (default: enabled)
- `--daemon-path <path>` (default: `target/release/soma-daemon`)
- `--agent-path <path>` (default: `target/release/soma-agentd`)
- `--soma-app <path>` / `--tapia-app <path>`

If `--soma-app` or `--tapia-app` are omitted, the CLI attempts to auto-detect artifacts in `desktop/soma/dist` and `desktop/tapia/dist`.

## Templates

Template sources live under `desktop/packaging/templates` and use Nunjucks (Jinja-compatible) syntax.

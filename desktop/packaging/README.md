# @soma/packaging

Local packaging helper for Soma desktop bundles. This CLI mirrors the CI bundling logic but uses local build artifacts.

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

The release command now supports explicit release manifests and split source repos:

- `--repo <owner/name>` keeps pointing at the bundle release repo and remains the default source repo.
- `--daemons-repo <owner/name>` and `--desktop-repo <owner/name>` override where upstream assets are discovered.
- `--daemons-manifest <path-or-url>` and `--desktop-manifest <path-or-url>` bypass tag scraping and use an explicit JSON manifest.
- If no explicit manifest is passed, the CLI looks for `daemons-release-manifest.json`, `desktop-release-manifest.json`, or `release-manifest.json` on the selected release before falling back to legacy asset-name discovery.

Common flags:

- `--os <linux|macos>`
- `--arch <amd64|arm64>` (macOS supports `arm64` only)
- `--out-dir <path>` (default: `artifacts/bundle-local`)
- `--adhoc-sign-macos` / `--no-adhoc-sign-macos` (default: enabled)
- `--daemon-path <path>` (default: `target/release/soma-daemon`)
- `--agent-path <path>` (default: `target/release/soma-agentd`)
- `--soma-app <path>`
- `release --daemons-repo <owner/name>` / `release --desktop-repo <owner/name>`
- `release --daemons-manifest <path-or-url>` / `release --desktop-manifest <path-or-url>`

If `--soma-app` is omitted, the CLI attempts to auto-detect artifacts in `desktop/soma/dist`.

`release` also writes `bundle-release-manifest.json` alongside `outputs.json` in each platform output directory so downstream automation can reason about bundle inputs without scraping logs.

## Templates

Template sources live under `desktop/packaging/templates` and use Nunjucks (Jinja-compatible) syntax.

# Desktop Configuration Service

`@soma/desktop-config` is the shared Electron runtime config layer for Soma and Tapia.

It centralizes:

- stage detection
- stage-specific Electron data paths
- daemon socket naming
- agent socket naming

Package location:

- `desktop/desktop-config/`

Main implementation:

- `desktop/desktop-config/src/stage-config.ts`

## What It Does

`StageConfigService` resolves a runtime stage and then adjusts Electron paths and local socket names to keep dev, staging, and prod installs isolated from each other.

For non-prod stages it rewrites Electron paths such as:

- `appData`
- `userData`
- `sessionData`
- `logs`
- `cache`
- `crashDumps`

It also updates the app name with the stage suffix.

## Stage Resolution

The service resolves stage from:

1. explicit environment overrides when allowed
2. stage suffix in the packaged app name
3. `dev` when running unpackaged in development
4. otherwise `prod`

Important behavior:

- packaged apps ignore normal env overrides by default
- unpackaged/dev runs allow env overrides
- `production` normalizes to `prod`

## Socket Naming

Default socket directory:

- prod Linux: `$XDG_RUNTIME_DIR/soma` (systemd user units use `%t/soma`)
- prod macOS: `$TMPDIR/soma`
- dev/staging: `/tmp`

Default socket names for the Soma app family:

| Stage | Daemon socket | Agent socket |
| --- | --- | --- |
| `prod` on Linux | `$XDG_RUNTIME_DIR/soma/soma-daemon.sock` | `$XDG_RUNTIME_DIR/soma/soma-agentd.sock` |
| `prod` on macOS | `$TMPDIR/soma/soma-daemon.sock` | `$TMPDIR/soma/soma-agentd.sock` |
| `dev` | `/tmp/soma-daemon-dev.sock` | `/tmp/soma-agentd-dev.sock` |
| `staging` | `/tmp/soma-daemon-staging.sock` | `/tmp/soma-agentd-staging.sock` |

The suffix rule is simple:

- `prod`: no suffix, under the per-user runtime socket directory
- everything else: `-<stage>.sock`

## Local Development Implication

Your running daemons must match the stage-specific socket path the app expects.

Examples:

- `just run-daemon` -> `/tmp/soma-daemon-dev.sock`
- `just run-agentd` -> `/tmp/soma-agentd-dev.sock`

If the sockets do not match, the desktop app will fail to connect even if the processes are otherwise healthy.

## Current Package Shape

The package currently exports its source entry directly:

- `desktop/desktp-config/package.json`

So the important source of truth is the implementation in `src/stage-config.ts`.

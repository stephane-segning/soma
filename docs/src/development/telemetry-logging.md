# Telemetry & Logging

All Rust backends initialize `tracing` via `soma_core::telemetry::init_tracing(...)` (`backend/crates/core/src/telemetry.rs`).

## Configuration

- `RUST_LOG`: sets the log filter (for example: `info`, `debug`, `soma_peer=debug,libp2p=info`). If unset, each binary supplies a default filter (typically `info`).
- `SOMA_LOG_FORMAT`: enables structured logging when set to `json` (also accepts `structured`, `true`, `1`). If unset, logs are formatted as plain text.
- `SOMA_LOGS_DIR`: enables file logging when set. Logs are written to a weekly-rotating file with the prefix `log` in that directory (the directory is created if missing). If unset, logs go to the default writer (stdout/stderr depending on runtime).
- `SOMA_FLAME_ENABLED`: opt-in flame capture using `tracing-flame` + `tracing-error`. When set (`1`/`true`/`yes`/`on`), a folded stack file is written to a `flame/` directory that sits next to the `logs` directory (or `./flame` if `SOMA_LOGS_DIR` is unset). One `.folded` file is created per binary (`<binary>.folded`).

## Examples

Plain text to stdout/stderr:

```bash
RUST_LOG=info cargo run -p soma-daemon -- --help
```

JSON to stdout/stderr:

```bash
SOMA_LOG_FORMAT=json RUST_LOG=debug cargo run -p soma-daemon -- --help
```

JSON to a rolling file:

```bash
SOMA_LOGS_DIR=./.data/logs/daemon SOMA_LOG_FORMAT=json RUST_LOG=debug \
  cargo run -p soma-daemon -- --help
```

Flame capture alongside logs:

```bash
SOMA_FLAME_ENABLED=1 SOMA_LOGS_DIR=./.data/logs/daemon RUST_LOG=info \
  cargo run -p soma-daemon -- --help

# Convert folded stacks to an SVG flamegraph (requires inferno)
cat ./.data/flame/soma-daemon.folded | inferno-flamegraph > ./.data/flame/soma-daemon.svg
```

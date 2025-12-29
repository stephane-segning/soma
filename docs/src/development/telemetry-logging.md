# Telemetry & Logging

All Rust backends initialize `tracing` via `soma_core::telemetry::init_tracing(...)` (`backend/crates/core/src/telemetry.rs`).

## Configuration

- `RUST_LOG`: sets the log filter (for example: `info`, `debug`, `soma_peer=debug,libp2p=info`). If unset, each binary supplies a default filter (typically `info`).
- `SOMA_LOG_FORMAT`: enables structured logging when set to `json` (also accepts `structured`, `true`, `1`). If unset, logs are formatted as plain text.
- `SOMA_LOGS_DIR`: enables file logging when set. Logs are written to a weekly-rotating file with the prefix `log` in that directory (the directory is created if missing). If unset, logs go to the default writer (stdout/stderr depending on runtime).

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

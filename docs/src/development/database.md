# Database & Migrations

Soma uses SQLx-backed storage for durable state such as join requests/decisions, memberships, and mailbox delivery.

## What uses a database

- `soma-daemon` (linked into the `@soma/node` napi addon, run in-process inside Electron main): SQLite file. Path is configured by the addon's `StartConfig.daemonDbPath`; the desktop app places it under Electron's `userData/daemon/daemon.db`.
- `somad bot` (server peer): SQLx AnyPool with SQLite or Postgres (`SOMA_DATABASE_URL`, default `./botd.db`).

Both apply migrations at startup and fail fast if migrations cannot be applied.

## Migrations

- Directory: `backend/crates/storage/migrations`
- Applied by:
  - `backend/crates/daemon/src/lib.rs` (the in-process daemon library) via `sqlx::migrate!("../storage/migrations")`
  - `backend/bins/somad/src/commands/bot/runtime.rs` via `sqlx::migrate!("../../crates/storage/migrations")`

## Access layer (repositories)

SQL is intentionally kept out of controllers/handlers. Repositories live in:

- `backend/crates/storage/src/membership.rs`
- `backend/crates/storage/src/issuer.rs`
- `backend/crates/storage/src/mailbox.rs`

Repository wiring:

- Bootstrap: `backend/crates/storage/src/bootstrap.rs`
- Factory: `backend/crates/storage/src/lib.rs` (`RepositoryFactory`)

## Database URL conventions

- The code normalizes SQLite paths into `sqlite://...` URLs via `soma_core::db::normalize_sqlite_url` (`backend/crates/core/src/db.rs`).
- For `somad bot`, `SOMA_DATABASE_URL` can be:
  - a `postgres://...` URL, or
  - a SQLite URL/path (`sqlite:...` or a filesystem path).

## Common workflows

### Inspecting the desktop daemon DB (SQLite)

The file lives under Electron's `userData` directory — on macOS that is
`~/Library/Application Support/soma/daemon/daemon.db`. On Linux it is
`~/.config/soma/daemon/daemon.db`.

```bash
sqlite3 "$HOME/Library/Application Support/soma/daemon/daemon.db" '.tables'
```

### Running against a fresh DB

- Delete the DB file (e.g., the daemon DB under `userData/daemon/`, or
  `backend/botd.db` for the server bot) and restart the service.
- Migrations will recreate the schema.

### Postgres for the server bot (deployments)

- Set `SOMA_DATABASE_URL=postgres://...` for `somad bot`.
- Ensure the database is reachable and credentials are correct; startup will
  fail if migrations cannot be applied.

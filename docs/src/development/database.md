# Database & Migrations

Soma uses SQLx-backed storage for durable state such as join requests/decisions, memberships, and mailbox delivery.

## What uses a database

- `soma-daemon` (desktop): SQLite file by default (`SOMA_DAEMON_DB`, default `./daemon.db`).
- `soma-botd` (server peer): SQLx AnyPool with SQLite or Postgres (`SOMA_DATABASE_URL`, default `./botd.db`).

Both services apply migrations at startup and fail fast if migrations cannot be applied.

## Migrations

- Directory: `backend/crates/storage/migrations`
- Applied by:
  - `backend/bins/daemon/src/main.rs` via `sqlx::migrate!("../../crates/storage/migrations")`
  - `backend/bins/botd/src/runtime.rs` via `sqlx::migrate!("../../crates/storage/migrations")`

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
- For `soma-botd`, `SOMA_DATABASE_URL` can be:
  - a `postgres://...` URL, or
  - a SQLite URL/path (`sqlite:...` or a filesystem path).

## Common workflows

### Inspecting the desktop daemon DB (SQLite)

From the repo root:

```bash
sqlite3 backend/daemon.db '.tables'
```

### Running against a fresh DB

- Delete the DB file (e.g., `backend/daemon.db` or `backend/botd.db`) and restart the service.
- Migrations will recreate the schema.

### Postgres for botd (server deployments)

- Set `SOMA_DATABASE_URL=postgres://...` for `soma-botd`.
- Ensure the database is reachable and credentials are correct; startup will fail if migrations cannot be applied.

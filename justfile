# Thin repo-root helpers for backend, desktop, docs, and CI workflows.
#
# Goal: keep the repo root convenient without making it the only place where
# day-to-day tooling lives. Recipes here should delegate to the owning surface:
# - `backend/` for Cargo and `cargo xtask`
# - `desktop/` for pnpm workspaces and Electron apps
# - `docs/` for docs content (still built through the desktop pnpm workspace)

set shell := ["bash", "-lc"]

#
# Backend workspace helpers (`backend/`)
#

# Build the unified server binary
backend-build-servers:
	cd backend && cargo build -p somad

# Build the @soma/node napi addon that hosts the daemon + agent in-process
backend-build-node-addon:
	cd backend && cargo build -p soma-node --release

# Run somad bot
backend-run-bot:
	export SOMA_DATA_DIR="$PWD/.data" && mkdir -p "$SOMA_DATA_DIR/db" && cd backend && cargo run -p somad -- bot --http-addr 127.0.0.1:0 --db-url "sqlite://$SOMA_DATA_DIR/db/botd.db" --blob-dir "$SOMA_DATA_DIR/blobs/botd" --listen-addrs /ip4/127.0.0.1/tcp/0

# Run somad relay
backend-run-relay:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p somad -- relay

# Run somad rendezvous
backend-run-rendezvous:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p somad -- rendezvous

# Run somad bff
backend-run-bff:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p somad -- bff

# Run somad all (compose multiple modes via TOML config)
backend-run-all config="server.toml":
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p somad -- all --config {{config}}

# Build every crate + binary in the Rust workspace. Catches downstream
# breakage in `somad` and other binaries that the napi-scoped
# `pnpm typecheck:node` doesn't walk. CI uses this same target.
backend-build-workspace:
	cargo build --workspace --locked

# Test every crate in the Rust workspace, with the lockfile enforced.
# Symmetric counterpart to `backend-build-workspace` — covers crates
# outside backend/ like `desktop/desktop-icons` and `xtask`. CI uses
# this same target.
backend-test-workspace:
	cargo test --workspace --locked

# Run the full Rust backend test suite (legacy, scoped to backend/).
# Kept for compatibility with existing callers; new callers should
# prefer `backend-test-workspace`.
backend-test:
	cd backend && cargo test

# Run relay smoke tests (ignored by default)
backend-test-relay-smoke:
	cd backend && cargo test -p soma-relay --test smoke -- --ignored

# Run rendezvous smoke tests (ignored by default)
backend-test-rendezvous-smoke:
	cd backend && cargo test -p soma-rendezvous --test smoke -- --ignored

# Show xtask help from the backend workspace
backend-xtask-help:
	cd backend && cargo xtask --help

# Read workspace versions used by CI
backend-xtask-version-workspace path="../Cargo.toml":
	cd backend && cargo xtask version workspace --path {{path}}

#
# Desktop workspace helpers (`desktop/`)
#

# Install desktop workspace dependencies
desktop-install:
	cd desktop && pnpm install

# Run the Tauri desktop app in dev mode
desktop-run-soma:
	cd desktop && pnpm --filter @soma/desktop-app run tauri:dev

# Build the Tauri desktop app bundle
desktop-build-soma:
	cd desktop && pnpm --filter @soma/desktop-app run tauri:build

# Typecheck the Tauri desktop app
desktop-test-soma:
	cd desktop && pnpm --filter @soma/desktop-app run typecheck

# Run lint + typecheck for the desktop app
desktop-test-all:
	cd desktop && pnpm --filter @soma/desktop-app run lint && pnpm --filter @soma/desktop-app run typecheck

# Run vitest for @soma/ui (component + portable-stories coverage)
desktop-test-ui:
	cd desktop && pnpm --filter @soma/ui run test:coverage

# Run vitest for @soma/editor (NodeAIRegistry, command builders, hooks)
desktop-test-editor:
	cd desktop && pnpm --filter @soma/editor run test:coverage

# Run all unit tests across desktop workspaces with coverage
desktop-test-unit:
	just desktop-test-ui
	just desktop-test-editor

# Run Cucumber × Playwright UI E2E features against @soma/ui storybook
desktop-test-e2e:
	cd desktop && pnpm --filter @soma/e2e run test


#
# Docs and compose helpers
#

# Build docs site plus desktop UI Storybook output used by docs publishing
docs-build:
	cd desktop && pnpm --filter @soma/docs run build
	cd desktop/desktop-ui && pnpm run build:storybook -- --output-dir ../../site/storybook

# Bring up the default compose stack
compose-up:
	docker compose up -d

# Stop and remove the compose stack
compose-down:
	docker compose down

# Follow the compose stack logs
compose-logs:
	docker compose logs -f

# Show the compose stack status
compose-ps:
	docker compose ps

#
# CI-oriented aggregations
#

# Run backend checks used in CI — build the full workspace (catches
# binaries) then run the workspace-wide test suite.
ci-backend:
	just backend-build-workspace
	just backend-test-workspace

# Run desktop checks used in CI
ci-desktop:
	just desktop-test-all

# Run all unit tests with coverage (used by the test workflow)
ci-test-unit:
	just desktop-test-unit

# Run UI E2E features (used by the test workflow)
ci-test-e2e:
	just desktop-test-e2e

# Run backend + desktop checks used in CI pipelines
ci-verify:
	just ci-backend
	just ci-desktop

# Fail when Rust or TypeScript source files exceed the repository LoC limit
check-lines:
	./scripts/check-file-lines.sh

#
# Backward-compatible aliases kept during the current repo-shape transition
#

build-daemons:
	just backend-build-daemons

run-daemon:
	just backend-run-daemon

run-agentd:
	just backend-run-agentd

build-servers:
	just backend-build-servers

run-botd:
	just backend-run-botd

run-relayd:
	just backend-run-relayd

run-rendezvousd:
	just backend-run-rendezvousd

run-bffd:
	just backend-run-bffd

run-serverd:
	just backend-run-serverd

test-backend:
	just backend-test

test-relayd-smoke:
	just backend-test-relayd-smoke

test-rendezvousd-smoke:
	just backend-test-rendezvousd-smoke

test-desktop-soma:
	just desktop-test-soma

test-desktop-all:
	just desktop-test-all

build-docs:
	just docs-build

run-soma-desktop:
	just desktop-run-soma

build-soma:
	just desktop-build-soma

# Show available just recipes
help:
	just --list

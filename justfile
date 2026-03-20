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

# Build the desktop-facing Rust daemons from the backend workspace
backend-build-daemons:
	cd backend && cargo build -p soma-daemon -p soma-agentd

# Run the desktop soma-daemon peer for local development
backend-run-daemon:
	export SOMA_DATA_DIR="$PWD/.data" && mkdir -p "$SOMA_DATA_DIR/db" && cd backend && cargo run -p soma-daemon -- --socket-path "/tmp/soma-daemon-dev.sock" --db-path "$SOMA_DATA_DIR/db/daemon.db" --blob-dir "$SOMA_DATA_DIR/blobs/daemon" --listen-addrs /ip4/0.0.0.0/tcp/0/ws

# Run the soma-agentd helper process
backend-run-agentd:
	export SOMA_DATA_DIR="$PWD/.data" && mkdir -p "$SOMA_DATA_DIR/db" && cd backend && cargo run -p soma-agentd -- --socket-path "/tmp/soma-agentd-dev.sock" --db-path "$SOMA_DATA_DIR/db/agentd.db"

# Build the server-side binaries from the backend workspace
backend-build-servers:
	cd backend && cargo build -p soma-botd -p soma-relayd -p soma-rendezvousd -p soma-bffd -p soma-serverd

# Run soma-botd
backend-run-botd:
	export SOMA_DATA_DIR="$PWD/.data" && mkdir -p "$SOMA_DATA_DIR/db" && cd backend && cargo run -p soma-botd -- --http-addr 127.0.0.1:0 --db-url "sqlite://$SOMA_DATA_DIR/db/botd.db" --blob-dir "$SOMA_DATA_DIR/blobs/botd" --listen-addrs /ip4/127.0.0.1/tcp/0

# Run soma-relayd
backend-run-relayd:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p soma-relayd

# Run soma-rendezvousd
backend-run-rendezvousd:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p soma-rendezvousd

# Run soma-bffd
backend-run-bffd:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p soma-bffd

# Run soma-serverd (all-in-one server runner)
backend-run-serverd:
	export SOMA_DATA_DIR="$PWD/.data" && cd backend && cargo run -p soma-serverd

# Run the full Rust backend test suite
backend-test:
	cd backend && cargo test

# Run soma-relayd smoke tests (ignored by default)
backend-test-relayd-smoke:
	cd backend && cargo test -p soma-relayd --test smoke -- --ignored

# Run soma-rendezvousd smoke tests (ignored by default)
backend-test-rendezvousd-smoke:
	cd backend && cargo test -p soma-rendezvousd --test smoke -- --ignored

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

# Run the Soma Electron app in dev mode
desktop-run-soma:
	cd desktop && pnpm --filter soma dev

# Build the Soma Electron app
desktop-build-soma:
	cd desktop && pnpm --filter soma run build

# Typecheck the Soma desktop app (Node + Web)
desktop-test-soma:
	cd desktop && pnpm --filter soma run typecheck

# Typecheck the Tapia desktop app (Node + Web)
desktop-test-tapia:
	cd desktop && pnpm --filter tapia run typecheck

# Run lint + typecheck for both desktop apps
desktop-test-all:
	cd desktop && pnpm --filter soma run lint && pnpm --filter soma run typecheck
	cd desktop && pnpm --filter tapia run lint && pnpm --filter tapia run typecheck

# Generate icon assets for the Electron-based Soma app (desktop/soma)
desktop-icons-soma input="desktop/soma/build/icon.png":
	input_path="{{input}}"; input_path="${input_path#input=}"; cargo icons --input "$input_path" --output desktop/soma/build --flatten
	cp desktop/soma/build/icons/icon.icns desktop/soma/build/icon.icns
	cp desktop/soma/build/icons/icon-legacy.icns desktop/soma/build/icon-legacy.icns
	cp desktop/soma/build/icons/icon.ico desktop/soma/build/icon.ico
	cp desktop/soma/build/icons/1024x1024.png desktop/soma/build/icon.png
	cp desktop/soma/build/icons/1024x1024.png desktop/soma/resources/icon.png
	mkdir -p desktop/soma/src/renderer/public
	cp desktop/soma/build/icons/1024x1024.png desktop/soma/src/renderer/public/icon.png

# Generate icon assets for the Electron-based Tapia app (desktop/tapia)
desktop-icons-tapia input="desktop/tapia/build/icon.png":
	input_path="{{input}}"; input_path="${input_path#input=}"; cargo icons --input "$input_path" --output desktop/tapia/build --flatten
	cp desktop/tapia/build/icons/icon.icns desktop/tapia/build/icon.icns
	cp desktop/tapia/build/icons/icon-legacy.icns desktop/tapia/build/icon-legacy.icns
	cp desktop/tapia/build/icons/icon.ico desktop/tapia/build/icon.ico
	cp desktop/tapia/build/icons/1024x1024.png desktop/tapia/build/icon.png
	cp desktop/tapia/build/icons/1024x1024.png desktop/tapia/resources/icon.png
	mkdir -p desktop/tapia/src/renderer/public
	cp desktop/tapia/build/icons/1024x1024.png desktop/tapia/src/renderer/public/icon.png

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

# Run backend checks used in CI
ci-backend:
	just backend-test

# Run desktop checks used in CI
ci-desktop:
	just desktop-test-all

# Run backend + desktop checks used in CI pipelines
ci-verify:
	just ci-backend
	just ci-desktop

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

test-desktop-tapia:
	just desktop-test-tapia

test-desktop-all:
	just desktop-test-all

icons-soma input="desktop/soma/build/icon.png":
	just desktop-icons-soma {{input}}

icons-tapia input="desktop/tapia/build/icon.png":
	just desktop-icons-tapia {{input}}

build-docs:
	just docs-build

run-soma-desktop:
	just desktop-run-soma

build-soma:
	just desktop-build-soma

# Show available just recipes
help:
	just --list

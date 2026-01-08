# Helper scripts for common build, run, compose, and test workflows.

set shell := ["bash", "-lc"]

#
# Desktop daemon helpers
#

# Build soma-daemon and soma-agentd from the backend workspace
build-daemons:
    cargo build -p soma-daemon -p soma-agentd

# Run the desktop soma-daemon peer for local development
run-daemon:
	export SOMA_DATA_DIR="$PWD/.data" && cargo run -p soma-daemon -- --socket-path /tmp/soma-daemon.sock --db-path $SOMA_DATA_DIR/db/daemon.db --blob-dir $SOMA_DATA_DIR/blobs/daemon --listen-addrs /ip4/0.0.0.0/tcp/3000/ws

# Run the soma-agentd helper process
run-agentd:
    export SOMA_DATA_DIR="$PWD/.data" && cargo run -p soma-agentd -- --socket-path /tmp/soma-agentd.sock --models-dir $SOMA_DATA_DIR/models --default-chat-model Meta-Llama-3-8B-Instruct.Q4_K_M.gguf

#
# Server binaries
#

# Build the server-side binaries (botd, relayd, rendezvousd, bffd, serverd)
build-servers:
    cargo build -p soma-botd -p soma-relayd -p soma-rendezvousd -p soma-bffd -p soma-serverd

# Run soma-botd
run-botd:
    export SOMA_DATA_DIR=$PWD/.data && cargo run -p soma-botd -- --http-addr 127.0.0.1:0 --db-url sqlite://$SOMA_DATA_DIR/db/botd.db --blob-dir $SOMA_DATA_DIR/blobs/botd --listen-addrs /ip4/127.0.0.1/tcp/0

# Run soma-relayd
run-relayd:
    export SOMA_DATA_DIR=$PWD/.data && cargo run -p soma-relayd

# Run soma-rendezvousd
run-rendezvousd:
    export SOMA_DATA_DIR=$PWD/.data && cargo run -p soma-rendezvousd

# Run soma-bffd
run-bffd:
    export SOMA_DATA_DIR=$PWD/.data && cargo run -p soma-bffd

# Run soma-serverd (all-in-one server runner)
run-serverd:
    export SOMA_DATA_DIR=$PWD/.data && cargo run -p soma-serverd

#
# Docker Compose helpers
#

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
# Testing
#

# Run the full Rust backend test suite
test-backend:
    cargo test

# Run soma-relayd smoke tests (ignored by default)
test-relayd-smoke:
    cargo test -p soma-relayd --test smoke -- --ignored

# Run soma-rendezvousd smoke tests (ignored by default)
test-rendezvousd-smoke:
    cargo test -p soma-rendezvousd --test smoke -- --ignored

# Typecheck the Soma desktop app (Node + Web)
test-desktop-soma:
    pnpm --filter soma-app run typecheck

# Typecheck the Tapia desktop app (Node + Web)
test-desktop-tapia:
    pnpm --filter tapia-app run typecheck

# Run lint + typecheck for both desktop apps
test-desktop-all:
    pnpm --filter soma-app run lint && pnpm --filter soma-app run typecheck
    pnpm --filter tapia-app run lint && pnpm --filter tapia-app run typecheck

# Build docs site (used in CI for gh-pages)
build-docs:
    pnpm --filter @soma/docs run build
    cd desktop/soma-ui && pnpm run build:storybook -- --output-dir ../../site/storybook

# CI helpers (combine existing recipes)

# Run backend + desktop checks used in CI pipelines
ci-verify:
    just test-backend
    just test-desktop-all

run-soma-desktop:
    pnpm --filter soma-app tauri dev

build-soma:
    pnpm --filter soma-app tauri build -b app

# Show available just recipes
help:
    just --list

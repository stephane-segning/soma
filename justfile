# Helper scripts for common build, run, compose, and test workflows.

set shell := ["bash", "-lc"]

#
# Desktop daemon helpers
#

# Build soma-daemon and soma-agentd from the backend workspace
build-daemons:
	cd backend && cargo build -p soma-daemon -p soma-agentd

# Run the desktop soma-daemon peer for local development
run-daemon:
	cd backend && cargo run -p soma-daemon

# Run the soma-agentd helper process
run-agentd:
	cd backend && cargo run -p soma-agentd

#
# Server binaries
#

# Build the server-side binaries (botd, relayd, rendezvousd, bffd, serverd)
build-servers:
	cd backend && cargo build -p soma-botd -p soma-relayd -p soma-rendezvousd -p soma-bffd -p soma-serverd

# Run soma-botd
run-botd:
	cd backend && cargo run -p soma-botd

# Run soma-relayd
run-relayd:
	cd backend && cargo run -p soma-relayd

# Run soma-rendezvousd
run-rendezvousd:
	cd backend && cargo run -p soma-rendezvousd

# Run soma-bffd
run-bffd:
	cd backend && cargo run -p soma-bffd

# Run soma-serverd (all-in-one server runner)
run-serverd:
	cd backend && cargo run -p soma-serverd

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
	cd backend && cargo test

# Run soma-relayd smoke tests (ignored by default)
test-relayd-smoke:
	cd backend && cargo test -p soma-relayd --test smoke -- --ignored

# Run soma-rendezvousd smoke tests (ignored by default)
test-rendezvousd-smoke:
	cd backend && cargo test -p soma-rendezvousd --test smoke -- --ignored

# Typecheck the Soma desktop app (Node + Web)
test-desktop-soma:
	cd desktop && pnpm --filter soma run typecheck

# Typecheck the Tapia desktop app (Node + Web)
test-desktop-tapia:
	cd desktop && pnpm --filter tapia run typecheck

# Run lint + typecheck for both desktop apps
test-desktop-all:
	cd desktop && pnpm --filter soma run lint && pnpm --filter soma run typecheck
	cd desktop && pnpm --filter tapia run lint && pnpm --filter tapia run typecheck

# Show available just recipes
help:
	just --list

# Testing the Daemon Locally (gRPC over Unix Socket + Join Flow)

This guide documents how to test the current Soma daemon IPC surface and the join flow end-to-end using `grpcurl`.

It exercises:

- `soma-daemon` gRPC over a Unix domain socket (UDS)
- `soma-botd` as a libp2p peer that receives the Join request
- `Daemon/StreamEvents` to observe `joinSubmitted` and `joinDecision`

## Prerequisites

- `cargo` (Rust toolchain)
- `grpcurl`
  - macOS (Homebrew): `brew install grpcurl`

## Important note about `grpcurl` + Unix sockets

In this repo, the daemon listens on a Unix socket (e.g. `./soma-daemon.sock`).

On some `grpcurl` builds, `-unix` does not work reliably when the address is a plain path.
The most reliable form is using a `unix://` target string:

`"unix://$PWD/soma-daemon.sock"`

If you try `-unix ./soma-daemon.sock` and see `dial tcp ... missing port in address`, use the `unix://` form.

## 1) Start the daemon (UDS gRPC server)

From `backend/`:

```bash
cd backend
rm -f ./soma-daemon.sock

RUST_LOG=info cargo run -p soma-daemon -- \
  --socket-path "$PWD/soma-daemon.sock" \
  --blob-dir ./blobs-test \
  --disable-mdns \
  --listen-addrs /ip4/127.0.0.1/tcp/0
```

Why these flags:

- `--disable-mdns`: avoids OS-level mDNS permissions/issues on some environments.
- `--listen-addrs /ip4/127.0.0.1/tcp/0`: bind a random local TCP port instead of fixed ports.

## 2) Start the bot peer

From another terminal (still in `backend/`):

```bash
cd backend

RUST_LOG=info cargo run -p soma-botd -- \
  --http-addr 127.0.0.1:0 \
  --disable-mdns \
  --listen-addrs /ip4/127.0.0.1/tcp/0
```

From the bot logs, copy:

- `peer_id=...`
- `listen_addr=...` (example: `/ip4/127.0.0.1/tcp/60806`)

Build the bot target multiaddr by appending `/p2p/<peer_id>`:

Example:

`/ip4/127.0.0.1/tcp/60806/p2p/Qm...`

## 3) Verify daemon is reachable via gRPC

From `backend/`:

```bash
grpcurl -plaintext \
  -import-path ../proto \
  -proto ../proto/daemon/v1/daemon.proto \
  "unix://$PWD/soma-daemon.sock" \
  daemon.v1.Daemon/Status
```

Expected response shape:

- `peerId` (daemon libp2p peer id)
- `listenAddrs` (daemon listen addresses)

## 4) Stream daemon events

In one terminal (leave running):

```bash
grpcurl -plaintext \
  -import-path ../proto \
  -proto ../proto/daemon/v1/daemon.proto \
  "unix://$PWD/soma-daemon.sock" \
  daemon.v1.Daemon/StreamEvents
```

## 5) Submit a join request

In another terminal, replace `<BOT_PEER_ID>` and `<BOT_MULTIADDR_WITH_P2P>`:

```bash
grpcurl -plaintext \
  -import-path ../proto \
  -proto ../proto/daemon/v1/daemon.proto \
  -d '{
    "class_id": "class-123",
    "display_name": "Alice",
    "device_name": "Test",
    "target_peer_id": "<BOT_PEER_ID>",
    "target_multiaddrs": ["<BOT_MULTIADDR_WITH_P2P>"]
  }' \
  "unix://$PWD/soma-daemon.sock" \
  daemon.v1.Daemon/JoinClass
```

Expected:

- The RPC returns a `requestId`.
- The events stream shows:
  - `joinSubmitted`
  - `joinDecision`

Current behaviour:

- The peer join protocol default is to reject inbound join requests with `JOIN_REJECTED` and reason `not an issuer`.
  (This will change once `soma-botd` implements issuer/approval logic.)

## Troubleshooting

### `Too many arguments` from `grpcurl`

Double-check ordering. The basic forms are:

- `grpcurl [flags] [address] list`
- `grpcurl [flags] [address] describe <symbol>`
- `grpcurl [flags] [address] <service/method>`

For Unix sockets, prefer: `"unix://$PWD/soma-daemon.sock"` as the address.

### `missing port in address` when using `-unix`

Use the `unix://...` address form (no `-unix` flag):

`grpcurl -plaintext ... "unix://$PWD/soma-daemon.sock" daemon.v1.Daemon/Status`

### mDNS / permission errors (macOS)

Run with `--disable-mdns` for both `soma-daemon` and `soma-botd`.

### Daemon socket not created

- Ensure `--socket-path` is writable.
- Remove stale socket file: `rm -f ./soma-daemon.sock`
- Check daemon logs for early panics or bind failures.

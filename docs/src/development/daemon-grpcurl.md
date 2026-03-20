# Testing the Daemon Locally With `grpcurl`

This guide exercises the current local daemon IPC surface over a Unix socket.

It focuses on:

- `Daemon/Status`
- `Daemon/StreamEvents`
- `Daemon/JoinSpace`

## Prerequisites

- Rust toolchain
- `grpcurl`

## Unix Socket Note

For this repo, `grpcurl` works most reliably with a `unix://` target string.

Example:

```bash
"unix:///tmp/soma-daemon-dev.sock"
```

## 1. Start the Daemon

From the repo root, the simplest path is:

```bash
just run-daemon
```

That uses the dev socket path:

```bash
/tmp/soma-daemon-dev.sock
```

If you want to start it manually instead, use a matching socket path and local-only listen address.

## 2. Verify `Status`

```bash
grpcurl -plaintext \
  -import-path proto \
  -proto proto/daemon/v1/daemon.proto \
  "unix:///tmp/soma-daemon-dev.sock" \
  daemon.v1.Daemon/Status
```

Expected fields include:

- `peerId`
- `listenAddrs`

## 3. Stream Events

```bash
grpcurl -plaintext \
  -import-path proto \
  -proto proto/daemon/v1/daemon.proto \
  "unix:///tmp/soma-daemon-dev.sock" \
  daemon.v1.Daemon/StreamEvents
```

Keep this running while you trigger actions from the UI or other RPC calls.

## 4. Optional: Test Join Submission

Start a bot in another terminal:

```bash
just run-botd
```

Then collect the bot peer id and a listen multiaddr with `/p2p/<peer-id>` appended.

Submit the join request:

```bash
grpcurl -plaintext \
  -import-path proto \
  -proto proto/daemon/v1/daemon.proto \
  -d '{
    "space_id": "space-123",
    "display_name": "Alice",
    "device_name": "Test",
    "target_peer_id": "<BOT_PEER_ID>",
    "target_multiaddrs": ["<BOT_MULTIADDR_WITH_P2P>"]
  }' \
  "unix:///tmp/soma-daemon-dev.sock" \
  daemon.v1.Daemon/JoinSpace
```

Expected immediate result:

- the RPC returns a `requestId`
- the event stream shows `joinSubmitted`

Current join behavior note:

- `soma-botd` does not auto-approve every request by default
- approval requires the relevant issuer capability path, otherwise the request remains part of a manual decision flow

## Troubleshooting

### `missing port in address`

Use the `unix://...` form rather than `-unix` with a bare path.

### Daemon socket missing

- start `just run-daemon`
- remove any stale socket file if needed
- verify the stage-specific socket name you are targeting

### No join decision arrives

- verify the bot peer id and target multiaddr
- verify the bot is reachable over libp2p
- verify the bot has the right approval/issuer material if you expect auto-approval

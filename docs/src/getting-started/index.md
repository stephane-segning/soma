# Getting Started

This is the current development path for the repo as it exists today.

The quickest useful setup is:

- `desktop/desktop-app` (the Tauri V2 app — its Rust `src-tauri` host embeds the
  peer + agent runtimes in-process and exposes them to the React/Vite renderer
  through Tauri commands consumed via `@soma/sdk`)

Add `somad` (with the `bot`, `relay`, or `rendezvous` subcommand) only when you
need peer/network flows that aren't satisfied by mDNS on the local machine.

## Prerequisites

- Rust toolchain with Cargo (the Tauri host is a Rust binary crate)
- Node.js and `pnpm` (pnpm 9)
- optional: `just` for the repo shortcuts

On **Linux**, the Tauri build needs the WebKitGTK / GTK system libraries. On a
Debian/Ubuntu-based distro:

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev file patchelf build-essential pkg-config \
  xdg-utils desktop-file-utils
```

macOS and Windows need no extra system packages beyond the Rust + Node toolchains.

Install JS dependencies from the repo root:

```bash
pnpm install
```

## Fast Local Loop

From the repo root:

```bash
just desktop-run-soma
# or, directly:
pnpm --filter @soma/desktop-app run tauri:dev
```

`tauri dev` compiles the Rust `src-tauri` host, starts the Vite renderer, and
launches the app window. The host embeds the daemon + agent runtimes inside the
`src-tauri` process — there is no separate daemon binary to launch, no Unix
socket, and no napi addon. A native splash covers init; the main window reveals
once the runtimes are ready. Local data lives at
`~/Library/Application Support/Soma/` on macOS and `~/.local/share/soma/` on
Linux.

To produce an installable bundle instead of the dev loop:

```bash
just desktop-build-soma
# or, directly:
pnpm --filter @soma/desktop-app run tauri:build
```

## What Each Process Does

- `desktop/desktop-app` (Tauri V2): the only desktop app. The Rust `src-tauri`
  host (composed from the `desktop-*` crates) embeds the libp2p peer / blob
  store / agent runtime and registers them as Tauri commands; the React
  renderer talks to the host through the typed `@soma/sdk` facade
  (`createBackend(tauriTransport())`).

## Tapia (Typing Practice)

Tapia's typing-practice surface is being merged into Soma as a `/practice`
route, but that route is **not yet wired in the Tauri app** — the renderer
router (`desktop/desktop-app/src/routes/router.tsx`) currently ships
`/spaces`, `/settings`, and the page editor. The `/practice` migration is a
tracked follow-up.

## Optional: Run Peer/Infra Services

Use these when validating discovery, relays, or hosted peer flows:

```bash
just backend-run-bot
just backend-run-relay
just backend-run-rendezvous
```

Notes:

- `somad bot` does not blindly auto-approve joins by default; approval depends
  on the bot holding valid issuer capability material or on a manual decision
  path.
- `somad relay` and `somad rendezvous` expose health/metrics HTTP endpoints in
  addition to libp2p listeners.

## Useful Checks

```bash
just backend-test
just desktop-test-all
```

For docs:

```bash
pnpm --filter @soma/docs run build
```

## Troubleshooting

- The daemon runs inside the Tauri `src-tauri` host process; if Soma fails to
  start, watch the host logs for runtime-init errors. Logs land in the OS logs
  dir (`~/Library/Logs/Soma/` on macOS, `~/.local/state/soma/logs/` on Linux);
  use `RUST_LOG=debug` for verbose host output. There is no separate daemon
  process to inspect.
- For peer-flow issues, bring up `somad bot` / `somad relay` /
  `somad rendezvous` only after the local in-process peer path works.

## More Specific Docs

- `docs/src/development/agentd-models.md`
- `docs/src/development/desktop-config.md`
- `docs/src/architecture/peer-connectivity.md`

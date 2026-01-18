# `desktop/soma` (Electron/Chromium shell)

Electron desktop shell (React + TypeScript) used for development/testing and parity work.

- Renderer: `desktop/soma/src/renderer` (ported from `desktop/soma-app/src`)
- Main process (Node/Electron): `desktop/soma/src/main` (Inversify DI + IPC command registry)

The primary packaged Soma desktop app is still the Tauri app in `desktop/soma-app`.

## Window chrome (frameless)

This app runs with a frameless window and custom window controls:

- Main process: `desktop/soma/src/main/index.ts` sets `frame: false` and (on macOS) calls `mainWindow.setWindowButtonVisibility(false)` to hide native traffic-light buttons.
- Renderer window controls: `desktop/soma/src/renderer/src/components/window-controls.tsx` (wired via IPC).

### Drag region

For a frameless window to be draggable, mark a non-interactive area with `data-drag-region` and ensure interactive elements are opted out with `data-no-drag`.

- CSS: `desktop/soma/src/renderer/src/styles/app.scss` applies `-webkit-app-region: drag` to `*[data-drag-region]` and `-webkit-app-region: no-drag` to `[data-no-drag]`.
- Usage: `desktop/soma/src/renderer/src/routes/layouts/app-layout.tsx` sets `data-drag-region` on the header/container and `data-no-drag` around buttons.

## IPC boundary

- Preload bridge: `desktop/soma/src/preload/index.ts` exposes `window.api.invoke(...)`.
- Renderer helper: `desktop/soma/src/renderer/src/lib/ipc.ts`.
- Main-process handlers: `desktop/soma/src/main/command-registry.ts` (command names match the Tauri `invoke(...)` names where possible).

## Proto / gRPC types

Node/Electron code imports generated TS gRPC stubs from the workspace package:

- `desktop/proto` (`@soma/proto`)

## Missing parity (vs `desktop/soma-app`)

This shell does not yet implement all Tauri main-process features:

- Deep-link handling (`soma://...`) and single-instance behavior (Tauri has `tauri-plugin-deep-link` + `tauri-plugin-single-instance`).
- Window state persistence (Tauri has `tauri-plugin-window-state`).
- File-based logging equivalent to `@tauri-apps/plugin-log` (currently forwards renderer console → main console).
- IPC commands for `agent_rerank` and `agent_resolve_drift` (present in the Tauri main process).

## Recommended IDE setup

- VS Code + Biome (`biome.jsonc` lives in this package)

## Project Setup

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
# For windows
pnpm build:win

# For macOS
pnpm build:mac

# For Linux
pnpm build:linux
```

## Environment variables

- `SOMA_DAEMON_SOCKET` (default: `/tmp/soma-daemon.sock`)
- `SOMA_AGENTD_SOCKET` (default: `/tmp/soma-agentd.sock`)

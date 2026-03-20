# `desktop/soma` (Electron/Chromium shell)

Electron desktop shell (React + TypeScript) used for development/testing and parity work.

- Renderer: `desktop/soma/src/renderer`
- Main process (Node/Electron): `desktop/soma/src/main` (Inversify DI + IPC command registry)
- Startup orchestration: `desktop/soma/src/main/services/startup-service.ts`

This is the primary Soma desktop app.

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

- `desktop/desktop-proto` (`@soma/proto`)

## Desktop integrations

### Deep links + single instance

- Scheme: `soma://...` (registered in `desktop/soma/electron-builder.yml`).
- Main process emits `app:deep-link` to the renderer with the URL payload.
- Secondary launches forward the URL to the existing window (`second-instance`).

Renderer usage example:

```ts
window.electron.ipcRenderer.on("app:deep-link", (_event, url) => {
  // handle soma://... URL
});
```

### Window state persistence

- Stored via `electron-store` in `desktop/soma/src/main/services/app-data-store.ts`.
- Window bounds + maximized/fullscreen flags are saved under `windowState`.

### Logging

- Main process logs to `winston` file transport.
- Location: `app.getPath("userData")/logs/main.log` (console logs enabled in dev).

### Agent IPC

- `agent_rerank` and `agent_resolve_drift` are handled in the main process and forward to `soma-agentd` via gRPC.

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

- `SOMA_STAGE` / `SOMA_CHANNEL` (dev-only; ignored in packaged apps)
- `SOMA_DAEMON_SOCKET` (dev-only; default: `/tmp/soma-daemon.sock`, or `/tmp/soma-daemon-<stage>.sock` for non-prod stages)
- `SOMA_AGENTD_SOCKET` (dev-only; default: `/tmp/soma-agentd.sock`, or `/tmp/soma-agentd-<stage>.sock` for non-prod stages)

Note: for non-prod stages, the desktop app expects stage-suffixed sockets by default; run `soma-daemon` / `soma-agentd` with matching `--socket-path` (or set the env vars in dev).

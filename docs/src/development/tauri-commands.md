# Tauri Apps: Commands, Controllers, Errors

This repo standardizes the Tauri command boundary for both desktop apps:

- Soma: `desktop/soma-app/src-tauri`
- Tapia: `desktop/tapia-app/src-tauri`

## Goals

- Keep `commands.rs` thin (parse → delegate).
- Make request payloads explicit and versionable (one `Params` struct per method).
- Share error + parsing logic across apps.

## Shared crate: `tauri-command-utils`

Path: `desktop/tauri-command-utils`

Exports:

- `tauri_command_utils::parse_params(&Request, "command_name") -> AppResult<Params>`
- `tauri_command_utils::{AppError, AppResult}`

### Feature flags (compile-time error layers)

`AppError` is feature-gated so each app can compile only the variants it needs:

- `bad-request`: `AppError::BadRequest(String)`
- `json-error`: `AppError::Json(serde_json::Error)`
- `io`: `AppError::Io(std::io::Error)`
- `anyhow`: `AppError::Other(anyhow::Error)`
- `daemon`: `AppError::Daemon(String)` + `From<tonic::Status>` / `From<tonic::transport::Error>`
- `agent`: `AppError::Agent(String)`
- `thiserror`: adds `thiserror::Error` derive (apps do **not** depend on `thiserror` directly)

Example dependency configuration:

```toml
tauri-command-utils = { workspace = true, features = [
  "thiserror", "bad-request", "json-error",
  # Soma needs these:
  "io", "anyhow", "daemon", "agent",
] }
```

## Controller pattern (category controllers)

Each app registers a small set of “category controllers” via `.manage(...)`, then commands use `tauri::State<'_, Controller>` to access them.

Examples:

- Soma controllers: `desktop/soma-app/src-tauri/src/handlers/*`
  - `DocumentsController`, `SpacesController`, `BlobsController`, `AgentController`, `SearchController`
- Tapia controllers: `desktop/tapia-app/src-tauri/src/handlers/*`
  - `GreetingController` (currently minimal)

### Rule: one `Params` struct per method

- Commands accept `tauri::ipc::Request<'_>` and deserialize the JSON body themselves.
- Params structs use `serde` with `camelCase` field names:

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExampleParams {
  pub space_id: String,
}
```

## Where it lives in code

- Soma command entrypoints: `desktop/soma-app/src-tauri/src/commands.rs`
- Tapia command entrypoints: `desktop/tapia-app/src-tauri/src/commands.rs`
- Shared parsing + errors: `desktop/tauri-command-utils/src/lib.rs`

## Electron parity (development shell)

The Electron/Chromium desktop shell (`desktop/soma`) mirrors the same command names via IPC:

- Main-process command registry: `desktop/soma/src/main/command-registry.ts`
- Preload invoke bridge: `desktop/soma/src/preload/index.ts` (`window.api.invoke`)

### Newly added (Soma)

- `agent_list_models`: returns agentd model metadata for the chat UI select.
- `agent_rerank`: forwards rerank requests (query + candidates) to agentd.
- `agent_resolve_drift`: merges two Yjs updates (base64 → bytes) via agentd to fix drifted documents.
- `spaces_list_members`: IPC wrapper over daemon `ListSpaceMembers` to return the space roster; used by the `/spaces/:spaceId/members` screen (read-only list, no custom member page beyond this).

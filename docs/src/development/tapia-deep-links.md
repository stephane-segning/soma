# Tapia deep links (tapia://)

Tapia (Tauri) registers a custom scheme so the OS can hand exercises straight into the app and store them as blobs via the local daemon.

- Scheme: `tapia://<host>/<cuid>`
  - Configured in `desktop/tapia-app/src-tauri/tauri.conf.json` under `plugins.deep-link.desktop.schemes`.
  - Parsed and emitted as an internal event in `desktop/tapia-app/src-tauri/src/handlers/deep_link.rs` (`tapia://exercise`).
- Runtime wiring
  - Deep link plugin is installed in `desktop/tapia-app/src-tauri/src/lib.rs`; it emits existing URLs on startup and listens for new ones.
  - Daemon client for uploads lives in `desktop/tapia-app/src-tauri/src/daemon.rs` + `transport.rs` (Unix socket via `SOMA_DAEMON_SOCKET` or `/tmp/soma-daemon.sock`).
  - Exercises controller (`desktop/tapia-app/src-tauri/src/handlers/exercises.rs`) exposes two commands:
    - `stage_exercise`: stores the fetched exercise JSON as `application/json` blob in the target space.
    - `record_benchmark`: stores a benchmark JSON blob when the user finishes typing.
  - Commands are exported in `desktop/tapia-app/src-tauri/src/commands.rs` and registered in `src-tauri/src/lib.rs`.
- Renderer flow (`desktop/tapia-app/src/App.tsx`)
  - Listens for `tapia://exercise` event from the backend.
  - Fetches exercise JSON from the host using fallback paths:
    - `https://<host>/api/tapia/exercises/<cuid>`
    - `https://<host>/tapia/exercises/<cuid>`
    - `https://<host>/<cuid>` (http variants are also tried)
  - Expected payload fields: `message` (or `text`), optional `topic`, `difficulty`, `spaceId`, `tags`, `source`.
  - After fetch: stages the exercise to the daemon (`stage_exercise`), starts the typing session, and on completion calls `record_benchmark` with WPM/accuracy/duration.
- Blob shape
  - Exercise blob: `{ exerciseId, spaceId, text, topic?, difficulty?, source?, sourceHost?, sourceLink?, tags?, length, ingestedAtMs }`
  - Benchmark blob: `{ exerciseId, spaceId, exerciseCid?, wpm, accuracy, durationMs, completedAtMs, sourceHost?, sourceLink?, recordedAtMs }`
- Testing quickstart
  - Build/check: `cargo check -p tapia-app`
  - During dev, trigger a link: `open "tapia://localhost/ck3d123"` (macOS) or `xdg-open` on Linux.
  - Watch logs for staging/saving blobs; the daemon must be running to accept uploads.

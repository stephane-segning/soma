//! `tauri-specta` glue. Builds the typed command list, registers extra
//! types (event payloads, error envelopes) that aren't directly returned
//! by a command, and emits `bindings.ts` on debug builds.
//!
//! Output lands at `desktop-app/src/lib/bindings/index.ts` (relative path
//! resolved from the `src-tauri/` cwd). Release builds skip the export so
//! the binary doesn't write to disk on launch.

use desktop_agent::AgentRuntimeEvent;
use desktop_core::error::DesktopError;
use desktop_daemon::events::DomainEvent;
use tauri::Wry;
use tauri_specta::{Builder, collect_commands};

/// Construct the `tauri-specta` Builder. Each Tauri command we expose to
/// the renderer is referenced here exactly once.
pub fn build_specta() -> Builder<Wry> {
    Builder::<Wry>::new()
        .commands(collect_commands![
            super::app_info,
            // TanStack DB key/value storage.
            desktop_commands::settings_storage::db_storage_get,
            desktop_commands::settings_storage::db_storage_set,
            desktop_commands::settings_storage::db_storage_remove,
            desktop_commands::settings_storage::db_storage_clear,
            desktop_commands::settings_storage::db_storage_keys,
            // App-wide settings (values are JSON-encoded strings on the wire).
            desktop_commands::settings_storage::settings_get,
            desktop_commands::settings_storage::settings_set,
            desktop_commands::settings_storage::settings_get_all,
            // Window controls
            desktop_commands::window::window_control,
            desktop_commands::window::window_minimize,
            desktop_commands::window::window_toggle_maximize,
            desktop_commands::window::window_close,
            // Daemon
            desktop_commands::daemon::daemon_status,
            desktop_commands::daemon::daemon_ready,
            desktop_commands::daemon::daemon_control,
            // Spaces
            desktop_commands::spaces::spaces_list,
            desktop_commands::spaces::spaces_create,
            desktop_commands::spaces::spaces_get,
            desktop_commands::spaces::spaces_update,
            desktop_commands::spaces::spaces_delete,
            desktop_commands::spaces::spaces_list_members,
            desktop_commands::spaces::spaces_list_my_memberships,
            desktop_commands::spaces::spaces_list_bots,
            desktop_commands::spaces::spaces_join,
            desktop_commands::spaces::spaces_decide_join,
            desktop_commands::spaces::spaces_list_join_requests,
            desktop_commands::spaces::spaces_revoke_member,
            desktop_commands::spaces::spaces_issue_issuer_capability,
            // Documents
            desktop_commands::documents::documents_upsert,
            desktop_commands::documents::documents_get,
            desktop_commands::documents::documents_ensure_page,
            desktop_commands::documents::documents_list_pages,
            desktop_commands::documents::documents_update_page_title,
            desktop_commands::documents::documents_set_page_parents,
            // Blobs
            desktop_commands::blobs::blobs_upload,
            desktop_commands::blobs::blobs_read,
            desktop_commands::blobs::blobs_stage_upload,
            // Agent
            desktop_commands::agent::agent_chat_stream,
            desktop_commands::agent::agent_list_models,
            desktop_commands::agent::agent_rerank,
            desktop_commands::agent::agent_resolve_drift,
            desktop_commands::agent::agent_enqueue_background_task,
            desktop_commands::agent::agent_list_background_tasks,
            // Search
            desktop_commands::search::search,
        ])
        // Event payloads + the error envelope are added below; without
        // them specta only sees what commands return. Comment one out at
        // a time when bisecting recursive-Type panics.
        .typ::<DomainEvent>()
        .typ::<AgentRuntimeEvent>()
        .typ::<DesktopError>()
}

/// Emit `bindings.ts` during dev runs only. Release builds skip this so
/// the binary never writes to the source tree on a user's machine.
#[cfg(debug_assertions)]
pub fn export_bindings(builder: &Builder<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    use specta_typescript::Typescript;
    builder.export(Typescript::default(), "../src/lib/bindings/index.ts").map_err(Into::into)
}

#[cfg(not(debug_assertions))]
pub fn export_bindings(_builder: &Builder<Wry>) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Keeps `desktop-app/src/lib/bindings/index.ts` in sync with the Rust
    /// command surface. Run with `cargo test -p desktop-app
    /// emit_typescript_bindings` after touching any DTO or command — CI
    /// then asserts the working tree stays clean.
    #[test]
    fn emit_typescript_bindings() {
        let builder = build_specta();
        export_bindings(&builder).expect("export bindings");
    }
}

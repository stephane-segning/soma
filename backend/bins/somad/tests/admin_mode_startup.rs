//! Fail-closed startup coverage for `somad bot --mode admin` (item 5): an
//! admin-mode process with no configured token has every write endpoint —
//! including `/v1/spaces/issuer-capability/import`, which base64-decodes
//! arbitrary caller-supplied bytes straight into local storage — wide
//! open to anyone who can reach the HTTP port.
//! `commands::bot::runtime::validate_admin_mode_token`'s doc comment has
//! the full reasoning (mirrors `desktop-bff`'s identical `SOMA_BFF_TOKEN`
//! gate — `desktop/desktop-bff/tests/startup.rs`, the pattern this file
//! follows).
//!
//! Spawns the real compiled binary (`env!("CARGO_BIN_EXE_somad")`, set
//! automatically by Cargo for integration tests in this package) rather
//! than calling library code, since the check runs inside the
//! `main`-adjacent `bot::run` entry point, not anything exposed as a
//! library API. Deterministic despite spawning a real process:
//! `validate_admin_mode_token` runs before any I/O (no blob dir created,
//! no DB connection opened, no port bound — see `runtime::run`), so the
//! process exits almost immediately rather than depending on a timeout.

use std::process::Command;

fn somad_command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_somad"))
}

#[test]
fn admin_mode_refuses_to_start_without_a_token() {
    let output = somad_command()
        .args(["bot", "--mode", "admin"])
        .env_remove("SOMA_ADMIN_TOKEN")
        .output()
        .expect("spawn somad");

    assert!(
        !output.status.success(),
        "somad bot --mode admin must exit non-zero with no token configured, got status {:?}",
        output.status
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("admin token"),
        "expected stderr to explain the missing admin token, got: {stderr}"
    );
}

#[test]
fn admin_mode_refuses_to_start_with_a_blank_token() {
    let output = somad_command()
        .args(["bot", "--mode", "admin", "--admin-token", ""])
        .env_remove("SOMA_ADMIN_TOKEN")
        .output()
        .expect("spawn somad");

    assert!(
        !output.status.success(),
        "somad bot --mode admin must exit non-zero with a blank token, got status {:?}",
        output.status
    );
}

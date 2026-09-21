//! Fail-closed startup coverage: `SOMA_BFF_TOKEN` is mandatory and
//! unconditional (see `main.rs`'s `resolve_config` doc comment — this is
//! deliberately *not* "only required for a non-loopback bind address").
//! This is the one behavior in this crate that genuinely lives in the
//! `main.rs` binary rather than the `desktop_bff` library (`resolve_config`
//! is a private fn of the binary crate), so it's tested by actually
//! running the compiled binary rather than calling library code —
//! `env!("CARGO_BIN_EXE_desktop-bff")` is cargo's standard mechanism for
//! this, and needs no extra build step: the binary is already built as
//! part of compiling this test crate's dependencies.
//!
//! Deterministic despite spawning a real process: an unset/blank
//! `SOMA_BFF_TOKEN` makes `resolve_config()` return `Err` before *any*
//! I/O happens (no daemon start, no port bind, no logger directory
//! creation reaching completion) — see `main.rs`, `resolve_config()` is
//! called and `?`-propagated before anything else runs — so the process
//! exits almost immediately rather than depending on a timeout.

use std::process::Command;

fn bff_command() -> Command {
    Command::new(env!("CARGO_BIN_EXE_desktop-bff"))
}

#[test]
fn refuses_to_start_without_a_token() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let output = bff_command()
        .env_remove("SOMA_BFF_TOKEN")
        .env("SOMA_BFF_USER_DATA_DIR", tmp.path())
        // Bind to an ephemeral port so this test can never collide with
        // a real running instance, even though it should never reach
        // the bind call at all.
        .env("SOMA_BFF_BIND", "127.0.0.1:0")
        .output()
        .expect("spawn desktop-bff");

    assert!(
        !output.status.success(),
        "desktop-bff must exit non-zero when SOMA_BFF_TOKEN is unset, got status {:?}",
        output.status
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("SOMA_BFF_TOKEN"),
        "expected stderr to explain the missing token, got: {stderr}"
    );
}

#[test]
fn refuses_to_start_with_a_blank_token() {
    let tmp = tempfile::TempDir::new().expect("tempdir");
    let output = bff_command()
        .env("SOMA_BFF_TOKEN", "")
        .env("SOMA_BFF_USER_DATA_DIR", tmp.path())
        .env("SOMA_BFF_BIND", "127.0.0.1:0")
        .output()
        .expect("spawn desktop-bff");

    assert!(
        !output.status.success(),
        "desktop-bff must exit non-zero when SOMA_BFF_TOKEN is blank, got status {:?}",
        output.status
    );
}

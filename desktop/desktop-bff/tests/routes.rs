//! Smoke tests for the BFF route surface.
//!
//! These tests do not start the underlying daemon (they construct
//! `DaemonRuntime` but never `.start()` it). That's deliberate — we
//! cover the **routing / extractor wiring** here: every route in
//! `desktop_bff::routes` returns *some* response over HTTP, with the
//! right status code, against the right shape of request body.
//!
//! Routes that need a live daemon get a 500-with-`{kind: "daemon"}`
//! payload (covered by `ApiError`'s tests); routes that don't (`daemon`,
//! `practice_*`) return a fully-formed 200.
//!
//! Every request here authenticates with `support::TEST_TOKEN` — see
//! `auth.rs` for the tests that specifically cover rejection.

mod support;

use support::{TEST_TOKEN, http_base, spawn_router};

/// `search` is daemon-backed (it scopes results to the caller's own
/// space memberships, which live in the same DB the embedded daemon
/// owns — see `soma_daemon::DaemonHandle::search`). With no daemon
/// running this must dispatch (no 404) and surface the same
/// `{kind: "daemon"}` envelope every other daemon-backed route does —
/// same shape as `spaces_list_returns_daemon_error_when_daemon_idle`
/// below.
#[tokio::test]
async fn search_returns_daemon_error_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body(r#"{"query":"roadmap"}"#)
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
}

/// `daemon_ready` is contracted to be a structured boolean even when the
/// daemon isn't up — when the handle resolves to `Err`, it maps to
/// `false`, not a 500. Mirrors the renderer's "ready light" semantics.
#[tokio::test]
async fn daemon_ready_returns_false_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/daemon_ready", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body, serde_json::Value::Bool(false));
}

/// `practice_list_exercises` is in-process state — no daemon needed.
/// A request with no space id returns the default-empty list.
#[tokio::test]
async fn practice_list_exercises_returns_empty_list() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/practice_list_exercises", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body, serde_json::json!([]));
}

/// A daemon-backed route should return 500 with the `{kind: "daemon"}`
/// error envelope when the daemon isn't running. Confirms the route is
/// wired (no 404) and that `ApiError` maps the failure correctly. We use
/// `spaces_list` because it's the simplest daemon call: an empty body
/// deserializes into the default-valued args struct.
#[tokio::test]
async fn spaces_list_returns_daemon_error_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/spaces_list", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
    assert!(body["message"].is_string(), "expected a daemon error message, got {body}");
}

/// `daemon::status` is contracted to *never* error — it returns a
/// structured `{ reachable: false, ... }` snapshot when the daemon
/// handle isn't ready. This test guards against that contract regressing
/// (any 5xx here would mean the SDK's status card silently breaks).
#[tokio::test]
async fn daemon_status_returns_200_with_unreachable_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/daemon_status", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["reachable"], false);
}

/// Missing route → 404 (not 405 / 500). Guards against typos in the
/// route table by pinning that something that shouldn't exist really
/// doesn't.
#[tokio::test]
async fn unknown_route_returns_404() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/does_not_exist", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 404);
}

/// `GET /api/v1/blobs/{space_id}/{cid}` with no daemon running maps to
/// the same `{kind: "daemon"}` 500 envelope every other daemon-backed
/// route does — the route dispatches correctly (no 404) and surfaces the
/// underlying error instead of panicking.
#[tokio::test]
async fn blobs_get_returns_daemon_error_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .get(format!("{}/api/v1/blobs/space-1/bafy-some-cid", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .send()
        .await
        .expect("get");
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
}

/// The query-token fallback exists specifically for this route (browsers
/// can't attach headers to `<img src>`); confirm it actually works end to
/// end rather than only unit-testing `extract_token` in isolation.
#[tokio::test]
async fn blobs_get_accepts_query_token() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .get(format!(
            "{}/api/v1/blobs/space-1/bafy-some-cid?token={TEST_TOKEN}",
            http_base(h.addr)
        ))
        .send()
        .await
        .expect("get");
    // No daemon running, so this still 500s — the point is that it's a
    // 500 (request accepted, dispatched to the handler) and not a 401
    // (request rejected by auth).
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
}

/// The query-token fallback must not leak to any other route — a POST
/// route must still 401 even if a caller tries to smuggle the token in
/// the query string instead of a header.
#[tokio::test]
async fn query_token_is_not_honored_outside_the_blob_bytes_route() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search?token={TEST_TOKEN}", http_base(h.addr)))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 401);
}

/// `agent_config_get_default` is daemon-backed (the config lives in the
/// same DB the embedded daemon owns) — with no daemon running this must
/// dispatch (no 404) and surface the same `{kind: "daemon"}` envelope
/// every other daemon-backed route does.
#[tokio::test]
async fn agent_config_get_default_returns_daemon_error_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/agent_config_get_default", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
}

/// Same as above for the space-scoped GET, which additionally proves the
/// `{"spaceId": ...}` body shape deserializes correctly (a malformed body
/// would 422 before ever reaching the daemon-unavailable branch).
#[tokio::test]
async fn agent_config_get_space_returns_daemon_error_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/agent_config_get_space", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body(r#"{"spaceId":"space-1"}"#)
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
}

/// `agent_config_validate` needs no daemon at all — it probes the given
/// endpoint directly through the agent runtime's own HTTP client. An
/// unreachable target must come back as a *structured* `ok: false`
/// result (200), never a 500 — the whole point of this endpoint is to
/// let the settings UI show an inline error without a thrown exception.
#[tokio::test]
async fn agent_config_validate_reports_a_structured_failure_for_an_unreachable_endpoint() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/agent_config_validate", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body(r#"{"baseUrl":"http://127.0.0.1:1","requestTimeoutMs":500}"#)
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["ok"], false);
    assert!(body["error"].is_string(), "expected a human-readable reason, got {body}");
}

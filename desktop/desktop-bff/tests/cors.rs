//! CORS layering coverage. Also doubles as coverage that CORS preflight
//! (`OPTIONS`) is answered *without* going through the auth middleware —
//! see `desktop_bff::state::build_router`'s doc comment on layering
//! order for why that matters (a real credentialed preflight never
//! carries `Authorization`, so if it reached auth it would always fail).

mod support;

use support::spawn_router_with;

/// With the default config (empty `allowed_origins`) no CORS layer is
/// installed: cross-origin browsers can't read responses without an
/// explicit allowlist. We assert this by checking that an OPTIONS
/// preflight from a foreign origin gets *no* `Access-Control-Allow-Origin`
/// header back.
#[tokio::test]
async fn default_config_installs_no_cors_layer() {
    let h = spawn_router_with("token", |_| {}).await;

    let resp = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("http://{}/api/v1/daemon_status", h.addr))
        .header("Origin", "https://evil.example.com")
        .header("Access-Control-Request-Method", "POST")
        .send()
        .await
        .expect("preflight");
    assert!(
        !resp.headers().contains_key("access-control-allow-origin"),
        "default config must not echo an Access-Control-Allow-Origin header"
    );
}

/// With explicit `allowed_origins`, the CORS layer is installed with
/// `allow_credentials(true)` and the SDK-style preflight succeeds
/// *without* an `Authorization` header (preflight requests never carry
/// one — the browser sends it separately with the real request).
#[tokio::test]
async fn explicit_allowlist_enables_credentialed_cors() {
    let h = spawn_router_with("token", |cfg| {
        cfg.allowed_origins = vec![axum::http::HeaderValue::from_static("https://soma.example.com")];
    })
    .await;

    // Allowed origin → echoed back, with credentials enabled.
    let resp = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("http://{}/api/v1/daemon_status", h.addr))
        .header("Origin", "https://soma.example.com")
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "content-type")
        .send()
        .await
        .expect("preflight");
    assert_eq!(
        resp.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap()),
        Some("https://soma.example.com")
    );
    assert_eq!(
        resp.headers().get("access-control-allow-credentials").map(|v| v.to_str().unwrap()),
        Some("true")
    );

    // Foreign origin → no allow-origin header echoed.
    let resp = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("http://{}/api/v1/daemon_status", h.addr))
        .header("Origin", "https://evil.example.com")
        .header("Access-Control-Request-Method", "POST")
        .send()
        .await
        .expect("preflight foreign");
    assert!(
        resp.headers().get("access-control-allow-origin").is_none(),
        "foreign origin should not be echoed"
    );
}

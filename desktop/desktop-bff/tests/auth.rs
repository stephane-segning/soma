//! End-to-end coverage of the bearer-token auth middleware. Unit-level
//! coverage of the extraction/comparison logic itself lives in
//! `desktop_bff::auth`'s own `#[cfg(test)]` module; these tests confirm
//! the middleware is actually wired into the router and applies
//! uniformly, over real HTTP requests.

mod support;

use support::{TEST_TOKEN, http_base, spawn_router};

#[tokio::test]
async fn missing_authorization_header_is_rejected() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 401);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "unauthenticated");
}

#[tokio::test]
async fn blank_bearer_token_is_rejected() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .header("Authorization", "Bearer ")
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn wrong_bearer_token_is_rejected() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .bearer_auth("not-the-configured-token")
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn non_bearer_authorization_scheme_is_rejected() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .header("Authorization", format!("Basic {TEST_TOKEN}"))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn correct_bearer_token_is_accepted() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .bearer_auth(TEST_TOKEN)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200, "correct token must not be rejected");
}

/// A token configured with different content should never authenticate —
/// this is the end-to-end version of `desktop_bff::auth`'s
/// `constant_time_eq` unit tests, confirming the *wiring* isn't
/// accidentally comparing something looser (e.g. a prefix match).
#[tokio::test]
async fn token_that_is_a_prefix_of_the_real_token_is_rejected() {
    let h = spawn_router().await;
    let prefix = &TEST_TOKEN[..TEST_TOKEN.len() - 1];
    let resp = reqwest::Client::new()
        .post(format!("{}/api/v1/search", http_base(h.addr)))
        .bearer_auth(prefix)
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 401);
}

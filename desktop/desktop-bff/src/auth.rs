//! Bearer-token authentication middleware.
//!
//! Threat model: `desktop-bff` fronts a single user's own peer identity,
//! reachable remotely (browser, phone) over the network. There is no user
//! database and no OAuth — a single bearer token, issued out-of-band
//! (`SOMA_BFF_TOKEN`, see `main.rs`), gates every route. Anyone who
//! presents the correct token gets everything the local user could do
//! from the Tauri shell; there is no role/permission split to enforce
//! (hence no `Forbidden`/403 variant — only "authenticated or not").
//!
//! Coverage: this middleware wraps the *entire* router (mounted as the
//! outermost non-CORS layer in `state::build_router`), including the
//! WebSocket upgrade route. A browser's native `WebSocket` cannot set the
//! `Authorization` header on the handshake request, so the token may
//! arrive by either of two channels:
//!
//! 1. `Authorization: Bearer <token>` — every REST route, and any
//!    WebSocket client capable of setting headers on the upgrade request
//!    (native apps, server-to-server, `wscat -H`, Node's `ws`).
//! 2. `Sec-WebSocket-Protocol: bearer, <token>` — for browser
//!    `new WebSocket(url, ["bearer", token])` calls, which *can* set
//!    subprotocols. The server echoes back `bearer` alone (see
//!    `ws::events_ws`) to complete negotiation per RFC 6455.
//!
//! A third, narrowly-scoped channel exists only for `GET
//! /api/v1/blobs/{space_id}/{cid}`: a `?token=` query parameter, because
//! `<img src>` and other browser-native resource loads cannot attach
//! headers either. This is the one deliberate exception to "never put a
//! credential in a URL" in this codebase — see the route's own doc
//! comment for the full trade-off.
//!
//! The configured token must consist of HTTP-token-safe characters
//! (alphanumeric, `-`, `_`, `.`, `~`) if the `Sec-WebSocket-Protocol`
//! channel is to work — `Sec-WebSocket-Protocol` values follow HTTP's
//! `token` grammar, which excludes `/`, `+`, `=`, spaces, and commas.
//! Random hex or base64url-without-padding both satisfy this.
//!
//! Rejection is uniform: a missing or wrong token gets a plain 401 with
//! the standard `{"kind":"unauthenticated","message":"..."}` body,
//! produced *before* any handler (including the WebSocket upgrade) runs.
//! CORS preflight (`OPTIONS`) never reaches this middleware — it's
//! answered by `tower_http::cors::CorsLayer`, which sits outside this
//! layer in the stack and short-circuits preflight requests itself.

use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{Method, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use desktop_core::error::DesktopError;
use sha2::{Digest, Sha256};

use crate::error::ApiError;

/// Client-offered WebSocket subprotocol marker preceding the token. See
/// the module doc's channel (2). Public within the crate so `ws::events_ws`
/// can echo it back to complete subprotocol negotiation.
pub(crate) const WS_AUTH_SUBPROTOCOL: &str = "bearer";

/// Resolved once at boot from `BffConfig::auth_token` and shared by every
/// request via `State`. Cheap to clone (both fields are `Arc<str>`).
#[derive(Clone)]
pub struct AuthState {
    token: Arc<str>,
    /// `sha256(token)` hex, precomputed once so the per-request cost is a
    /// refcount bump rather than a hash. Used to namespace upload staging
    /// per authenticated caller (see `desktop-api::blobs::stage_upload`'s
    /// `upload_scope`) without ever putting the raw token on disk.
    session_scope: Arc<str>,
}

impl AuthState {
    pub fn new(token: impl AsRef<str>) -> Self {
        let token = token.as_ref();
        let digest = Sha256::digest(token.as_bytes());
        Self {
            token: Arc::from(token),
            session_scope: Arc::from(hex_lower(&digest)),
        }
    }
}

/// Inserted into request extensions once auth succeeds. Downstream
/// handlers (currently just the blob-staging routes) read it instead of
/// re-deriving anything from the token.
#[derive(Clone)]
pub struct AuthContext {
    pub session_scope: Arc<str>,
}

/// axum middleware (`middleware::from_fn_with_state`) — see the module
/// doc for the full design. Fails closed: any code path that can't prove
/// the token matches falls through to [`unauthenticated`].
pub async fn require_bearer_token(State(auth): State<AuthState>, mut req: Request<Body>, next: Next) -> Response {
    let allow_query_token = is_blob_bytes_get(&req);
    let query = req.uri().query().filter(|_| allow_query_token);
    let Some(presented) = extract_token(req.headers(), query) else {
        return unauthenticated();
    };

    if !constant_time_eq(presented.as_bytes(), auth.token.as_bytes()) {
        return unauthenticated();
    }

    req.extensions_mut().insert(AuthContext {
        session_scope: Arc::clone(&auth.session_scope),
    });
    next.run(req).await
}

/// Only `GET /api/v1/blobs/{space_id}/{cid}` accepts a query-string token
/// — see the route's own doc comment in `routes/blobs.rs` for why. Every
/// other route (including the other blob routes, which are all `POST`)
/// only accepts the header-based channels.
fn is_blob_bytes_get(req: &Request<Body>) -> bool {
    req.method() == Method::GET && req.uri().path().starts_with("/api/v1/blobs/")
}

fn extract_token(headers: &axum::http::HeaderMap, query: Option<&str>) -> Option<String> {
    if let Some(token) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|t| !t.is_empty())
    {
        return Some(token.to_string());
    }

    if let Some(token) = headers
        .get(header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            let mut offered = v.split(',').map(str::trim);
            if offered.next() != Some(WS_AUTH_SUBPROTOCOL) {
                return None;
            }
            offered.next()
        })
        .filter(|t| !t.is_empty())
    {
        return Some(token.to_string());
    }

    if let Some(query) = query {
        for pair in query.split('&') {
            let mut kv = pair.splitn(2, '=');
            if kv.next() == Some("token")
                && let Some(token) = kv.next().filter(|t| !t.is_empty())
            {
                return Some(token.to_string());
            }
        }
    }

    None
}

fn unauthenticated() -> Response {
    ApiError(DesktopError::Unauthenticated {
        message: "missing or invalid bearer token".into(),
    })
    .into_response()
}

/// Constant-time comparison so token verification doesn't leak timing
/// information proportional to how many leading bytes matched. The
/// early-return on length mismatch is not itself a secret-dependent
/// branch — the token's *length* isn't sensitive, only its content is.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn hex_lower(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::with_capacity(bytes.len() * 2), |mut acc, b| {
        let _ = write!(acc, "{b:02x}");
        acc
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn constant_time_eq_matches_equal_slices() {
        assert!(constant_time_eq(b"abc123", b"abc123"));
    }

    #[test]
    fn constant_time_eq_rejects_different_content() {
        assert!(!constant_time_eq(b"abc123", b"abc124"));
    }

    #[test]
    fn constant_time_eq_rejects_different_length() {
        assert!(!constant_time_eq(b"short", b"much longer value"));
    }

    #[test]
    fn extract_token_reads_authorization_header() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer sekret"));
        assert_eq!(extract_token(&headers, None), Some("sekret".to_string()));
    }

    #[test]
    fn extract_token_rejects_non_bearer_authorization() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Basic dXNlcjpwYXNz"));
        assert_eq!(extract_token(&headers, None), None);
    }

    #[test]
    fn extract_token_reads_websocket_subprotocol() {
        let mut headers = HeaderMap::new();
        headers.insert(header::SEC_WEBSOCKET_PROTOCOL, HeaderValue::from_static("bearer, sekret"));
        assert_eq!(extract_token(&headers, None), Some("sekret".to_string()));
    }

    #[test]
    fn extract_token_ignores_subprotocol_without_bearer_marker() {
        let mut headers = HeaderMap::new();
        headers.insert(header::SEC_WEBSOCKET_PROTOCOL, HeaderValue::from_static("graphql-ws"));
        assert_eq!(extract_token(&headers, None), None);
    }

    #[test]
    fn extract_token_reads_query_only_when_offered() {
        let headers = HeaderMap::new();
        assert_eq!(extract_token(&headers, Some("token=sekret")), Some("sekret".to_string()));
        assert_eq!(extract_token(&headers, None), None, "query must not be consulted when not offered");
    }

    #[test]
    fn extract_token_prefers_header_over_query() {
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer from-header"));
        assert_eq!(
            extract_token(&headers, Some("token=from-query")),
            Some("from-header".to_string())
        );
    }

    #[test]
    fn session_scope_is_stable_for_the_same_token() {
        let a = AuthState::new("sekret");
        let b = AuthState::new("sekret");
        assert_eq!(a.session_scope, b.session_scope);
    }

    #[test]
    fn session_scope_differs_for_different_tokens() {
        let a = AuthState::new("sekret-one");
        let b = AuthState::new("sekret-two");
        assert_ne!(a.session_scope, b.session_scope);
    }

    #[test]
    fn session_scope_never_contains_the_raw_token() {
        let auth = AuthState::new("super-secret-value");
        assert!(!auth.session_scope.contains("super-secret-value"));
    }
}

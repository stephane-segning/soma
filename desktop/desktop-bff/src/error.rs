//! Map `desktop_core::error::DesktopError` to an axum HTTP response.
//!
//! The body shape matches `desktop-sdk/src/errors.ts`'s `BackendError`
//! parser: `{ "kind": "...", "message": "..." }`. `DesktopError` already
//! serializes that way (it's tagged on `kind` with kebab-case rename), so
//! the response body is just the error itself.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use desktop_core::error::DesktopError;

/// Newtype wrapper so `?` from `desktop_api::*` handlers can convert into
/// an axum-friendly error without `From<DesktopError> for Response` (which
/// the orphan rules wouldn't allow anyway).
#[derive(Debug)]
pub struct ApiError(pub DesktopError);

impl From<DesktopError> for ApiError {
    fn from(err: DesktopError) -> Self {
        ApiError(err)
    }
}

impl ApiError {
    /// HTTP status code matching the `DesktopError` variant. Mirrors the
    /// kinds the SDK distinguishes in `desktop-sdk/src/errors.ts`.
    pub fn status(&self) -> StatusCode {
        match self.0 {
            DesktopError::InvalidInput { .. } => StatusCode::BAD_REQUEST,
            DesktopError::NotFound { .. } => StatusCode::NOT_FOUND,
            DesktopError::Io { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            DesktopError::Daemon { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            DesktopError::Agent { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            DesktopError::Other { .. } => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        // `DesktopError` serializes with `#[serde(tag = "kind", rename_all
        // = "kebab-case")]` already → `{ "kind": "daemon", "message": "..." }`
        // which is exactly what the SDK's `toBackendError` expects.
        (status, Json(self.0)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_codes_match_sdk_error_kinds() {
        // The SDK distinguishes `not-found` (404) and `invalid-input` (400);
        // every other variant collapses to 500 so the renderer treats them
        // uniformly.
        assert_eq!(
            ApiError(DesktopError::NotFound {
                message: "x".into()
            })
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            ApiError(DesktopError::InvalidInput {
                message: "x".into()
            })
            .status(),
            StatusCode::BAD_REQUEST
        );
        for err in [
            DesktopError::Io { message: "x".into() },
            DesktopError::Daemon { message: "x".into() },
            DesktopError::Agent { message: "x".into() },
            DesktopError::Other { message: "x".into() },
        ] {
            assert_eq!(ApiError(err).status(), StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    #[test]
    fn serializes_to_backend_error_shape() {
        // The SDK's `toBackendError` reads `{ kind, message }`. Confirm the
        // wire JSON matches.
        let err = DesktopError::Daemon {
            message: "boom".into(),
        };
        let v: serde_json::Value = serde_json::to_value(&err).expect("serialize");
        assert_eq!(v["kind"], "daemon");
        assert_eq!(v["message"], "boom");
    }
}

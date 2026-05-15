use axum::{Json, http::StatusCode};

pub(super) fn authorize(
    expected: &Option<String>,
    supplied: Option<String>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if let Some(expected) = expected {
        if supplied.as_deref().unwrap_or_default() != expected {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "unauthorized"})),
            ));
        }
    }
    Ok(())
}

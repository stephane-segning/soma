use axum::{Json, http::HeaderMap, http::StatusCode};

pub(super) fn authorize(
    expected: &Option<String>,
    supplied: Option<String>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if let Some(expected) = expected
        && supplied.as_deref().unwrap_or_default() != expected
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "unauthorized"})),
        ));
    }
    Ok(())
}

/// Extract the bearer token from an `Authorization: Bearer <token>`
/// header. `None` if the header is absent, malformed, uses a different
/// scheme, or isn't valid UTF-8.
///
/// Every admin route reads the caller-supplied token this way now,
/// instead of from a JSON body field or query parameter. A token in a
/// request body or URL query string routinely ends up somewhere it
/// shouldn't — access logs, proxy logs, browser history, referrer
/// headers — none of which strip the `Authorization` header by default,
/// which is precisely why it's the conventional place for a bearer
/// credential.
pub(super) fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    value.strip_prefix("Bearer ").map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with_auth(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            value.parse().expect("header value"),
        );
        headers
    }

    #[test]
    fn extracts_a_well_formed_bearer_token() {
        let headers = headers_with_auth("Bearer secret-token");
        assert_eq!(bearer_token(&headers), Some("secret-token".to_string()));
    }

    #[test]
    fn missing_header_yields_none() {
        assert_eq!(bearer_token(&HeaderMap::new()), None);
    }

    #[test]
    fn wrong_scheme_yields_none() {
        let headers = headers_with_auth("Basic dXNlcjpwYXNz");
        assert_eq!(bearer_token(&headers), None);
    }

    #[test]
    fn authorize_still_rejects_a_missing_header_token_when_a_token_is_configured() {
        let expected = Some("secret".to_string());
        assert!(authorize(&expected, bearer_token(&HeaderMap::new())).is_err());
    }

    #[test]
    fn authorize_accepts_the_matching_header_token() {
        let expected = Some("secret".to_string());
        let headers = headers_with_auth("Bearer secret");
        assert!(authorize(&expected, bearer_token(&headers)).is_ok());
    }
}

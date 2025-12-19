use std::{path::PathBuf, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use serde::Serialize;

use crate::{config::Mode, metrics::BotMetrics};

#[derive(Debug, Clone, Serialize)]
pub struct BotInfo {
    pub peer_id: String,
    pub blob_dir: PathBuf,
}

#[derive(Clone)]
pub struct BotState {
    pub info: BotInfo,
    pub metrics: BotMetrics,
}

pub async fn serve_http(
    http_addr: std::net::SocketAddr,
    mode: Mode,
    admin_token: Option<String>,
    state: BotState,
) -> soma_core::SomaResult<()> {
    let shared = Arc::new(state);

    let registry = shared.metrics.registry.clone();

    let mut app = Router::new()
        .route("/info", get(info_handler))
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/metrics",
            get(move || {
                let registry = registry.clone();
                async move {
                    let mut buffer = String::new();
                    prometheus_client::encoding::text::encode(&mut buffer, &registry)
                        .expect("encode metrics");
                    buffer
                }
            }),
        );

    if mode == Mode::ServerDaemon {
        let token = admin_token.clone();
        app = app.route(
            "/v1/join",
            post(move |state: State<Arc<BotState>>, body| join_handler(state, body, token.clone())),
        );
    }

    let app = app.with_state(shared);

    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn info_handler(State(state): State<Arc<BotState>>) -> Json<BotInfo> {
    Json(state.info.clone())
}

async fn join_handler(
    _state: State<Arc<BotState>>,
    payload: Json<serde_json::Value>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if let Some(expected) = admin_token {
        let supplied = payload
            .get("admin_token")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if supplied != expected {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "unauthorized"})),
            ));
        }
    }

    Err((
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "error": "join decisions must be handled by the peer join decider; HTTP admin surface is not yet wired"
        })),
    ))
}

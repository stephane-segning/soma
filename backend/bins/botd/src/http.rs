use std::{path::PathBuf, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use libp2p::PeerId;
use libp2p::identity::Keypair;
use serde::Serialize;
use soma_peer::PeerCommand;
use soma_storage::RepositoryFactory;
use tokio::sync::mpsc;

use crate::{config::Mode, metrics::BotMetrics};

mod auth;
mod issuers;
mod join_decisions;
mod join_request_list;
mod join_requests;
mod memberships;
mod spaces;

type JsonResult = Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>;

#[derive(Debug, Clone, Serialize)]
pub struct BotInfo {
    pub peer_id: String,
    pub blob_dir: PathBuf,
}

#[derive(Clone)]
pub struct BotState {
    pub info: BotInfo,
    pub peer_id: PeerId,
    pub metrics: BotMetrics,
    pub repos: RepositoryFactory,
    pub signer: Keypair,
    pub peer_commands: mpsc::Sender<PeerCommand>,
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

    if mode == Mode::Admin {
        app = admin_routes(app, admin_token);
    }

    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app.with_state(shared)).await?;
    Ok(())
}

fn admin_routes(
    mut app: Router<Arc<BotState>>,
    admin_token: Option<String>,
) -> Router<Arc<BotState>> {
    let token_join_request = admin_token.clone();
    let token_create_space = admin_token.clone();
    let token_list_spaces = admin_token.clone();
    let token_issue_issuer = admin_token.clone();
    let token_import_issuer = admin_token.clone();
    let token_requests = admin_token.clone();
    let token_decide = admin_token.clone();
    let token_members = admin_token.clone();
    let token_my_memberships = admin_token;

    app = app
        .route(
            "/v1/join/request",
            post(move |state: State<Arc<BotState>>, body| {
                join_requests::submit_handler(state, body, token_join_request.clone())
            }),
        )
        .route(
            "/v1/spaces",
            post(move |state: State<Arc<BotState>>, body| {
                spaces::create_handler(state, body, token_create_space.clone())
            }),
        )
        .route(
            "/v1/spaces",
            get(move |state: State<Arc<BotState>>, query| {
                spaces::list_handler(state, query, token_list_spaces.clone())
            }),
        )
        .route(
            "/v1/spaces/issuer-capability/issue",
            post(move |state: State<Arc<BotState>>, body| {
                issuers::issue_handler(state, body, token_issue_issuer.clone())
            }),
        )
        .route(
            "/v1/spaces/issuer-capability/import",
            post(move |state: State<Arc<BotState>>, body| {
                issuers::import_handler(state, body, token_import_issuer.clone())
            }),
        )
        .route(
            "/v1/join/requests",
            get(move |state: State<Arc<BotState>>, query| {
                join_request_list::list_handler(state, query, token_requests.clone())
            }),
        )
        .route(
            "/v1/join/decide",
            post(move |state: State<Arc<BotState>>, body| {
                join_decisions::decide_handler(state, body, token_decide.clone())
            }),
        )
        .route(
            "/v1/space/members",
            get(move |state: State<Arc<BotState>>, query| {
                memberships::list_space_members_handler(state, query, token_members.clone())
            }),
        )
        .route(
            "/v1/memberships",
            get(move |state: State<Arc<BotState>>, query| {
                memberships::list_my_memberships_handler(state, query, token_my_memberships.clone())
            }),
        );

    app
}

async fn info_handler(State(state): State<Arc<BotState>>) -> Json<BotInfo> {
    Json(state.info.clone())
}

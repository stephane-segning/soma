use std::sync::Arc;

use tauri::{
    AppHandle, Builder, Manager, UriSchemeContext, Wry,
    http::{self, HeaderValue},
};
use tracing::{debug, warn};

use crate::{daemon::BlobSource, state::ManagedState};
use crate::error::AppResult;

pub trait ProtocolRegistrar: Send + Sync {
    fn attach(self: Arc<Self>, builder: Builder<Wry>) -> Builder<Wry>;
}

#[derive(Default)]
pub struct BlobProtocol;

impl BlobProtocol {
    pub fn new() -> Self {
        Self
    }

    fn handle_request(
        &self,
        app: &AppHandle<Wry>,
        request: &http::Request<Vec<u8>>,
    ) -> http::Response<Vec<u8>> {
        let response = self
            .try_handle_request(app, request)
            .unwrap_or_else(|error| {
                warn!("blob protocol handler error: {error:?}");
                http::Response::builder()
                    .status(http::StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .unwrap_or_else(|_| http::Response::new(Vec::new()))
            });

        response
    }

    fn try_handle_request(
        &self,
        app: &AppHandle<Wry>,
        request: &http::Request<Vec<u8>>,
    ) -> AppResult<http::Response<Vec<u8>>> {
        let uri = request.uri();

        let authority = uri
            .authority()
            .map(|a| a.as_str().to_string())
            .unwrap_or_default()
            .to_owned();
        if authority != "daemon" {
            return Ok(not_found());
        }

        let mut parts = uri.path().trim_start_matches('/').split('/');
        let space_id = parts.next().unwrap_or_default();
        let cid = parts.next().unwrap_or_default();
        if space_id.is_empty() || cid.is_empty() {
            return Ok(not_found());
        }

        // TODO this cannot happen, because `state() called before manage() for soma_app_lib::state::ManagedState`
        let state = app.state::<ManagedState>();
        let Some(bytes) = state
            .daemon
            .read_blob(space_id, cid)
            .map_err(|err| anyhow::anyhow!(err))?
        else {
            debug!("blob {cid} not found for space {space_id}");
            return Ok(not_found());
        };

        let content_type = HeaderValue::from_static(mime::APPLICATION_OCTET_STREAM.essence_str());
        let response = http::Response::builder()
            .status(http::StatusCode::OK)
            .header(http::header::CONTENT_TYPE, content_type)
            .body(bytes)
            .unwrap();

        Ok(response)
    }
}

impl ProtocolRegistrar for BlobProtocol {
    fn attach(self: Arc<Self>, builder: Builder<Wry>) -> Builder<Wry> {
        let handler = Arc::clone(&self);
        builder.register_uri_scheme_protocol(
            "soma-blob",
            move |ctx: UriSchemeContext<'_, Wry>, request| {
                handler.handle_request(ctx.app_handle(), &request)
            },
        )
    }
}

fn not_found() -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(http::StatusCode::NOT_FOUND)
        .body(Vec::new())
        .unwrap()
}

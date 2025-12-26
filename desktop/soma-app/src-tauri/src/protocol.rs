use std::sync::{Arc, OnceLock};

use anyhow::{Context, Result};
use tauri::{AppHandle, Builder, UriSchemeContext, Wry, http};
use tracing::{debug, warn};

use crate::paths::{AppPaths, ensure_app_paths};

pub trait ProtocolRegistrar: Send + Sync {
    fn attach(self: Arc<Self>, builder: Builder<Wry>) -> Builder<Wry>;
}

#[derive(Default)]
pub struct BlobProtocol {
    paths: OnceLock<AppPaths>,
}

impl BlobProtocol {
    pub fn new() -> Self {
        Self {
            paths: OnceLock::new(),
        }
    }

    fn ensure_paths(&self, app: &AppHandle<Wry>) -> Result<AppPaths> {
        ensure_app_paths(&self.paths, app)
    }

    fn handle_request(
        &self,
        app: &AppHandle<Wry>,
        request: &http::Request<Vec<u8>>,
    ) -> http::Response<Vec<u8>> {
        let response = match self.try_handle_request(app, request) {
            Ok(response) => response,
            Err(error) => {
                warn!("blob protocol handler error: {error:?}");
                http::Response::builder()
                    .status(http::StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .unwrap_or_else(|_| http::Response::new(Vec::new()))
            }
        };
        response
    }

    fn try_handle_request(
        &self,
        app: &AppHandle<Wry>,
        request: &http::Request<Vec<u8>>,
    ) -> Result<http::Response<Vec<u8>>> {
        let paths = self.ensure_paths(app)?;
        let uri = request.uri();

        let authority = uri
            .authority()
            .map(|a| a.as_str().to_string())
            .unwrap_or_default()
            .to_owned();
        if authority != "local" {
            return Ok(http::Response::builder()
                .status(http::StatusCode::NOT_FOUND)
                .body(Vec::new())
                .unwrap());
        }

        let blob_id = uri.path().trim_start_matches('/');
        if blob_id.is_empty() {
            return Ok(http::Response::builder()
                .status(http::StatusCode::NOT_FOUND)
                .body(Vec::new())
                .unwrap());
        }

        let blob_path = paths.staged_blob_dir().join(blob_id);
        debug!("serving staged blob from {:?}", blob_path);
        let bytes = std::fs::read(&blob_path)
            .with_context(|| format!("failed to read staged blob {:?}", blob_path))?;

        let response = http::Response::builder()
            .status(http::StatusCode::OK)
            .header(
                http::header::CONTENT_TYPE,
                mime::APPLICATION_OCTET_STREAM.essence_str(),
            )
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

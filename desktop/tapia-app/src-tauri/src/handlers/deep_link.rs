use serde::Serialize;
use tauri::{AppHandle, Emitter, Wry};
use tracing::{info, warn};
use url::Url;

pub const EXERCISE_EVENT: &str = "tapia://exercise";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkExercise {
    pub host: String,
    pub exercise_id: String,
    pub raw: String,
}

pub struct DeepLinkController;

impl DeepLinkController {
    pub fn emit_from_urls(app: &AppHandle<Wry>, urls: &[Url]) -> tauri::Result<()> {
        for url in urls {
            if let Some(payload) = parse_exercise_url(url.clone()) {
                info!(
                    host = payload.host,
                    exercise_id = payload.exercise_id,
                    "received tapia:// exercise link"
                );
                app.emit(EXERCISE_EVENT, payload)?;
            }
        }
        Ok(())
    }
}

fn parse_exercise_url(url: Url) -> Option<DeepLinkExercise> {
    if url.scheme() != "tapia" {
        return None;
    }

    let host = url.host_str()?.to_string();
    let segments = url
        .path_segments()
        .map(|segments| segments.filter(|s| !s.is_empty()));
    let Some(mut parts) = segments else {
        warn!("tapia:// url missing path segments: {url}");
        return None;
    };
    let Some(exercise_id) = parts.next() else {
        warn!("tapia:// url missing exercise id: {url}");
        return None;
    };

    Some(DeepLinkExercise {
        host,
        exercise_id: exercise_id.to_string(),
        raw: url.to_string(),
    })
}

use soma_proto_build::agent;

use crate::engine::ModelInfo;

pub(super) fn map_model_info(model: ModelInfo) -> agent::ModelInfo {
    agent::ModelInfo {
        name: model.name,
        kind: agent::ModelKind::Unspecified as i32,
        path: model.path,
        loaded: model.loaded,
        size_bytes: model.size_bytes.unwrap_or_default(),
    }
}

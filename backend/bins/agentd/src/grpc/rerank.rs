use soma_proto_build::agent;
use tonic::{Request, Response, Status};

pub(super) async fn rerank(
    _service: &super::AgentdService,
    _request: Request<agent::RerankRequest>,
) -> Result<Response<agent::RerankResponse>, Status> {
    Err(super::chat::model_rpcs_disabled())
}

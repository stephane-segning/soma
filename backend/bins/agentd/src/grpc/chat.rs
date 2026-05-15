use std::pin::Pin;

use futures::Stream;
use soma_proto_build::agent;
use tonic::{Request, Response, Status};

pub(super) const MODEL_RPCS_DISABLED_MESSAGE: &str =
    "soma-agentd no longer provides model-backed RPCs; use an explicit model provider instead";

pub(super) async fn inline_complete(
    _service: &super::AgentdService,
    _request: Request<agent::InlineCompleteRequest>,
) -> Result<Response<agent::InlineCompleteResponse>, Status> {
    Err(model_rpcs_disabled())
}

pub(super) async fn chat(
    _service: &super::AgentdService,
    _request: Request<agent::ChatRequest>,
) -> Result<Response<agent::ChatResponse>, Status> {
    Err(model_rpcs_disabled())
}

pub(super) async fn chat_stream(
    _service: &super::AgentdService,
    _request: Request<agent::ChatRequest>,
) -> Result<
    Response<Pin<Box<dyn Stream<Item = Result<agent::ChatStreamEvent, Status>> + Send + 'static>>>,
    Status,
> {
    Err(model_rpcs_disabled())
}

pub(super) async fn embed(
    _service: &super::AgentdService,
    _request: Request<agent::EmbedRequest>,
) -> Result<Response<agent::EmbedResponse>, Status> {
    Err(model_rpcs_disabled())
}

pub(super) fn model_rpcs_disabled() -> Status {
    Status::unimplemented(MODEL_RPCS_DISABLED_MESSAGE)
}

use soma_proto_build::agent;
use tonic::{Request, Response, Status};

use super::{
    chat::MODEL_RPCS_DISABLED_MESSAGE,
    mappings::{map_background_task_record, proto_kind_to_store},
    AgentdService,
};

pub(super) async fn enqueue_background_task(
    service: &AgentdService,
    request: Request<agent::EnqueueBackgroundTaskRequest>,
) -> Result<Response<agent::EnqueueBackgroundTaskResponse>, Status> {
    let payload = request.into_inner();
    validate_enqueue_payload(&payload)?;
    let kind = proto_kind_to_store(payload.kind)
        .ok_or_else(|| Status::invalid_argument("invalid background task kind"))?;
    let record = service
        .state
        .task_store
        .enqueue(
            kind,
            payload.space_id.trim(),
            payload.document_id.trim(),
            payload.selection_text.trim(),
            payload.persist_in_document,
        )
        .await
        .map_err(|err| Status::internal(err.to_string()))?;
    let record = service
        .state
        .task_store
        .mark_failed_record(record, MODEL_RPCS_DISABLED_MESSAGE)
        .await
        .map_err(|err| Status::internal(err.to_string()))?;

    Ok(Response::new(agent::EnqueueBackgroundTaskResponse {
        task: Some(map_background_task_record(record)),
    }))
}

pub(super) async fn list_background_tasks(
    service: &AgentdService,
    request: Request<agent::ListBackgroundTasksRequest>,
) -> Result<Response<agent::ListBackgroundTasksResponse>, Status> {
    let payload = request.into_inner();
    let trimmed_space_id = payload.space_id.trim();
    let space_id = if trimmed_space_id.is_empty() {
        None
    } else {
        Some(trimmed_space_id)
    };
    let limit = if payload.limit == 0 { 50 } else { payload.limit };
    let tasks = service
        .state
        .task_store
        .list(space_id, limit)
        .await
        .map_err(|err| Status::internal(err.to_string()))?;

    Ok(Response::new(agent::ListBackgroundTasksResponse {
        tasks: tasks.into_iter().map(map_background_task_record).collect(),
    }))
}

fn validate_enqueue_payload(payload: &agent::EnqueueBackgroundTaskRequest) -> Result<(), Status> {
    if payload.space_id.trim().is_empty() {
        return Err(Status::invalid_argument("space_id is required"));
    }
    if payload.document_id.trim().is_empty() {
        return Err(Status::invalid_argument("document_id is required"));
    }
    if payload.selection_text.trim().is_empty() {
        return Err(Status::invalid_argument("selection_text is required"));
    }
    Ok(())
}

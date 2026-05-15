use soma_proto_build::agent;
use tonic::{Request, Response, Status};
use tracing::warn;

use crate::{
    engine::{ChatMessage, ChatRequest, EngineHandle},
    tasks::{BackgroundTaskKind as StoreBackgroundTaskKind, BackgroundTaskRecord, BackgroundTaskStore},
};

use super::{
    chat::optional_model,
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

    spawn_background_worker(service, record.clone(), optional_model(&payload.model));

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

fn spawn_background_worker(
    service: &AgentdService,
    task: BackgroundTaskRecord,
    model: Option<String>,
) {
    let task_store = service.state.task_store.clone();
    let engine = service.state.engine.clone();
    tokio::spawn(async move {
        run_background_task(engine, task_store, task, model).await;
    });
}

async fn run_background_task(
    engine: EngineHandle,
    task_store: BackgroundTaskStore,
    task: BackgroundTaskRecord,
    model: Option<String>,
) {
    if let Err(err) = task_store.mark_running(&task.task_id).await {
        warn!(
            task_id = %task.task_id,
            error = %err,
            "failed to mark background task as running"
        );
    }

    let messages =
        build_background_messages(task.kind, &task.selection_text, task.persist_in_document);
    let result = engine
        .chat(ChatRequest {
            model,
            messages,
            temperature: 0.2,
            max_tokens: 1_200,
        })
        .await;

    match result {
        Ok(content) => {
            if let Err(err) = task_store.mark_succeeded(&task.task_id, content.trim()).await {
                warn!(
                    task_id = %task.task_id,
                    error = %err,
                    "failed to mark background task as succeeded"
                );
            }
        }
        Err(err) => {
            if let Err(store_err) = task_store.mark_failed(&task.task_id, &err.to_string()).await {
                warn!(
                    task_id = %task.task_id,
                    error = %store_err,
                    "failed to mark background task as failed"
                );
            }
        }
    }
}

fn build_background_messages(
    kind: StoreBackgroundTaskKind,
    selection_text: &str,
    persist_in_document: bool,
) -> Vec<ChatMessage> {
    let instruction = match kind {
        StoreBackgroundTaskKind::ExplainSelection => {
            "Explain the selected text clearly for a teammate. Be concise and practical."
        }
        StoreBackgroundTaskKind::ExpandSelection if persist_in_document => {
            "Expand the selected text into richer content that can be inserted directly into the document. Return only the expanded text."
        }
        StoreBackgroundTaskKind::ExpandSelection => {
            "Expand the selected text with more detail and context."
        }
        StoreBackgroundTaskKind::ResearchSelection => {
            "Research the selected topic. Use search tools if available in your runtime. Return a concise summary plus bullet points and sources when possible."
        }
    };

    vec![
        ChatMessage {
            role: "system".to_string(),
            content: instruction.to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: selection_text.to_string(),
        },
    ]
}

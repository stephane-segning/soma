use std::{cmp::Ordering, pin::Pin, sync::Arc};

use futures::Stream;
use soma_proto_build::agent;
use tokio_stream::{StreamExt as TokioStreamExt, wrappers::UnboundedReceiverStream};
use tonic::{Request, Response, Status};
use tracing::warn;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update, updates::decoder::Decode};

use crate::engine::{
    ChatMessage, ChatRequest, EmbedRequest, EngineChatStreamEvent, EngineHandle, EngineStatus,
    ModelKind,
};
use crate::tasks::{
    BackgroundTaskKind as StoreBackgroundTaskKind, BackgroundTaskRecord,
    BackgroundTaskStatus as StoreBackgroundTaskStatus, BackgroundTaskStore,
};

#[derive(Debug)]
pub struct AgentdState {
    pub engine: EngineHandle,
    pub task_store: BackgroundTaskStore,
}

#[derive(Clone)]
pub struct AgentdService {
    pub state: Arc<AgentdState>,
}

impl AgentdService {
    pub fn new(engine: EngineHandle, task_store: BackgroundTaskStore) -> Self {
        Self {
            state: Arc::new(AgentdState { engine, task_store }),
        }
    }

    async fn status_inner(&self) -> Result<EngineStatus, Status> {
        self.state
            .engine
            .status()
            .await
            .map_err(|err| Status::internal(err.to_string()))
    }
}

#[tonic::async_trait]
impl agent::agent_server::Agent for AgentdService {
    async fn status(
        &self,
        _request: Request<()>,
    ) -> Result<Response<agent::StatusResponse>, Status> {
        let status = self.status_inner().await?;
        let models = status.models.into_iter().map(map_model_info).collect();

        Ok(Response::new(agent::StatusResponse {
            version: status.version,
            default_chat_model: status.default_chat_model,
            default_embed_model: status.default_embed_model,
            models,
        }))
    }

    async fn list_models(
        &self,
        _request: Request<()>,
    ) -> Result<Response<agent::ListModelsResponse>, Status> {
        let status = self.status_inner().await?;
        let models = status.models.into_iter().map(map_model_info).collect();
        Ok(Response::new(agent::ListModelsResponse { models }))
    }

    async fn inline_complete(
        &self,
        request: Request<agent::InlineCompleteRequest>,
    ) -> Result<Response<agent::InlineCompleteResponse>, Status> {
        let payload = request.into_inner();
        let prompt = payload.prompt.trim();
        if prompt.is_empty() {
            return Ok(Response::new(agent::InlineCompleteResponse {
                completion: String::new(),
                model: payload.model,
            }));
        }

        let mut messages = Vec::new();
        if !payload.context.trim().is_empty() {
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: payload.context,
            });
        }
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        });

        let model = if payload.model.trim().is_empty() {
            None
        } else {
            Some(payload.model.clone())
        };

        let completion = self
            .state
            .engine
            .chat(ChatRequest {
                model: model.clone(),
                messages,
                temperature: 0.7,
                max_tokens: 256,
            })
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        Ok(Response::new(agent::InlineCompleteResponse {
            completion,
            model: model.unwrap_or_default(),
        }))
    }

    async fn chat(
        &self,
        request: Request<agent::ChatRequest>,
    ) -> Result<Response<agent::ChatResponse>, Status> {
        let payload = request.into_inner();
        let model = if payload.model.trim().is_empty() {
            None
        } else {
            Some(payload.model.clone())
        };

        let messages = payload
            .messages
            .into_iter()
            .map(|m| ChatMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let content = self
            .state
            .engine
            .chat(ChatRequest {
                model: model.clone(),
                messages,
                temperature: payload.temperature,
                max_tokens: payload.max_tokens,
            })
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        Ok(Response::new(agent::ChatResponse {
            model: model.unwrap_or_default(),
            content,
        }))
    }

    type ChatStreamStream =
        Pin<Box<dyn Stream<Item = Result<agent::ChatStreamEvent, Status>> + Send + 'static>>;

    async fn chat_stream(
        &self,
        request: Request<agent::ChatRequest>,
    ) -> Result<Response<Self::ChatStreamStream>, Status> {
        let payload = request.into_inner();
        let model = if payload.model.trim().is_empty() {
            None
        } else {
            Some(payload.model.clone())
        };

        let messages = payload
            .messages
            .into_iter()
            .map(|m| ChatMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let token_rx = self
            .state
            .engine
            .chat_stream(ChatRequest {
                model: model.clone(),
                messages,
                temperature: payload.temperature,
                max_tokens: payload.max_tokens,
            })
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        let stream = UnboundedReceiverStream::new(token_rx).map(move |res| match res {
            Ok(EngineChatStreamEvent::Token(tok)) => Ok(agent::ChatStreamEvent {
                event: Some(agent::chat_stream_event::Event::Token(tok)),
            }),
            Ok(EngineChatStreamEvent::Done(content)) => Ok(agent::ChatStreamEvent {
                event: Some(agent::chat_stream_event::Event::Done(agent::ChatResponse {
                    model: model.clone().unwrap_or_default(),
                    content,
                })),
            }),
            Err(err) => Err(Status::internal(err.to_string())),
        });

        Ok(Response::new(Box::pin(stream)))
    }

    async fn embed(
        &self,
        request: Request<agent::EmbedRequest>,
    ) -> Result<Response<agent::EmbedResponse>, Status> {
        let payload = request.into_inner();
        let model = if payload.model.trim().is_empty() {
            None
        } else {
            Some(payload.model.clone())
        };

        let embeddings = self
            .state
            .engine
            .embed(EmbedRequest {
                model: model.clone(),
                input: payload.input,
            })
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        Ok(Response::new(agent::EmbedResponse {
            model: model.unwrap_or_default(),
            embeddings: embeddings
                .into_iter()
                .map(|values| agent::EmbedVector { values })
                .collect(),
        }))
    }

    async fn rerank(
        &self,
        request: Request<agent::RerankRequest>,
    ) -> Result<Response<agent::RerankResponse>, Status> {
        let payload = request.into_inner();
        let top_n = payload.top_n;
        let query = payload.query;
        let candidates = payload.candidates;

        if query.trim().is_empty() {
            return Err(Status::invalid_argument("query is required"));
        }
        if candidates.is_empty() {
            return Err(Status::invalid_argument("candidates are required"));
        }

        let model = if payload.model.trim().is_empty() {
            None
        } else {
            Some(payload.model.clone())
        };

        let mut inputs = Vec::with_capacity(candidates.len() + 1);
        inputs.push(query.clone());
        for cand in &candidates {
            if cand.content.trim().is_empty() {
                return Err(Status::invalid_argument("candidate content is required"));
            }
            inputs.push(cand.content.clone());
        }

        let embeddings = self
            .state
            .engine
            .embed(EmbedRequest {
                model: model.clone(),
                input: inputs,
            })
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        if embeddings.len() != candidates.len() + 1 {
            return Err(Status::internal("embed returned unexpected vector count"));
        }

        let mut embeddings_iter = embeddings.into_iter();
        let Some(query_vec) = embeddings_iter.next() else {
            return Err(Status::internal("missing query embedding"));
        };
        let mut scored = candidates
            .into_iter()
            .zip(embeddings_iter)
            .map(|(cand, emb)| ScoredCandidate {
                id: cand.id,
                score: cosine_similarity(&query_vec, &emb),
            })
            .collect::<Vec<_>>();

        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));

        let top_n = if top_n == 0 {
            scored.len()
        } else {
            top_n as usize
        };

        let results = scored
            .into_iter()
            .take(top_n)
            .enumerate()
            .map(|(idx, cand)| agent::RerankResult {
                id: cand.id,
                score: cand.score,
                rank: (idx + 1) as u32,
            })
            .collect();

        Ok(Response::new(agent::RerankResponse {
            model: model.unwrap_or_default(),
            results,
        }))
    }

    async fn resolve_drift(
        &self,
        request: Request<agent::ResolveDriftRequest>,
    ) -> Result<Response<agent::ResolveDriftResponse>, Status> {
        let payload = request.into_inner();
        if payload.left_update.is_empty() {
            return Err(Status::invalid_argument("left_update is required"));
        }
        if payload.right_update.is_empty() {
            return Err(Status::invalid_argument("right_update is required"));
        }

        let merged_update = merge_yjs_updates(&payload.left_update, &payload.right_update)
            .map_err(|err| Status::internal(format!("failed to merge Yjs updates: {err}")))?;

        Ok(Response::new(agent::ResolveDriftResponse { merged_update }))
    }

    async fn enqueue_background_task(
        &self,
        request: Request<agent::EnqueueBackgroundTaskRequest>,
    ) -> Result<Response<agent::EnqueueBackgroundTaskResponse>, Status> {
        let payload = request.into_inner();
        let space_id = payload.space_id.trim();
        let document_id = payload.document_id.trim();
        let selection_text = payload.selection_text.trim();

        if space_id.is_empty() {
            return Err(Status::invalid_argument("space_id is required"));
        }
        if document_id.is_empty() {
            return Err(Status::invalid_argument("document_id is required"));
        }
        if selection_text.is_empty() {
            return Err(Status::invalid_argument("selection_text is required"));
        }

        let kind = proto_kind_to_store(payload.kind)
            .ok_or_else(|| Status::invalid_argument("invalid background task kind"))?;

        let record = self
            .state
            .task_store
            .enqueue(
                kind,
                space_id,
                document_id,
                selection_text,
                payload.persist_in_document,
            )
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        let model = payload.model.trim();
        let model = if model.is_empty() {
            None
        } else {
            Some(model.to_string())
        };

        let task_store = self.state.task_store.clone();
        let engine = self.state.engine.clone();
        let task_for_worker = record.clone();
        tokio::spawn(async move {
            run_background_task(engine, task_store, task_for_worker, model).await;
        });

        Ok(Response::new(agent::EnqueueBackgroundTaskResponse {
            task: Some(map_background_task_record(record)),
        }))
    }

    async fn list_background_tasks(
        &self,
        request: Request<agent::ListBackgroundTasksRequest>,
    ) -> Result<Response<agent::ListBackgroundTasksResponse>, Status> {
        let payload = request.into_inner();
        let space_id = if payload.space_id.trim().is_empty() {
            None
        } else {
            Some(payload.space_id.trim())
        };
        let limit = if payload.limit == 0 {
            50
        } else {
            payload.limit
        };

        let tasks = self
            .state
            .task_store
            .list(space_id, limit)
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        Ok(Response::new(agent::ListBackgroundTasksResponse {
            tasks: tasks.into_iter().map(map_background_task_record).collect(),
        }))
    }
}

fn map_model_info(m: crate::engine::ModelInfo) -> agent::ModelInfo {
    agent::ModelInfo {
        name: m.name,
        kind: match m.kind {
            ModelKind::Chat => agent::ModelKind::Chat as i32,
            ModelKind::Embed => agent::ModelKind::Embed as i32,
            ModelKind::Unknown => agent::ModelKind::Unspecified as i32,
        },
        path: m.path,
        loaded: m.loaded,
        size_bytes: m.size_bytes.unwrap_or_default(),
    }
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
            if let Err(err) = task_store
                .mark_succeeded(&task.task_id, content.trim())
                .await
            {
                warn!(
                    task_id = %task.task_id,
                    error = %err,
                    "failed to mark background task as succeeded"
                );
            }
        }
        Err(err) => {
            if let Err(store_err) = task_store
                .mark_failed(&task.task_id, &err.to_string())
                .await
            {
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
        StoreBackgroundTaskKind::ExpandSelection => {
            if persist_in_document {
                "Expand the selected text into richer content that can be inserted directly into the document. Return only the expanded text."
            } else {
                "Expand the selected text with more detail and context."
            }
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

fn map_background_task_record(record: BackgroundTaskRecord) -> agent::BackgroundTask {
    agent::BackgroundTask {
        task_id: record.task_id,
        kind: map_store_kind_to_proto(record.kind) as i32,
        status: map_store_status_to_proto(record.status) as i32,
        space_id: record.space_id,
        document_id: record.document_id,
        selection_text: record.selection_text,
        persist_in_document: record.persist_in_document,
        result_text: record.result_text.unwrap_or_default(),
        error: record.error.unwrap_or_default(),
        created_at_ms: record.created_at_ms,
        updated_at_ms: record.updated_at_ms,
    }
}

fn proto_kind_to_store(kind: i32) -> Option<StoreBackgroundTaskKind> {
    match agent::BackgroundTaskKind::try_from(kind).ok()? {
        agent::BackgroundTaskKind::ExplainSelection => {
            Some(StoreBackgroundTaskKind::ExplainSelection)
        }
        agent::BackgroundTaskKind::ExpandSelection => {
            Some(StoreBackgroundTaskKind::ExpandSelection)
        }
        agent::BackgroundTaskKind::ResearchSelection => {
            Some(StoreBackgroundTaskKind::ResearchSelection)
        }
        agent::BackgroundTaskKind::Unspecified => None,
    }
}

fn map_store_kind_to_proto(kind: StoreBackgroundTaskKind) -> agent::BackgroundTaskKind {
    match kind {
        StoreBackgroundTaskKind::ExplainSelection => agent::BackgroundTaskKind::ExplainSelection,
        StoreBackgroundTaskKind::ExpandSelection => agent::BackgroundTaskKind::ExpandSelection,
        StoreBackgroundTaskKind::ResearchSelection => agent::BackgroundTaskKind::ResearchSelection,
    }
}

fn map_store_status_to_proto(status: StoreBackgroundTaskStatus) -> agent::BackgroundTaskStatus {
    match status {
        StoreBackgroundTaskStatus::Queued => agent::BackgroundTaskStatus::Queued,
        StoreBackgroundTaskStatus::Running => agent::BackgroundTaskStatus::Running,
        StoreBackgroundTaskStatus::Succeeded => agent::BackgroundTaskStatus::Succeeded,
        StoreBackgroundTaskStatus::Failed => agent::BackgroundTaskStatus::Failed,
    }
}

struct ScoredCandidate {
    id: String,
    score: f64,
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() || b.is_empty() || a.len() != b.len() {
        return 0.0;
    }

    let mut dot = 0.0_f64;
    let mut norm_a = 0.0_f64;
    let mut norm_b = 0.0_f64;

    for (ai, bi) in a.iter().zip(b.iter()) {
        let a = f64::from(*ai);
        let b = f64::from(*bi);
        dot += a * b;
        norm_a += a * a;
        norm_b += b * b;
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a.sqrt() * norm_b.sqrt())
}

fn merge_yjs_updates(left: &[u8], right: &[u8]) -> Result<Vec<u8>, String> {
    let doc = Doc::new();
    {
        let mut txn = doc.transact_mut();
        let left_update = Update::decode_v1(left).map_err(|err| format!("decode left: {err}"))?;
        txn.apply_update(left_update)
            .map_err(|err| format!("apply left: {err}"))?;
        let right_update =
            Update::decode_v1(right).map_err(|err| format!("decode right: {err}"))?;
        txn.apply_update(right_update)
            .map_err(|err| format!("apply right: {err}"))?;
    }

    let txn = doc.transact();
    Ok(txn.encode_state_as_update_v1(&StateVector::default()))
}

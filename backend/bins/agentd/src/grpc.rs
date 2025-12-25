use std::{pin::Pin, sync::Arc};

use futures::Stream;
use soma_proto_build::agent;
use tokio_stream::{StreamExt as TokioStreamExt, wrappers::UnboundedReceiverStream};
use tonic::{Request, Response, Status};

use crate::engine::{
    ChatMessage, ChatRequest, EmbedRequest, EngineChatStreamEvent, EngineHandle, ModelKind,
};

#[derive(Debug)]
pub struct AgentdState {
    pub engine: EngineHandle,
}

#[derive(Clone)]
pub struct AgentdService {
    pub state: Arc<AgentdState>,
}

impl AgentdService {
    pub fn new(engine: EngineHandle) -> Self {
        Self {
            state: Arc::new(AgentdState { engine }),
        }
    }
}

#[tonic::async_trait]
impl agent::agent_server::Agent for AgentdService {
    async fn status(
        &self,
        _request: Request<()>,
    ) -> Result<Response<agent::StatusResponse>, Status> {
        let status = self
            .state
            .engine
            .status()
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        let models = status
            .models
            .into_iter()
            .map(|m| agent::ModelInfo {
                name: m.name,
                kind: match m.kind {
                    ModelKind::Chat => agent::ModelKind::Chat as i32,
                    ModelKind::Embed => agent::ModelKind::Embed as i32,
                },
                path: m.path,
                loaded: m.loaded,
            })
            .collect();

        Ok(Response::new(agent::StatusResponse {
            version: status.version,
            default_chat_model: status.default_chat_model,
            default_embed_model: status.default_embed_model,
            models,
        }))
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
}

use std::pin::Pin;

use futures::Stream;
use soma_proto_build::agent;
use tokio_stream::{StreamExt as TokioStreamExt, wrappers::UnboundedReceiverStream};
use tonic::{Request, Response, Status};

use crate::engine::{ChatMessage, ChatRequest, EmbedRequest, EngineChatStreamEvent};

use super::AgentdService;

pub(super) async fn inline_complete(
    service: &AgentdService,
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

    let model = optional_model(&payload.model);
    let completion = service
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

pub(super) async fn chat(
    service: &AgentdService,
    request: Request<agent::ChatRequest>,
) -> Result<Response<agent::ChatResponse>, Status> {
    let payload = request.into_inner();
    let model = optional_model(&payload.model);
    let content = service
        .state
        .engine
        .chat(ChatRequest {
            model: model.clone(),
            messages: map_chat_messages(payload.messages),
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

pub(super) async fn chat_stream(
    service: &AgentdService,
    request: Request<agent::ChatRequest>,
) -> Result<
    Response<Pin<Box<dyn Stream<Item = Result<agent::ChatStreamEvent, Status>> + Send + 'static>>>,
    Status,
> {
    let payload = request.into_inner();
    let model = optional_model(&payload.model);
    let token_rx = service
        .state
        .engine
        .chat_stream(ChatRequest {
            model: model.clone(),
            messages: map_chat_messages(payload.messages),
            temperature: payload.temperature,
            max_tokens: payload.max_tokens,
        })
        .await
        .map_err(|err| Status::internal(err.to_string()))?;

    let stream = UnboundedReceiverStream::new(token_rx).map(move |res| match res {
        Ok(EngineChatStreamEvent::Token(token)) => Ok(agent::ChatStreamEvent {
            event: Some(agent::chat_stream_event::Event::Token(token)),
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

pub(super) async fn embed(
    service: &AgentdService,
    request: Request<agent::EmbedRequest>,
) -> Result<Response<agent::EmbedResponse>, Status> {
    let payload = request.into_inner();
    let model = optional_model(&payload.model);
    let embeddings = service
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

pub(super) fn optional_model(model: &str) -> Option<String> {
    if model.trim().is_empty() {
        None
    } else {
        Some(model.to_string())
    }
}

fn map_chat_messages(messages: Vec<agent::ChatMessage>) -> Vec<ChatMessage> {
    messages
        .into_iter()
        .map(|message| ChatMessage {
            role: message.role,
            content: message.content,
        })
        .collect()
}

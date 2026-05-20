//! Coordinator that wires the config source, HTTP provider, task store, and
//! in-process agent runtime together. The Tauri commands hold an
//! `Arc<AgentService>` in `tauri::State` and call its methods directly;
//! they own no business logic of their own.

use std::sync::Arc;

use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use desktop_core::error::{DesktopError, DesktopResult};
use reqwest::Client;
use serde_json::Value;
use tokio::sync::RwLock;

use crate::config::{AgentRuntimeConfig, ResolvedWorkspaceAgentConfig, normalize_runtime_config, resolve_workspace};
use crate::events::{RuntimePoll, RuntimePollSnapshot};
use crate::provider::ChatProvider;
use crate::provider::openai::OpenAiProvider;
use crate::runtime::AgentRuntime;
use crate::tasks::{InMemoryTaskStore, SharedTaskStore, TaskPatch, new_queued_task, task_messages, validate_enqueue};
use crate::types::{
    AgentModel, AgentProvider, BackgroundTask, BackgroundTaskStatus, ChatMessage, ChatOptions, ChatResponse,
    EnqueueBackgroundTaskParams, ListBackgroundTasksParams, RerankParams, RerankResult, ResolveDriftParams,
    ResolveDriftResult,
};

/// Read-only window on the persisted agent config. Implementations are
/// expected to read from `tauri-plugin-store`'s `settings.agent.config` key.
#[async_trait]
pub trait ConfigSource: Send + Sync {
    async fn read(&self) -> AgentRuntimeConfig;
}

/// Single-tenant default. Useful for tests; production wires a store-backed
/// source in `desktop-app`'s setup hook.
pub struct StaticConfigSource(pub AgentRuntimeConfig);

#[async_trait]
impl ConfigSource for StaticConfigSource {
    async fn read(&self) -> AgentRuntimeConfig {
        self.0.clone()
    }
}

pub struct AgentService {
    config: Arc<dyn ConfigSource>,
    http: Client,
    tasks: SharedTaskStore,
    runtime: Arc<AgentRuntime>,
    /// `Arc<Self>` handle returned to background-task processors so they can
    /// reuse the same service without an explicit re-injection step.
    self_handle: RwLock<Option<Arc<AgentService>>>,
}

impl AgentService {
    pub fn new(config: Arc<dyn ConfigSource>, runtime: Arc<AgentRuntime>) -> Arc<Self> {
        let http = Client::builder()
            .build()
            .expect("reqwest::Client::builder must not fail with default options");
        let svc = Arc::new(Self {
            config,
            http,
            tasks: Arc::new(InMemoryTaskStore::new()),
            runtime,
            self_handle: RwLock::new(None),
        });
        // Cache an Arc back to ourselves so background-task processors can
        // grab it without callers having to hand it through.
        *svc.self_handle.try_write().expect("uncontended") = Some(Arc::clone(&svc));
        svc
    }

    // --- public ops --------------------------------------------------------

    pub async fn chat(&self, messages: &[ChatMessage], opts: &ChatOptions) -> ChatResponse {
        let provider = self.provider_for(opts.space_id.as_deref()).await;
        match provider.chat(messages, opts).await {
            Ok(resp) => resp,
            Err(err) => ChatResponse {
                token: String::new(),
                done: true,
                error: err.to_string(),
            },
        }
    }

    pub async fn list_models(&self, space_id: Option<&str>) -> DesktopResult<Vec<AgentModel>> {
        self.provider_for(space_id).await.list_models().await
    }

    pub async fn rerank(&self, params: &RerankParams) -> DesktopResult<Vec<RerankResult>> {
        if params.query.trim().is_empty() {
            return Err(DesktopError::invalid("query is required"));
        }
        if params.candidates.is_empty() {
            return Err(DesktopError::invalid("at least one candidate is required"));
        }

        let provider = self.provider_for(params.space_id.as_deref()).await;
        let config = self.resolve(params.space_id.as_deref()).await;
        let model = params
            .model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&config.embed_model);

        let texts: Vec<&str> = std::iter::once(params.query.as_str())
            .chain(params.candidates.iter().map(|c| c.content.as_str()))
            .collect();
        let embeddings = provider.embed(model, &texts).await?;

        let query_emb = embeddings.first().cloned().unwrap_or_default();
        if query_emb.is_empty() {
            return Err(DesktopError::Agent {
                message: "provider returned no query embedding".into(),
            });
        }

        let mut scored: Vec<(String, f32)> = params
            .candidates
            .iter()
            .enumerate()
            .filter_map(|(idx, c)| {
                let emb = embeddings.get(idx + 1)?;
                if emb.is_empty() {
                    return None;
                }
                Some((c.id.clone(), cosine_similarity(&query_emb, emb)))
            })
            .collect();
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let top_n = params.top_n.filter(|n| *n > 0).unwrap_or(scored.len());
        Ok(scored
            .into_iter()
            .take(top_n)
            .enumerate()
            .map(|(i, (id, score))| RerankResult {
                id,
                score,
                rank: i + 1,
            })
            .collect())
    }

    pub async fn resolve_drift(&self, params: &ResolveDriftParams) -> DesktopResult<ResolveDriftResult> {
        if params.left_update_base64.trim().is_empty() {
            return Err(DesktopError::invalid("leftUpdateBase64 is required"));
        }
        if params.right_update_base64.trim().is_empty() {
            return Err(DesktopError::invalid("rightUpdateBase64 is required"));
        }
        let left = B64
            .decode(params.left_update_base64.trim())
            .map_err(|e| DesktopError::invalid(format!("left base64: {e}")))?;
        let right = B64
            .decode(params.right_update_base64.trim())
            .map_err(|e| DesktopError::invalid(format!("right base64: {e}")))?;
        let handle = self.runtime.handle().await?;
        let merged = handle
            .resolve_drift(left, right)
            .await
            .map_err(|e| DesktopError::Agent { message: e.to_string() })?;
        Ok(ResolveDriftResult {
            merged_update_base64: B64.encode(merged),
        })
    }

    pub async fn enqueue_background_task(&self, params: EnqueueBackgroundTaskParams) -> DesktopResult<BackgroundTask> {
        validate_enqueue(&params)?;
        let task = new_queued_task(&params);
        self.tasks.insert(task.clone()).await;
        // Spawn the processor. We re-grab Self from the cached Arc so the
        // background future doesn't capture &self.
        let svc = self.self_arc().await;
        let task_id = task.task_id.clone();
        let model = params.model.clone();
        tokio::spawn(async move {
            svc.run_background_task(&task_id, model.as_deref()).await;
        });
        Ok(task)
    }

    pub async fn list_background_tasks(&self, params: &ListBackgroundTasksParams) -> Vec<BackgroundTask> {
        self.tasks.list(params).await
    }

    // --- internals ---------------------------------------------------------

    async fn run_background_task(&self, task_id: &str, model: Option<&str>) {
        let Some(task) = self.tasks.get(task_id).await else { return };
        self.tasks
            .update(task_id, TaskPatch {
                status: Some(BackgroundTaskStatus::Running),
                error: Some(String::new()),
                ..Default::default()
            })
            .await;

        let opts = ChatOptions {
            model: model.map(str::to_owned),
            max_tokens: Some(1_200),
            temperature: Some(match task.kind {
                crate::types::BackgroundTaskKind::ResearchSelection => 0.3,
                _ => 0.2,
            }),
            space_id: Some(task.space_id.clone()),
        };
        let messages = task_messages(&task);

        let response = self.chat(&messages, &opts).await;
        if !response.error.is_empty() {
            self.tasks
                .update(task_id, TaskPatch {
                    status: Some(BackgroundTaskStatus::Failed),
                    error: Some(response.error),
                    ..Default::default()
                })
                .await;
            return;
        }
        self.tasks
            .update(task_id, TaskPatch {
                status: Some(BackgroundTaskStatus::Succeeded),
                result_text: Some(response.token.trim().to_owned()),
                ..Default::default()
            })
            .await;
    }

    async fn provider_for(&self, space_id: Option<&str>) -> Box<dyn ChatProvider> {
        let resolved = self.resolve(space_id).await;
        build_provider(self.http.clone(), resolved)
    }

    async fn resolve(&self, space_id: Option<&str>) -> ResolvedWorkspaceAgentConfig {
        let cfg = self.config.read().await;
        resolve_workspace(&cfg, space_id)
    }

    async fn self_arc(&self) -> Arc<AgentService> {
        self.self_handle
            .read()
            .await
            .clone()
            .expect("AgentService self-handle must be populated by AgentService::new")
    }
}

/// Open/Closed extension point. Adding a new provider variant means a new
/// arm here — no other module changes.
fn build_provider(http: Client, config: ResolvedWorkspaceAgentConfig) -> Box<dyn ChatProvider> {
    match config.provider {
        AgentProvider::OpenAiCompatible => Box::new(OpenAiProvider::new(http, config)),
    }
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    if left.is_empty() || right.is_empty() || left.len() != right.len() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut left_norm = 0.0f32;
    let mut right_norm = 0.0f32;
    for (l, r) in left.iter().zip(right.iter()) {
        dot += l * r;
        left_norm += l * l;
        right_norm += r * r;
    }
    if left_norm == 0.0 || right_norm == 0.0 {
        return 0.0;
    }
    dot / (left_norm.sqrt() * right_norm.sqrt())
}

// --- RuntimePoll impl so events::spawn can drive us ------------------------

#[async_trait]
impl RuntimePoll for AgentService {
    async fn list_models(&self) -> DesktopResult<Vec<AgentModel>> {
        AgentService::list_models(self, None).await
    }

    async fn current_config(&self) -> RuntimePollSnapshot {
        let cfg = self.config.read().await;
        RuntimePollSnapshot {
            provider: cfg.provider,
            base_url: cfg.open_ai_base_url.clone(),
            poll_interval_ms: cfg.poll_interval_ms,
        }
    }
}

// --- Settings-key constant re-export so binary doesn't import the config module directly.
pub use crate::config::AGENT_CONFIG_SETTINGS_KEY as SETTINGS_KEY;

/// Helper: build a `ConfigSource` from a serde_json `Value` snapshot. Used
/// where the renderer's settings store hands us a JSON blob (no async
/// reload), e.g. tests and the lazy-loading case in the binary.
pub fn config_source_from_value(value: Value) -> Arc<dyn ConfigSource> {
    Arc::new(StaticConfigSource(normalize_runtime_config(&value)))
}

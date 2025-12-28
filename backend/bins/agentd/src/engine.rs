use std::{
    collections::{HashMap, HashSet},
    num::NonZeroU32,
    path::{Path, PathBuf},
    sync::{Arc, mpsc},
};

use anyhow::{Context as AnyhowContext, anyhow};
use llama_cpp_2::{
    LogOptions,
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::params::LlamaModelParams,
    model::{AddBos, LlamaChatMessage, LlamaChatTemplate, LlamaModel, Special},
    sampling::LlamaSampler,
    send_logs_to_tracing,
};
use tokio::sync::{mpsc as tokio_mpsc, oneshot};
use tracing::{info, warn};

use crate::config::AgentdConfig;

#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub loaded: bool,
    pub kind: ModelKind,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelKind {
    Chat,
    Embed,
}

#[derive(Debug, Clone)]
pub struct EngineStatus {
    pub version: String,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    pub max_tokens: u64,
}

#[derive(Debug, Clone)]
pub struct EmbedRequest {
    pub model: Option<String>,
    pub input: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct EngineHandle {
    tx: mpsc::Sender<EngineRequest>,
}

#[derive(Debug, Clone)]
pub enum EngineChatStreamEvent {
    Token(String),
    Done(String),
}

type ChatStreamTx = tokio_mpsc::UnboundedSender<anyhow::Result<EngineChatStreamEvent>>;

enum EngineRequest {
    Status {
        respond_to: oneshot::Sender<anyhow::Result<EngineStatus>>,
    },
    Chat {
        request: ChatRequest,
        respond_to: oneshot::Sender<anyhow::Result<String>>,
    },
    ChatStream {
        request: ChatRequest,
        events: ChatStreamTx,
    },
    Embed {
        request: EmbedRequest,
        respond_to: oneshot::Sender<anyhow::Result<Vec<Vec<f32>>>>,
    },
}

impl EngineHandle {
    pub fn spawn(config: AgentdConfig) -> anyhow::Result<Self> {
        let (tx, rx) = mpsc::channel::<EngineRequest>();

        std::thread::Builder::new()
            .name("soma-agentd-llm".to_string())
            .spawn(move || {
                if let Err(err) = run_engine(rx, config) {
                    warn!(%err, "agentd engine stopped with error");
                }
            })
            .context("failed to spawn agentd engine thread")?;

        Ok(Self { tx })
    }

    pub async fn status(&self) -> anyhow::Result<EngineStatus> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(EngineRequest::Status { respond_to: tx })
            .map_err(|_| anyhow!("engine is not running"))?;
        rx.await.map_err(|_| anyhow!("engine dropped"))?
    }

    pub async fn chat(&self, request: ChatRequest) -> anyhow::Result<String> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(EngineRequest::Chat {
                request,
                respond_to: tx,
            })
            .map_err(|_| anyhow!("engine is not running"))?;
        rx.await.map_err(|_| anyhow!("engine dropped"))?
    }

    pub async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> anyhow::Result<tokio_mpsc::UnboundedReceiver<anyhow::Result<EngineChatStreamEvent>>> {
        let (event_tx, event_rx) = tokio_mpsc::unbounded_channel();

        self.tx
            .send(EngineRequest::ChatStream {
                request,
                events: event_tx,
            })
            .map_err(|_| anyhow!("engine is not running"))?;

        Ok(event_rx)
    }

    pub async fn embed(&self, request: EmbedRequest) -> anyhow::Result<Vec<Vec<f32>>> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(EngineRequest::Embed {
                request,
                respond_to: tx,
            })
            .map_err(|_| anyhow!("engine is not running"))?;
        rx.await.map_err(|_| anyhow!("engine dropped"))?
    }
}

struct EngineState {
    config: AgentdConfig,
    backend: LlamaBackend,
    models: HashMap<String, Arc<LoadedModel>>,
    known: HashMap<String, KnownModel>,
}

struct KnownModel {
    kind: ModelKind,
    explicit_path: Option<PathBuf>,
}

struct LoadedModel {
    kind: ModelKind,
    path: PathBuf,
    model: LlamaModel,
}

struct ChatPrompt {
    text: String,
    add_bos: AddBos,
}

impl ChatPrompt {
    fn new(text: String) -> Self {
        let add_bos = Self::infer_add_bos(&text);
        Self { text, add_bos }
    }

    fn infer_add_bos(text: &str) -> AddBos {
        let trimmed = text.trim_start();
        if trimmed.starts_with("<|begin_of_text|>") || trimmed.starts_with("<s>") {
            return AddBos::Never;
        }
        AddBos::Always
    }
}

struct StopDetector;

impl StopDetector {
    fn stop_index(text: &str) -> Option<usize> {
        // Truncate when the model starts emitting a new chat turn or special delimiters.
        // This helps keep base models from "continuing the conversation" by inventing new roles.
        const MARKERS: [&str; 14] = [
            "<|eot_id|>",
            "<|end_of_text|>",
            "<|im_end|>",
            "<|im_start|>",
            "<|start_header_id|>",
            "\nUser:",
            "\nSystem:",
            "\nAssistant:",
            " User:",
            " System:",
            " Assistant:",
            "User:",
            "System:",
            "Assistant:",
        ];

        let mut best: Option<usize> = None;
        for marker in MARKERS {
            if let Some(idx) = text.find(marker) {
                best = Some(best.map_or(idx, |best| best.min(idx)));
            }
        }
        best
    }
}

fn run_engine(rx: mpsc::Receiver<EngineRequest>, config: AgentdConfig) -> anyhow::Result<()> {
    send_logs_to_tracing(LogOptions::default());
    let backend = LlamaBackend::init().context("failed to init llama backend")?;

    let mut known = HashMap::<String, KnownModel>::new();
    known.insert(
        config.default_chat_model.clone(),
        KnownModel {
            kind: ModelKind::Chat,
            explicit_path: config.chat_model_path.clone(),
        },
    );
    known.insert(
        config.default_embed_model.clone(),
        KnownModel {
            kind: ModelKind::Embed,
            explicit_path: config.embed_model_path.clone(),
        },
    );

    let mut state = EngineState {
        config,
        backend,
        models: HashMap::new(),
        known,
    };

    info!("agentd engine ready");

    for req in rx {
        match req {
            EngineRequest::Status { respond_to } => {
                let _ = respond_to.send(state.status());
            }
            EngineRequest::Chat {
                request,
                respond_to,
            } => {
                let res = state.chat(request);
                let _ = respond_to.send(res);
            }
            EngineRequest::ChatStream { request, events } => {
                let events_clone = events.clone();
                if let Err(err) = state.chat_stream(request, events) {
                    let _ = events_clone.send(Err(err));
                }
            }
            EngineRequest::Embed {
                request,
                respond_to,
            } => {
                let res = state.embed(request);
                let _ = respond_to.send(res);
            }
        }
    }

    Ok(())
}

impl EngineState {
    fn status(&mut self) -> anyhow::Result<EngineStatus> {
        let mut names: HashSet<String> = HashSet::new();
        names.insert(self.config.default_chat_model.clone());
        names.insert(self.config.default_embed_model.clone());
        names.extend(self.models.keys().cloned());

        let mut models = Vec::new();
        for name in names {
            let (kind, path, loaded) = if let Some(m) = self.models.get(&name) {
                (m.kind, m.path.clone(), true)
            } else if let Some(k) = self.known.get(&name) {
                let kind = k.kind;
                let path = self.resolve_model_path(&name, k.explicit_path.as_deref())?;
                (kind, path, false)
            } else {
                continue;
            };

            let size_bytes = std::fs::metadata(&path).map(|m| m.len()).ok();

            models.push(ModelInfo {
                name,
                kind,
                path: path.display().to_string(),
                loaded,
                size_bytes,
            });
        }

        Ok(EngineStatus {
            version: env!("CARGO_PKG_VERSION").to_string(),
            default_chat_model: self.config.default_chat_model.clone(),
            default_embed_model: self.config.default_embed_model.clone(),
            models,
        })
    }

    fn chat(&mut self, request: ChatRequest) -> anyhow::Result<String> {
        let ctx_size = self.config.ctx_size;
        let threads = self.config.threads;
        let model_name = request
            .model
            .clone()
            .unwrap_or_else(|| self.config.default_chat_model.clone());
        let model = self
            .get_or_load_model(&model_name, ModelKind::Chat)
            .context("failed to load chat model")?;

        let prompt = self.compose_chat_prompt(&model_name, &model, &request.messages);
        let temperature = if request.temperature <= 0.0 {
            0.7
        } else {
            request.temperature
        };
        let max_tokens = if request.max_tokens == 0 {
            256
        } else {
            request.max_tokens
        };

        self.generate_text(
            &model.model,
            &prompt,
            ctx_size,
            threads,
            temperature,
            max_tokens,
            None,
        )
    }

    fn chat_stream(&mut self, request: ChatRequest, events: ChatStreamTx) -> anyhow::Result<()> {
        let ctx_size = self.config.ctx_size;
        let threads = self.config.threads;
        let model_name = request
            .model
            .clone()
            .unwrap_or_else(|| self.config.default_chat_model.clone());
        let model = self
            .get_or_load_model(&model_name, ModelKind::Chat)
            .context("failed to load chat model")?;

        let prompt = self.compose_chat_prompt(&model_name, &model, &request.messages);
        let temperature = if request.temperature <= 0.0 {
            0.7
        } else {
            request.temperature
        };
        let max_tokens = if request.max_tokens == 0 {
            256
        } else {
            request.max_tokens
        };

        let out = self
            .generate_text(
                &model.model,
                &prompt,
                ctx_size,
                threads,
                temperature,
                max_tokens,
                Some(events.clone()),
            )
            .context("generation failed")?;

        let _ = events.send(Ok(EngineChatStreamEvent::Done(out)));
        Ok(())
    }

    fn embed(&mut self, request: EmbedRequest) -> anyhow::Result<Vec<Vec<f32>>> {
        let ctx_size = self.config.ctx_size;
        let threads = self.config.threads;
        let model_name = request
            .model
            .clone()
            .unwrap_or_else(|| self.config.default_embed_model.clone());
        let model = self.get_or_load_model(&model_name, ModelKind::Embed)?;

        if request.input.is_empty() {
            return Ok(Vec::new());
        }

        let backend = &self.backend;
        let model = model.clone();
        request
            .input
            .iter()
            .map(|text| self.embed_text(backend, &model.model, text, ctx_size, threads))
            .collect()
    }

    fn get_or_load_model(
        &mut self,
        name: &str,
        kind: ModelKind,
    ) -> anyhow::Result<Arc<LoadedModel>> {
        if let Some(m) = self.models.get(name) {
            if m.kind != kind {
                return Err(anyhow!(
                    "model kind mismatch for {name}: requested {kind:?}, loaded {loaded:?}",
                    loaded = m.kind
                ));
            }
            return Ok(m.clone());
        }

        let explicit_path = self
            .known
            .get(name)
            .and_then(|k| k.explicit_path.as_deref());
        let path = self.resolve_model_path(name, explicit_path)?;

        info!(model = %name, path = %path.display(), "loading model");
        let params = LlamaModelParams::default();
        let model = LlamaModel::load_from_file(&self.backend, &path, &params)
            .with_context(|| format!("failed to load model {name} from {}", path.display()))?;

        let loaded = Arc::new(LoadedModel { kind, path, model });
        self.models.insert(name.to_string(), loaded.clone());

        Ok(loaded)
    }

    fn resolve_model_path(&self, name: &str, explicit: Option<&Path>) -> anyhow::Result<PathBuf> {
        if let Some(path) = explicit {
            return Ok(path.to_path_buf());
        }

        if name.ends_with(".gguf") {
            let candidate = PathBuf::from(name);
            if candidate.is_absolute() {
                return Ok(candidate);
            }
            return Ok(self.config.models_dir.join(candidate));
        }

        let sanitized = Self::sanitize_model_name(name);
        let direct = self.config.models_dir.join(format!("{sanitized}.gguf"));
        if direct.exists() {
            return Ok(direct);
        }

        // Best-effort fuzzy match within models_dir.
        if self.config.models_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&self.config.models_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("gguf") {
                        continue;
                    }
                    let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    let file_sanitized = Self::sanitize_model_name(file_stem);
                    if file_sanitized.contains(&sanitized) || sanitized.contains(&file_sanitized) {
                        return Ok(path);
                    }
                }
            }
        }

        Err(anyhow!(
            "unable to locate GGUF for model {name}; set SOMA_AGENTD_CHAT_MODEL_PATH/SOMA_AGENTD_EMBED_MODEL_PATH or put it under {}",
            self.config.models_dir.display()
        ))
    }

    fn sanitize_model_name(name: &str) -> String {
        name.trim()
            .replace(['/', '\\', ':', ' '], "-")
            .replace("--", "-")
    }

    fn compose_chat_prompt(
        &self,
        model_name: &str,
        model: &LoadedModel,
        messages: &[ChatMessage],
    ) -> ChatPrompt {
        match self.build_prompt_for_model(model_name, model, messages) {
            Ok(prompt) => prompt,
            Err(err) => {
                warn!(
                    model = %model_name,
                    %err,
                    "chat template unavailable; falling back to plain prompt"
                );
                ChatPrompt::new(Self::build_plain_prompt(messages))
            }
        }
    }

    fn build_plain_prompt(messages: &[ChatMessage]) -> String {
        let mut out = String::new();
        for msg in messages {
            let role = msg.role.trim().to_lowercase();
            match role.as_str() {
                "system" => {
                    out.push_str("System: ");
                    out.push_str(msg.content.trim());
                    out.push('\n');
                }
                "assistant" => {
                    out.push_str("Assistant: ");
                    out.push_str(msg.content.trim());
                    out.push('\n');
                }
                _ => {
                    out.push_str("User: ");
                    out.push_str(msg.content.trim());
                    out.push('\n');
                }
            }
        }
        out.push_str("Assistant: ");
        out
    }

    fn build_prompt_for_model(
        &self,
        model_name: &str,
        model: &LoadedModel,
        messages: &[ChatMessage],
    ) -> anyhow::Result<ChatPrompt> {
        let chat: Vec<LlamaChatMessage> = messages
            .iter()
            .map(|m| LlamaChatMessage::new(m.role.clone(), m.content.clone()))
            .collect::<Result<_, _>>()?;

        if let Ok(tmpl) = model.model.chat_template(None) {
            let prompt = model.model.apply_chat_template(&tmpl, &chat, true)?;
            return Ok(ChatPrompt::new(prompt));
        }

        // The model doesn't embed a chat template (common for base models). Try a sane fallback.
        let template = Self::infer_fallback_chat_template_name(model_name, &model.path);
        warn!(
            model = %model_name,
            template,
            path = %model.path.display(),
            "model missing embedded chat template; using fallback template"
        );
        let fallback = LlamaChatTemplate::new(template)?;
        let prompt = model.model.apply_chat_template(&fallback, &chat, true)?;
        Ok(ChatPrompt::new(prompt))
    }

    fn infer_fallback_chat_template_name(model_name: &str, path: &Path) -> &'static str {
        let mut hint = model_name.to_lowercase();
        if let Some(file) = path.file_name().and_then(|s| s.to_str()) {
            hint.push(' ');
            hint.push_str(&file.to_lowercase());
        }

        if hint.contains("llama-3") || hint.contains("llama3") {
            "llama3"
        } else if hint.contains("llama-2") || hint.contains("llama2") {
            "llama2"
        } else {
            "chatml"
        }
    }

    fn generate_text(
        &self,
        model: &LlamaModel,
        prompt: &ChatPrompt,
        ctx_size: u32,
        threads: Option<u32>,
        temperature: f32,
        max_tokens: u64,
        stream: Option<ChatStreamTx>,
    ) -> anyhow::Result<String> {
        let mut ctx_params = LlamaContextParams::default();
        ctx_params = ctx_params.with_n_ctx(NonZeroU32::new(ctx_size));
        if let Some(t) = threads {
            ctx_params = ctx_params.with_n_threads(i32::try_from(t).unwrap_or(i32::MAX));
        }

        let mut ctx = model
            .new_context(&self.backend, ctx_params)
            .context("failed to create llama context")?;

        let prompt_tokens = model
            .str_to_token(&prompt.text, prompt.add_bos)
            .context("tokenization failed")?;
        if prompt_tokens.is_empty() {
            return Ok(String::new());
        }

        let prompt_len = u32::try_from(prompt_tokens.len()).unwrap_or(ctx_size);
        if prompt_len >= ctx_size {
            return Err(anyhow!(
                "prompt exceeds context window (prompt_tokens={prompt_len}, ctx_size={ctx_size})"
            ));
        }
        let max_new_tokens = u64::from(ctx_size.saturating_sub(prompt_len));
        let requested_max_tokens = max_tokens;
        let max_tokens = requested_max_tokens.min(max_new_tokens);
        if requested_max_tokens > max_tokens {
            warn!(
                requested_max_tokens,
                max_tokens, ctx_size, prompt_len, "clamped max_tokens to fit context window"
            );
        }

        let mut batch = LlamaBatch::new(ctx_size as usize, 1);
        batch
            .add_sequence(&prompt_tokens, 0, false)
            .context("failed to add prompt tokens to batch")?;
        ctx.decode(&mut batch).context("decode failed")?;

        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::penalties(64, 1.1, 0.0, 0.0),
            LlamaSampler::temp(temperature),
            LlamaSampler::top_k(40),
            LlamaSampler::top_p(0.95, 1),
            LlamaSampler::dist(0),
        ]);

        sampler.accept_many(prompt_tokens.iter());

        let mut out = String::new();
        let mut utf8 = Utf8TokenDecoder::new();
        let mut pos = i32::try_from(prompt_tokens.len()).unwrap_or_default();
        let mut sample_logits_idx =
            i32::try_from(prompt_tokens.len().saturating_sub(1)).unwrap_or_default();

        for _ in 0..max_tokens {
            let token = sampler.sample(&ctx, sample_logits_idx);
            sampler.accept(token);

            if token == model.token_eos() {
                break;
            }

            let bytes = model
                .token_to_bytes(token, Special::Tokenize)
                .context("failed to decode token bytes")?;
            let piece = utf8.push_bytes(&bytes);
            if !piece.is_empty() {
                if let Some(tx) = stream.as_ref() {
                    let _ = tx.send(Ok(EngineChatStreamEvent::Token(piece.clone())));
                }
                out.push_str(&piece);
            }

            if let Some(stop_at) = StopDetector::stop_index(&out) {
                out.truncate(stop_at);
                break;
            }

            batch.clear();
            batch
                .add(token, pos, &[0], true)
                .context("failed to add token to batch")?;
            ctx.decode(&mut batch).context("decode failed")?;
            pos += 1;
            // We decode a single token each step (with logits enabled), so logits will be available at
            // token index 0 for the next sampling step.
            sample_logits_idx = 0;
        }

        let remaining = utf8.flush_lossy();
        if !remaining.is_empty() {
            if let Some(tx) = stream.as_ref() {
                let _ = tx.send(Ok(EngineChatStreamEvent::Token(remaining.clone())));
            }
            out.push_str(&remaining);
        }

        Ok(out)
    }

    fn embed_text(
        &self,
        backend: &LlamaBackend,
        model: &LlamaModel,
        text: &str,
        ctx_size: u32,
        threads: Option<u32>,
    ) -> anyhow::Result<Vec<f32>> {
        let mut ctx_params = LlamaContextParams::default();
        ctx_params = ctx_params
            .with_n_ctx(NonZeroU32::new(ctx_size))
            .with_embeddings(true);
        if let Some(t) = threads {
            ctx_params = ctx_params.with_n_threads(i32::try_from(t).unwrap_or(i32::MAX));
        }

        let mut ctx = model
            .new_context(backend, ctx_params)
            .context("failed to create llama context")?;

        let tokens = model
            .str_to_token(text, AddBos::Always)
            .context("tokenization failed")?;
        if tokens.is_empty() {
            return Ok(Vec::new());
        }

        let mut batch = LlamaBatch::new(ctx_size as usize, 1);
        batch
            .add_sequence(&tokens, 0, false)
            .context("failed to add tokens to batch")?;
        ctx.encode(&mut batch).context("encode failed")?;

        Ok(ctx
            .embeddings_seq_ith(0)
            .context("embeddings failed")?
            .to_vec())
    }
}

struct Utf8TokenDecoder {
    pending: Vec<u8>,
}

impl Utf8TokenDecoder {
    fn new() -> Self {
        Self {
            pending: Vec::new(),
        }
    }

    fn push_bytes(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);

        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(valid) => {
                    out.push_str(valid);
                    self.pending.clear();
                    break;
                }
                Err(err) => {
                    let valid_up_to = err.valid_up_to();
                    if valid_up_to > 0 {
                        // SAFETY: `valid_up_to` is guaranteed to be valid UTF-8.
                        let valid =
                            unsafe { std::str::from_utf8_unchecked(&self.pending[..valid_up_to]) };
                        out.push_str(valid);
                        self.pending.drain(..valid_up_to);
                        continue;
                    }

                    if let Some(error_len) = err.error_len() {
                        // Drop invalid byte(s) and emit a replacement character.
                        self.pending.drain(..error_len);
                        out.push('\u{FFFD}');
                        continue;
                    }

                    // Incomplete sequence at the end; keep bytes for the next token.
                    break;
                }
            }
        }

        out
    }

    fn flush_lossy(&mut self) -> String {
        if self.pending.is_empty() {
            return String::new();
        }
        let out = String::from_utf8_lossy(&self.pending).to_string();
        self.pending.clear();
        out
    }
}

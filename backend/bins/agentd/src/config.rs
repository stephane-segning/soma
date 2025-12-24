use std::path::PathBuf;

use clap::Parser;

/// CLI arguments for the desktop agent (local CPU-heavy helpers).
#[derive(Debug, Parser)]
#[command(name = "soma-agentd", version)]
pub struct Args {
    /// Unix socket path for desktop IPC.
    #[arg(long, env = "SOMA_AGENTD_SOCKET", default_value = "./soma-agentd.sock")]
    pub socket_path: PathBuf,

    /// Directory holding GGUF models (or symlinks to them).
    #[arg(long, env = "SOMA_AGENTD_MODELS_DIR", default_value = "./models")]
    pub models_dir: PathBuf,

    /// Default chat model name (UI-facing).
    #[arg(
        long,
        env = "SOMA_AGENTD_DEFAULT_CHAT_MODEL",
        default_value = "qwen3-vl:2b"
    )]
    pub default_chat_model: String,

    /// Default embedding model name (UI-facing).
    #[arg(
        long,
        env = "SOMA_AGENTD_DEFAULT_EMBED_MODEL",
        default_value = "nomic-embed-text"
    )]
    pub default_embed_model: String,

    /// Explicit GGUF path for the default chat model.
    #[arg(long, env = "SOMA_AGENTD_CHAT_MODEL_PATH")]
    pub chat_model_path: Option<PathBuf>,

    /// Explicit GGUF path for the default embed model.
    #[arg(long, env = "SOMA_AGENTD_EMBED_MODEL_PATH")]
    pub embed_model_path: Option<PathBuf>,

    /// Context window size to allocate for inference.
    #[arg(long, env = "SOMA_AGENTD_CTX_SIZE", default_value_t = 4096)]
    pub ctx_size: u32,

    /// Optional inference thread count.
    #[arg(long, env = "SOMA_AGENTD_THREADS")]
    pub threads: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct AgentdConfig {
    pub socket_path: PathBuf,
    pub models_dir: PathBuf,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub chat_model_path: Option<PathBuf>,
    pub embed_model_path: Option<PathBuf>,
    pub ctx_size: u32,
    pub threads: Option<u32>,
}

impl AgentdConfig {
    pub fn from_args(args: &Args) -> Self {
        Self {
            socket_path: args.socket_path.clone(),
            models_dir: args.models_dir.clone(),
            default_chat_model: args.default_chat_model.clone(),
            default_embed_model: args.default_embed_model.clone(),
            chat_model_path: args.chat_model_path.clone(),
            embed_model_path: args.embed_model_path.clone(),
            ctx_size: args.ctx_size,
            threads: args.threads,
        }
    }
}

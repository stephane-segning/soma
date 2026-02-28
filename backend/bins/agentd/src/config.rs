use std::path::PathBuf;

use clap::Parser;

/// CLI arguments for the desktop agent (local CPU-heavy helpers).
#[derive(Debug, Parser)]
#[command(name = "soma-agentd", version)]
pub struct Args {
    /// Unix socket path for desktop IPC.
    #[arg(
        long,
        env = "SOMA_AGENTD_SOCKET",
        default_value = "/tmp/soma-agentd.sock"
    )]
    pub socket_path: PathBuf,

    /// OpenAI-compatible base URL (for example Ollama or LM Studio).
    #[arg(
        long,
        env = "SOMA_AGENTD_PROVIDER_BASE_URL",
        default_value = "http://127.0.0.1:11434/v1"
    )]
    pub provider_base_url: String,

    /// Optional bearer API key for the provider endpoint.
    #[arg(long, env = "SOMA_AGENTD_PROVIDER_API_KEY")]
    pub provider_api_key: Option<String>,

    /// Default chat model name (UI-facing).
    #[arg(
        long,
        env = "SOMA_AGENTD_DEFAULT_CHAT_MODEL",
        default_value = "llama3.2"
    )]
    pub default_chat_model: String,

    /// Default embedding model name (UI-facing).
    #[arg(
        long,
        env = "SOMA_AGENTD_DEFAULT_EMBED_MODEL",
        default_value = "nomic-embed-text"
    )]
    pub default_embed_model: String,

    /// Per-request timeout when calling provider endpoints.
    #[arg(long, env = "SOMA_AGENTD_REQUEST_TIMEOUT_MS", default_value_t = 30_000)]
    pub request_timeout_ms: u64,

    /// SQLite path for persisted background tasks.
    #[arg(long, env = "SOMA_AGENTD_DB_PATH", default_value = "./agentd.db")]
    pub db_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct AgentdConfig {
    pub socket_path: PathBuf,
    pub provider_base_url: String,
    pub provider_api_key: Option<String>,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub request_timeout_ms: u64,
    pub db_path: PathBuf,
}

impl AgentdConfig {
    pub fn from_args(args: &Args) -> Self {
        let provider_base_url = args
            .provider_base_url
            .trim()
            .trim_end_matches('/')
            .to_string();
        let provider_api_key = args
            .provider_api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);

        Self {
            socket_path: args.socket_path.clone(),
            provider_base_url,
            provider_api_key,
            default_chat_model: args.default_chat_model.clone(),
            default_embed_model: args.default_embed_model.clone(),
            request_timeout_ms: args.request_timeout_ms.max(1_000),
            db_path: args.db_path.clone(),
        }
    }
}

use tracing_subscriber::EnvFilter;

/// Initialize tracing for binaries.
///
/// - Honors `RUST_LOG` if set.
/// - Falls back to `default_filter` (typically `"info"`).
pub fn init_tracing(default_filter: &str) {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| default_filter.into()),
        )
        .init();
}

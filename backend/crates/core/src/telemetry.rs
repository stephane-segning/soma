use std::env;
use tracing_subscriber::EnvFilter;

/// Initialize tracing for binaries.
///
/// - Honors `RUST_LOG` if set.
/// - Falls back to `default_filter` (typically `"info"`).
pub fn init_tracing(default_filter: &str) {
    let data_dir = env::var("SOMA_LOGS_DIR").ok();

    if let Some(dir) = data_dir.as_ref() {
        let appender = tracing_appender::rolling::weekly(dir, "log");
        let (non_blocking_appender, _guard) = tracing_appender::non_blocking(appender);

        // TODO check why this doesn't write into the file
        tracing_subscriber::fmt()
            .with_writer(non_blocking_appender)
            .with_env_filter(
                EnvFilter::try_from_default_env().unwrap_or_else(|_| default_filter.into()),
            )
            .init()
    } else {
        tracing_subscriber::fmt()
            .with_test_writer()
            .with_env_filter(
                EnvFilter::try_from_default_env().unwrap_or_else(|_| default_filter.into()),
            )
            .init()
    };
}

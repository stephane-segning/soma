use std::{env, fs, path::Path};
use std::sync::OnceLock;
use tracing_subscriber::EnvFilter;

// Keep the guard alive for non-blocking writers; dropping it stops flushing to disk.
static FILE_GUARD: OnceLock<tracing_appender::non_blocking::WorkerGuard> = OnceLock::new();

/// Initialize tracing for binaries.
///
/// - Honors `RUST_LOG` if set.
/// - Falls back to `default_filter` (typically `"info"`).
pub fn init_tracing(default_filter: &str) {
    let data_dir = env::var("SOMA_LOGS_DIR").ok();
    let log_as_json = structured_logs_enabled();

    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| default_filter.into());
    let mut guard_slot = None;

    let res = if let Some(dir) = data_dir.as_ref() {
        if let Err(e) = fs::create_dir_all(Path::new(dir)) {
            return eprintln!("Failed to create SOMA_LOGS_DIR ({}): {}", dir, e);
        }

        let appender = tracing_appender::rolling::weekly(dir, "log");
        let (non_blocking_appender, guard) = tracing_appender::non_blocking(appender);

        // Store the guard so the background worker keeps flushing to disk.
        guard_slot = Some(guard);

        if log_as_json {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter.clone())
                .json()
                .with_writer(non_blocking_appender)
                .try_init()
        } else {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter.clone())
                .with_writer(non_blocking_appender)
                .try_init()
        }
    } else {
        if log_as_json {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter.clone())
                .json()
                .try_init()
        } else {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter.clone())
                .try_init()
        }
    };

    if let Some(guard) = guard_slot {
        let _ = FILE_GUARD.set(guard);
    }

    if let Err(e) = res {
        eprintln!("Failed to initialize tracing: {}", e);
    }
}

fn structured_logs_enabled() -> bool {
    env::var("SOMA_LOG_FORMAT")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "json" | "structured" | "true" | "1"
            )
        })
        .unwrap_or(false)
}

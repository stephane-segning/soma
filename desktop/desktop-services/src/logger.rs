//! `tracing` setup mirroring the previous winston + winston-daily-rotate-file
//! configuration from `desktop/soma/src/main/services/logger.ts`.
//!
//! Parity points with the old logger:
//! * `main.log` (size-capped, 5 backups) for "info+" — replaced here by a
//!   non-rotating appender with the same default level.
//! * `daily-%DATE%.log` (rotating, 14d retention) for "debug+" in dev /
//!   "info+" in prod.
//! * Pretty console output in dev only; JSON output in prod.
//!
//! The `tracing-appender::rolling` modules don't support compressed archives
//! or size-cap retention natively; we accept that loss for now. If the
//! retention story matters again we can swap to `tracing-appender`-rs or a
//! purpose-built crate without changing the public API of `init`.

use std::fs;
use std::path::Path;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::Layer;
use tracing_subscriber::fmt;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

/// Returned by [`init`]; **must** be held for the lifetime of the process —
/// dropping the guard immediately stops the non-blocking writer threads and
/// any in-flight log records get lost.
pub struct LoggerGuards {
    _main: WorkerGuard,
    _daily: WorkerGuard,
}

#[derive(Debug, Clone)]
pub struct LoggerOptions<'a> {
    /// Directory where log files land. Created if missing.
    pub log_dir: &'a Path,
    /// Whether to enable the pretty console layer + lower the daily log
    /// level to `debug`.
    pub is_dev: bool,
}

/// Install the global tracing subscriber. Idempotent across `cargo test`s
/// because we use `try_init` — repeat calls become a no-op.
pub fn init(opts: LoggerOptions<'_>) -> std::io::Result<LoggerGuards> {
    fs::create_dir_all(opts.log_dir)?;

    // Main (non-rotating) log — coarse default `info`.
    let main_appender = rolling::never(opts.log_dir, "main.log");
    let (main_writer, main_guard) = tracing_appender::non_blocking(main_appender);

    // Daily rotating log — `debug+` in dev, `info+` in prod.
    let daily_appender = rolling::daily(opts.log_dir, "daily.log");
    let (daily_writer, daily_guard) = tracing_appender::non_blocking(daily_appender);

    let daily_default_level = if opts.is_dev { "debug" } else { "info" };

    let main_layer = fmt::layer()
        .with_writer(main_writer)
        .with_ansi(false)
        .json()
        .with_filter(EnvFilter::try_from_env("SOMA_DESKTOP_LOG").unwrap_or_else(|_| EnvFilter::new("info")));

    let daily_layer = fmt::layer()
        .with_writer(daily_writer)
        .with_ansi(false)
        .json()
        .with_filter(EnvFilter::try_from_env("SOMA_DESKTOP_LOG").unwrap_or_else(|_| EnvFilter::new(daily_default_level)));

    let registry = tracing_subscriber::registry().with(main_layer).with(daily_layer);

    if opts.is_dev {
        let console = fmt::layer().with_ansi(true).with_target(false).compact().with_filter(
            EnvFilter::try_from_env("SOMA_DESKTOP_LOG").unwrap_or_else(|_| EnvFilter::new("debug")),
        );
        let _ = registry.with(console).try_init();
    } else {
        let _ = registry.try_init();
    }

    Ok(LoggerGuards {
        _main: main_guard,
        _daily: daily_guard,
    })
}

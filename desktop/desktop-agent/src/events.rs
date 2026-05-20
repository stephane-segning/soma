//! Poll loop that emits `ready` / `status` / `error` agent runtime events.
//! Mirrors `agent-client/runtime-events.ts` with one substantive change:
//! the poll cadence is driven by the *latest* config read each tick, so
//! editing `pollIntervalMs` takes effect immediately instead of waiting
//! for a process restart.

use std::sync::Arc;

use desktop_core::error::DesktopResult;
use tokio::task::JoinHandle;
use tokio::time::{Duration, sleep};

use crate::types::{AgentModel, AgentRuntimeEvent, now_ms};

/// Caller-supplied hooks. Trait-object based so the agent service can
/// inject async closures that read the live config + delegate to the
/// active `ChatProvider`.
#[async_trait::async_trait]
pub trait RuntimePoll: Send + Sync {
    async fn list_models(&self) -> DesktopResult<Vec<AgentModel>>;
    async fn current_config(&self) -> RuntimePollSnapshot;
}

#[derive(Debug, Clone)]
pub struct RuntimePollSnapshot {
    pub provider: crate::types::AgentProvider,
    pub base_url: String,
    pub poll_interval_ms: u64,
}

pub struct RuntimeEventStream {
    task: JoinHandle<()>,
}

impl RuntimeEventStream {
    pub fn stop(self) {
        self.task.abort();
    }
}

impl Drop for RuntimeEventStream {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Spawn the poll loop. `dispatch` is called once per event with the
/// translated payload; in production this forwards to
/// `AgentEventsBroadcaster::broadcast`.
pub fn spawn<P, F>(poll: Arc<P>, dispatch: F) -> RuntimeEventStream
where
    P: RuntimePoll + 'static,
    F: Fn(AgentRuntimeEvent) + Send + 'static,
{
    let task = tokio::spawn(async move {
        let mut emitted_ready = false;
        loop {
            let snapshot = poll.current_config().await;
            match poll.list_models().await {
                Ok(models) => {
                    if !emitted_ready {
                        dispatch(AgentRuntimeEvent::Ready {
                            at_ms: now_ms(),
                            provider: snapshot.provider,
                            base_url: snapshot.base_url.clone(),
                        });
                        emitted_ready = true;
                    }
                    dispatch(AgentRuntimeEvent::Status {
                        at_ms: now_ms(),
                        provider: snapshot.provider,
                        base_url: snapshot.base_url.clone(),
                        models,
                    });
                }
                Err(err) => {
                    dispatch(AgentRuntimeEvent::Error {
                        at_ms: now_ms(),
                        provider: snapshot.provider,
                        base_url: snapshot.base_url.clone(),
                        error: err.to_string(),
                    });
                }
            }
            sleep(Duration::from_millis(snapshot.poll_interval_ms.max(1_000))).await;
        }
    });
    RuntimeEventStream { task }
}

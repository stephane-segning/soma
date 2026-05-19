//! napi-rs addon embedding the Soma daemon + agent runtimes for Electron main.
//!
//! Loaded by the desktop Electron app's main process; this is the only Rust↔Node
//! boundary in the system. Async-only API. Build with `--profile addon-release`
//! so panics at the boundary unwind into typed JS errors instead of aborting
//! Electron's main process.
//!
//! P3a scope: the addon can start both runtimes, hold them alive, and shut them
//! down. P3b: every daemon and agentd in-process handle method is now mirrored
//! as a `#[napi]` async method on [`SomaHandle`]; streaming surfaces
//! (`stream_events`, `chat_stream`) remain TODO and live on the gRPC layer.

use std::path::PathBuf;
use std::str::FromStr;

use napi::Error as NapiError;
use napi::Status;
use napi::bindgen_prelude::Buffer;
use napi::bindgen_prelude::Unknown;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use tokio::sync::Mutex;

use soma_agentd::{
    AgentHandle as AgentInProcessHandle, RuntimeConfig as AgentdConfig,
    RuntimeHandle as AgentdHandle, handle_types as agent_types,
};
use soma_daemon::{
    DaemonHandle as DaemonInProcessHandle, RuntimeConfig as DaemonConfig,
    RuntimeHandle as DaemonHandle, handle_types as daemon_types,
};

#[napi(object)]
pub struct DaemonStatusJs {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
}

#[napi(object)]
pub struct StartConfig {
    pub daemon_db_path: String,
    pub blob_dir: String,
    pub identity_path: Option<String>,
    pub listen_addrs: Option<Vec<String>>,
    pub bootstrap_addrs: Option<Vec<String>>,
    pub rendezvous_addrs: Option<Vec<String>>,
    pub relay_addrs: Option<Vec<String>>,
    pub enable_mdns: Option<bool>,
}

// --- Plain napi mirror records for the daemon handle surface --------------

#[napi(object)]
pub struct PageRecordJs {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[napi(object)]
pub struct SpaceRecordJs {
    pub space_id: String,
    pub display_name: String,
    pub owner_peer_id: String,
    pub created_at: i64,
}

#[napi(object)]
pub struct DocumentRecordJs {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: i64,
}

#[napi(object)]
pub struct SpaceMemberJs {
    pub space_id: String,
    pub peer_id: String,
    pub role: String,
    pub expires_at: i64,
}

#[napi(object)]
pub struct DiscoveredSpaceJs {
    pub space_id: String,
    pub display_name: String,
    pub tags: Vec<String>,
}

/// Bot-shaped wire record for `list_space_bots`. `alias` flows from the
/// issuer-capability row; renderer hydrates `bot-<peerSuffix>` only if
/// the user never typed one in the Add form. `status` is the persistent
/// state with `expired` derived from `expires_at` at read time —
/// renderer renders it as-is.
#[napi(object)]
pub struct SpaceBotJs {
    pub space_id: String,
    pub peer_id: String,
    pub expires_at: i64,
    pub alias: Option<String>,
    pub status: String,
}

#[napi(object)]
pub struct CreateSpaceResultJs {
    pub space_id: String,
    pub owner_peer_id: String,
}

#[napi(object)]
pub struct ListSpacesInputJs {
    pub q: Option<String>,
    pub limit: u32,
    pub offset: u32,
}

#[napi(object)]
pub struct ListSpacesOutputJs {
    pub spaces: Vec<SpaceRecordJs>,
    pub limit: u32,
    pub offset: u32,
    pub next_offset: Option<u32>,
}

#[napi(object)]
pub struct CreateSpaceInputJs {
    pub space_id: String,
    pub display_name: String,
}

#[napi(object)]
pub struct UpdateSpaceInputJs {
    pub space_id: String,
    pub display_name: String,
}

#[napi(object)]
pub struct UploadBlobInputJs {
    pub space_id: String,
    pub data: Buffer,
    pub mime: String,
    pub name: String,
    pub doc_id: String,
}

#[napi(object)]
pub struct UploadBlobResultJs {
    pub cid: String,
    pub size: i64,
    pub mime: String,
    pub name: String,
}

#[napi(object)]
pub struct ReadBlobResultJs {
    pub data: Buffer,
    pub size: i64,
    pub mime: String,
}

#[napi(object)]
pub struct EnsurePageInputJs {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[napi(object)]
pub struct UpsertDocumentInputJs {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: i64,
}

#[napi(object)]
pub struct JoinSpaceInputJs {
    pub space_id: String,
    pub display_name: String,
    pub device_name: String,
    pub target_peer_id: String,
    pub target_multiaddrs: Vec<String>,
}

#[napi(object)]
pub struct JoinRequestRecordJs {
    pub request_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub display_name: String,
    pub device_name: String,
    pub requested_role: i32,
    pub created_at: i64,
}

#[napi(object)]
pub struct DecideJoinInputJs {
    pub request_id: String,
    pub approve: bool,
    pub role: String,
    pub reason: String,
}

#[napi(object)]
pub struct JoinDecisionRecordJs {
    pub decision_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub decision: i32,
    pub reason: String,
    pub approved: bool,
    pub created_at_ms: i64,
}

#[napi(object)]
pub struct RevokeSpaceInputJs {
    pub space_id: String,
    pub subject_peer_id: String,
    pub reason: String,
}

#[napi(object)]
pub struct IssueIssuerCapabilityInputJs {
    pub space_id: String,
    pub target_peer_id: String,
    pub expires_at: i64,
    /// Optional human alias for the Bots-tab list view. Empty / whitespace
    /// strings are dropped at the daemon boundary.
    pub alias: Option<String>,
}

// --- Plain napi mirror records for the agent handle surface --------------

#[napi(object)]
pub struct ModelInfoJs {
    pub name: String,
    pub path: String,
    pub loaded: bool,
    pub size_bytes: Option<i64>,
}

#[napi(object)]
pub struct AgentStatusJs {
    pub version: String,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub models: Vec<ModelInfoJs>,
}

#[napi(object)]
pub struct RerankCandidateJs {
    pub id: String,
    pub text: String,
}

#[napi(object)]
pub struct RerankHitJs {
    pub id: String,
    pub score: f64,
}

#[napi(object)]
pub struct RerankResultJs {
    pub hits: Vec<RerankHitJs>,
}

// --- Daemon event stream ----------------------------------------------------

/// Flat-shape mirror of `daemon_types::DaemonEventRecord` for the napi
/// boundary. JS callers switch on `kind` ("document-blob-added",
/// "join-submitted", "join-decision", "join-failed") and read the fields
/// relevant to that kind. Irrelevant fields are populated with empty strings
/// (or `0` for `size`) since napi `#[napi(object)]` can't express
/// discriminated unions cleanly.
#[napi(object)]
pub struct DaemonEventJs {
    pub kind: String,
    // DocumentBlobAdded
    pub space_id: String,
    pub doc_id: String,
    pub cid: String,
    pub mime: String,
    pub size: i64,
    pub name: String,
    // JoinSubmitted / JoinFailed
    pub request_id: String,
    pub target_peer_id: String,
    // JoinDecision
    pub from_peer_id: String,
    pub decision: i32,
    pub reason: String,
    // JoinFailed
    pub error: String,
}

impl DaemonEventJs {
    fn from_record(record: daemon_types::DaemonEventRecord) -> Self {
        let mut js = Self::empty();
        match record {
            daemon_types::DaemonEventRecord::DocumentBlobAdded {
                space_id,
                doc_id,
                cid,
                mime,
                size,
                name,
            } => {
                js.kind = "document-blob-added".into();
                js.space_id = space_id;
                js.doc_id = doc_id;
                js.cid = cid;
                js.mime = mime;
                js.size = size;
                js.name = name;
            }
            daemon_types::DaemonEventRecord::JoinSubmitted {
                request_id,
                target_peer_id,
            } => {
                js.kind = "join-submitted".into();
                js.request_id = request_id;
                js.target_peer_id = target_peer_id;
            }
            daemon_types::DaemonEventRecord::JoinDecision {
                from_peer_id,
                space_id,
                decision,
                reason,
            } => {
                js.kind = "join-decision".into();
                js.from_peer_id = from_peer_id;
                js.space_id = space_id;
                js.decision = decision;
                js.reason = reason;
            }
            daemon_types::DaemonEventRecord::JoinFailed {
                target_peer_id,
                error,
            } => {
                js.kind = "join-failed".into();
                js.target_peer_id = target_peer_id;
                js.error = error;
            }
        }
        js
    }

    fn empty() -> Self {
        Self {
            kind: String::new(),
            space_id: String::new(),
            doc_id: String::new(),
            cid: String::new(),
            mime: String::new(),
            size: 0,
            name: String::new(),
            request_id: String::new(),
            target_peer_id: String::new(),
            from_peer_id: String::new(),
            decision: 0,
            reason: String::new(),
            error: String::new(),
        }
    }
}

/// Returned by `SomaHandle.subscribeEvents`; calling `unsubscribe()` aborts
/// the translator task so the broadcast receiver is dropped and no more
/// events are delivered to the JS callback.
#[napi]
pub struct EventSubscription {
    abort: Mutex<Option<tokio::task::AbortHandle>>,
}

#[napi]
impl EventSubscription {
    #[napi]
    pub async fn unsubscribe(&self) {
        if let Some(handle) = self.abort.lock().await.take() {
            handle.abort();
        }
    }
}

// ---------------------------------------------------------------------------

struct RuntimeBundle {
    daemon: DaemonHandle,
    agentd: AgentdHandle,
}

#[napi]
pub struct SomaHandle {
    inner: Mutex<Option<RuntimeBundle>>,
}

#[napi]
impl SomaHandle {
    /// Gracefully shut down both embedded runtimes. Idempotent.
    #[napi]
    pub async fn shutdown(&self) -> napi::Result<()> {
        let Some(bundle) = self.inner.lock().await.take() else {
            return Ok(());
        };

        let (daemon_res, agentd_res) =
            tokio::join!(bundle.daemon.shutdown(), bundle.agentd.shutdown());

        if let Err(err) = &daemon_res {
            tracing::error!(error = %err, "daemon shutdown failed");
        }
        if let Err(err) = &agentd_res {
            tracing::error!(error = %err, "agentd shutdown failed");
        }

        daemon_res.map_err(to_napi)?;
        agentd_res.map_err(to_napi)?;
        Ok(())
    }

    #[napi]
    pub async fn is_running(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    // --- Daemon status --------------------------------------------------

    #[napi]
    pub async fn status(&self) -> napi::Result<DaemonStatusJs> {
        let handle = self.daemon_handle().await?;
        let status = handle.status().await;
        Ok(DaemonStatusJs {
            peer_id: status.peer_id,
            listen_addrs: status.listen_addrs,
        })
    }

    // --- Daemon event stream --------------------------------------------

    /// Subscribe to the daemon event firehose. `on_event` is called for every
    /// translated event; call `unsubscribe()` on the returned `Subscription`
    /// to stop. Backpressure: a 256-slot mpsc buffers between the broadcast
    /// translator and the JS callback; lagged events are dropped silently.
    ///
    /// Disables `CalleeHandled` (the napi-rs default) by setting the const
    /// generic to `false`, so the JS callback signature stays
    /// `(event) => void` rather than `(err, event) => void`. The translator
    /// task self-terminates if `call` returns `Status::Closing` (the napi env
    /// is being torn down, typically during `shutdown`).
    #[napi(ts_args_type = "onEvent: (event: DaemonEventJs) => void")]
    pub async fn subscribe_events(
        &self,
        on_event: ThreadsafeFunction<
            DaemonEventJs,
            Unknown<'static>,
            DaemonEventJs,
            Status,
            false,
        >,
    ) -> napi::Result<EventSubscription> {
        let handle = self.daemon_handle().await?;
        let mut rx = handle.subscribe_events(256);
        let task = tokio::spawn(async move {
            while let Some(record) = rx.recv().await {
                let event = DaemonEventJs::from_record(record);
                if on_event.call(event, ThreadsafeFunctionCallMode::NonBlocking) == Status::Closing
                {
                    break;
                }
            }
        });
        Ok(EventSubscription {
            abort: Mutex::new(Some(task.abort_handle())),
        })
    }

    // --- Daemon spaces --------------------------------------------------

    #[napi]
    pub async fn list_spaces(&self, input: ListSpacesInputJs) -> napi::Result<ListSpacesOutputJs> {
        let handle = self.daemon_handle().await?;
        let out = handle
            .list_spaces(daemon_types::ListSpacesInput {
                q: input.q,
                limit: input.limit,
                offset: input.offset,
            })
            .await
            .map_err(to_napi)?;
        Ok(ListSpacesOutputJs {
            spaces: out.spaces.into_iter().map(space_record_to_js).collect(),
            limit: out.limit,
            offset: out.offset,
            next_offset: out.next_offset,
        })
    }

    #[napi]
    pub async fn create_space(
        &self,
        input: CreateSpaceInputJs,
    ) -> napi::Result<CreateSpaceResultJs> {
        let handle = self.daemon_handle().await?;
        let out = handle
            .create_space(daemon_types::CreateSpaceInput {
                space_id: input.space_id,
                display_name: input.display_name,
            })
            .await
            .map_err(to_napi)?;
        Ok(CreateSpaceResultJs {
            space_id: out.space_id,
            owner_peer_id: out.owner_peer_id,
        })
    }

    #[napi]
    pub async fn get_space(&self, space_id: String) -> napi::Result<SpaceRecordJs> {
        let handle = self.daemon_handle().await?;
        let space = handle.get_space(&space_id).await.map_err(to_napi)?;
        Ok(space_record_to_js(space))
    }

    #[napi]
    pub async fn update_space(&self, input: UpdateSpaceInputJs) -> napi::Result<SpaceRecordJs> {
        let handle = self.daemon_handle().await?;
        let space = handle
            .update_space(daemon_types::UpdateSpaceInput {
                space_id: input.space_id,
                display_name: input.display_name,
            })
            .await
            .map_err(to_napi)?;
        Ok(space_record_to_js(space))
    }

    #[napi]
    pub async fn delete_space(&self, space_id: String) -> napi::Result<bool> {
        let handle = self.daemon_handle().await?;
        handle.delete_space(&space_id).await.map_err(to_napi)
    }

    // --- Daemon members -------------------------------------------------

    #[napi]
    pub async fn list_space_members(
        &self,
        space_id: String,
    ) -> napi::Result<Vec<SpaceMemberJs>> {
        let handle = self.daemon_handle().await?;
        let members = handle
            .list_space_members(&space_id)
            .await
            .map_err(to_napi)?;
        Ok(members.into_iter().map(member_to_js).collect())
    }

    #[napi]
    pub async fn list_my_memberships(&self) -> napi::Result<Vec<SpaceMemberJs>> {
        let handle = self.daemon_handle().await?;
        let members = handle.list_my_memberships().await.map_err(to_napi)?;
        Ok(members.into_iter().map(member_to_js).collect())
    }

    /// List bots within `space_id`. Wraps [`DaemonHandle::list_space_bots`].
    /// Returns `SpaceBotJs` (peer + alias + expires_at); status/scopes
    /// follow in later daemon work.
    #[napi]
    pub async fn list_space_bots(
        &self,
        space_id: String,
    ) -> napi::Result<Vec<SpaceBotJs>> {
        let handle = self.daemon_handle().await?;
        let bots = handle
            .list_space_bots(&space_id)
            .await
            .map_err(to_napi)?;
        Ok(bots.into_iter().map(bot_to_js).collect())
    }

    // --- Daemon blobs ---------------------------------------------------

    #[napi]
    pub async fn upload_blob(
        &self,
        input: UploadBlobInputJs,
    ) -> napi::Result<UploadBlobResultJs> {
        let handle = self.daemon_handle().await?;
        let res = handle
            .upload_blob(daemon_types::UploadBlobInput {
                space_id: input.space_id,
                data: input.data.to_vec(),
                mime: input.mime,
                name: input.name,
                doc_id: input.doc_id,
            })
            .await
            .map_err(to_napi)?;
        Ok(UploadBlobResultJs {
            cid: res.cid,
            size: res.size as i64,
            mime: res.mime,
            name: res.name,
        })
    }

    #[napi]
    pub async fn read_blob(
        &self,
        space_id: String,
        cid: String,
    ) -> napi::Result<Option<ReadBlobResultJs>> {
        let handle = self.daemon_handle().await?;
        let res = handle.read_blob(&space_id, &cid).await.map_err(to_napi)?;
        Ok(res.map(|r| ReadBlobResultJs {
            data: Buffer::from(r.data),
            size: r.size as i64,
            mime: r.mime,
        }))
    }

    // --- Daemon pages ---------------------------------------------------

    #[napi]
    pub async fn ensure_page(&self, input: EnsurePageInputJs) -> napi::Result<PageRecordJs> {
        let handle = self.daemon_handle().await?;
        let page = handle
            .ensure_page(daemon_types::EnsurePageInput {
                space_id: input.space_id,
                page_id: input.page_id,
                title: input.title,
                parent_page_ids: input.parent_page_ids,
                created_at_ms: input.created_at_ms,
                updated_at_ms: input.updated_at_ms,
            })
            .await
            .map_err(to_napi)?;
        Ok(page_to_js(page))
    }

    #[napi]
    pub async fn list_pages(&self, space_id: String) -> napi::Result<Vec<PageRecordJs>> {
        let handle = self.daemon_handle().await?;
        let pages = handle.list_pages(&space_id).await.map_err(to_napi)?;
        Ok(pages.into_iter().map(page_to_js).collect())
    }

    #[napi]
    pub async fn update_page_title(
        &self,
        space_id: String,
        page_id: String,
        title: String,
    ) -> napi::Result<Option<PageRecordJs>> {
        let handle = self.daemon_handle().await?;
        let page = handle
            .update_page_title(&space_id, &page_id, &title)
            .await
            .map_err(to_napi)?;
        Ok(page.map(page_to_js))
    }

    #[napi]
    pub async fn set_page_parents(
        &self,
        space_id: String,
        page_id: String,
        parent_page_ids: Vec<String>,
    ) -> napi::Result<Option<PageRecordJs>> {
        let handle = self.daemon_handle().await?;
        let page = handle
            .set_page_parents(&space_id, &page_id, &parent_page_ids)
            .await
            .map_err(to_napi)?;
        Ok(page.map(page_to_js))
    }

    // --- Daemon documents -----------------------------------------------

    #[napi]
    pub async fn upsert_document(&self, input: UpsertDocumentInputJs) -> napi::Result<()> {
        let handle = self.daemon_handle().await?;
        handle
            .upsert_document(daemon_types::UpsertDocumentInput {
                space_id: input.space_id,
                document_id: input.document_id,
                content_json: input.content_json,
                published: input.published,
                updated_at_ms: input.updated_at_ms,
            })
            .await
            .map_err(to_napi)
    }

    #[napi]
    pub async fn get_document(
        &self,
        space_id: String,
        document_id: String,
    ) -> napi::Result<Option<DocumentRecordJs>> {
        let handle = self.daemon_handle().await?;
        let doc = handle
            .get_document(&space_id, &document_id)
            .await
            .map_err(to_napi)?;
        Ok(doc.map(|d| DocumentRecordJs {
            space_id: d.space_id,
            document_id: d.document_id,
            content_json: d.content_json,
            published: d.published,
            updated_at_ms: d.updated_at_ms,
        }))
    }

    // --- Daemon joins ---------------------------------------------------

    #[napi]
    pub async fn join_space(&self, input: JoinSpaceInputJs) -> napi::Result<String> {
        let handle = self.daemon_handle().await?;
        handle
            .join_space(daemon_types::JoinSpaceInput {
                space_id: input.space_id,
                display_name: input.display_name,
                device_name: input.device_name,
                target_peer_id: input.target_peer_id,
                target_multiaddrs: input.target_multiaddrs,
            })
            .await
            .map_err(to_napi)
    }

    #[napi]
    pub async fn list_join_requests(&self) -> napi::Result<Vec<JoinRequestRecordJs>> {
        let handle = self.daemon_handle().await?;
        let reqs = handle.list_join_requests().await.map_err(to_napi)?;
        Ok(reqs
            .into_iter()
            .map(|r| JoinRequestRecordJs {
                request_id: r.request_id,
                space_id: r.space_id,
                subject_peer_id: r.subject_peer_id,
                display_name: r.display_name,
                device_name: r.device_name,
                requested_role: r.requested_role,
                created_at: r.created_at,
            })
            .collect())
    }

    #[napi]
    pub async fn decide_join(
        &self,
        input: DecideJoinInputJs,
    ) -> napi::Result<JoinDecisionRecordJs> {
        let handle = self.daemon_handle().await?;
        let dec = handle
            .decide_join(daemon_types::DecideJoinInput {
                request_id: input.request_id,
                approve: input.approve,
                role: input.role,
                reason: input.reason,
            })
            .await
            .map_err(to_napi)?;
        Ok(JoinDecisionRecordJs {
            decision_id: dec.decision_id,
            space_id: dec.space_id,
            subject_peer_id: dec.subject_peer_id,
            decision: dec.decision,
            reason: dec.reason,
            approved: dec.approved,
            created_at_ms: dec.created_at_ms,
        })
    }

    // --- Daemon revoke --------------------------------------------------

    #[napi]
    pub async fn revoke_space(&self, input: RevokeSpaceInputJs) -> napi::Result<bool> {
        let handle = self.daemon_handle().await?;
        handle
            .revoke_space(daemon_types::RevokeSpaceInput {
                space_id: input.space_id,
                subject_peer_id: input.subject_peer_id,
                reason: input.reason,
            })
            .await
            .map_err(to_napi)
    }

    // --- Daemon discover ------------------------------------------------

    #[napi]
    pub async fn discover_spaces(&self) -> napi::Result<Vec<DiscoveredSpaceJs>> {
        let handle = self.daemon_handle().await?;
        let spaces = handle.discover_spaces().await.map_err(to_napi)?;
        Ok(spaces
            .into_iter()
            .map(|s| DiscoveredSpaceJs {
                space_id: s.space_id,
                display_name: s.display_name,
                tags: s.tags,
            })
            .collect())
    }

    // --- Daemon issuer --------------------------------------------------

    #[napi]
    pub async fn issue_issuer_capability(
        &self,
        input: IssueIssuerCapabilityInputJs,
    ) -> napi::Result<bool> {
        let handle = self.daemon_handle().await?;
        handle
            .issue_issuer_capability(daemon_types::IssueIssuerCapabilityInput {
                space_id: input.space_id,
                target_peer_id: input.target_peer_id,
                expires_at: input.expires_at,
                alias: input.alias,
            })
            .await
            .map_err(to_napi)
    }

    // --- Agent status & models -----------------------------------------

    #[napi]
    pub async fn agent_status(&self) -> napi::Result<AgentStatusJs> {
        let handle = self.agent_handle().await?;
        let status = handle.status().await;
        Ok(AgentStatusJs {
            version: status.version,
            default_chat_model: status.default_chat_model,
            default_embed_model: status.default_embed_model,
            models: status.models.into_iter().map(model_to_js).collect(),
        })
    }

    #[napi]
    pub async fn list_models(&self) -> napi::Result<Vec<ModelInfoJs>> {
        let handle = self.agent_handle().await?;
        Ok(handle.list_models().await.into_iter().map(model_to_js).collect())
    }

    // --- Agent rerank ---------------------------------------------------

    #[napi]
    pub async fn rerank(
        &self,
        query: String,
        candidates: Vec<RerankCandidateJs>,
        top_n: i32,
    ) -> napi::Result<RerankResultJs> {
        let handle = self.agent_handle().await?;
        let res = handle
            .rerank(
                query,
                candidates
                    .into_iter()
                    .map(|c| agent_types::RerankCandidate {
                        id: c.id,
                        text: c.text,
                    })
                    .collect(),
                top_n,
            )
            .await
            .map_err(to_napi)?;
        Ok(RerankResultJs {
            hits: res
                .hits
                .into_iter()
                .map(|h| RerankHitJs {
                    id: h.id,
                    score: h.score as f64,
                })
                .collect(),
        })
    }

    // --- Agent drift ----------------------------------------------------

    #[napi]
    pub async fn resolve_drift(
        &self,
        local: Buffer,
        remote: Buffer,
    ) -> napi::Result<Buffer> {
        let handle = self.agent_handle().await?;
        let merged = handle
            .resolve_drift(local.to_vec(), remote.to_vec())
            .await
            .map_err(to_napi)?;
        Ok(Buffer::from(merged))
    }
}

impl SomaHandle {
    /// Get a cloned in-process handle to the daemon, releasing the inner
    /// lock immediately so concurrent napi calls can proceed.
    async fn daemon_handle(&self) -> napi::Result<DaemonInProcessHandle> {
        let guard = self.inner.lock().await;
        let bundle = guard.as_ref().ok_or_else(|| {
            NapiError::new(Status::GenericFailure, "soma runtime is not running")
        })?;
        Ok(bundle.daemon.handle())
    }

    /// Get a cloned in-process handle to the agent runtime.
    async fn agent_handle(&self) -> napi::Result<AgentInProcessHandle> {
        let guard = self.inner.lock().await;
        let bundle = guard.as_ref().ok_or_else(|| {
            NapiError::new(Status::GenericFailure, "soma runtime is not running")
        })?;
        Ok(bundle.agentd.handle())
    }
}

// --- Mappers --------------------------------------------------------------

fn space_record_to_js(s: daemon_types::SpaceRecord) -> SpaceRecordJs {
    SpaceRecordJs {
        space_id: s.space_id,
        display_name: s.display_name,
        owner_peer_id: s.owner_peer_id,
        created_at: s.created_at,
    }
}

fn member_to_js(m: daemon_types::SpaceMemberRecord) -> SpaceMemberJs {
    SpaceMemberJs {
        space_id: m.space_id,
        peer_id: m.peer_id,
        role: m.role,
        expires_at: m.expires_at,
    }
}

fn bot_to_js(b: daemon_types::SpaceBotRecord) -> SpaceBotJs {
    SpaceBotJs {
        space_id: b.space_id,
        peer_id: b.peer_id,
        expires_at: b.expires_at,
        alias: b.alias,
        status: b.status,
    }
}

fn page_to_js(p: daemon_types::PageRecord) -> PageRecordJs {
    PageRecordJs {
        space_id: p.space_id,
        page_id: p.page_id,
        title: p.title,
        parent_page_ids: p.parent_page_ids,
        created_at_ms: p.created_at_ms,
        updated_at_ms: p.updated_at_ms,
    }
}

fn model_to_js(m: agent_types::ModelInfo) -> ModelInfoJs {
    ModelInfoJs {
        name: m.name,
        path: m.path,
        loaded: m.loaded,
        size_bytes: m.size_bytes.map(|v| v as i64),
    }
}

// ---------------------------------------------------------------------------

/// Start the Soma embedded runtimes (peer + agent) and return a handle that
/// keeps them alive. Both run in the napi-rs tokio runtime owned by this
/// addon; the caller does not provide one.
#[napi]
pub async fn start(config: StartConfig) -> napi::Result<SomaHandle> {
    let daemon_config = build_daemon_config(&config)?;

    let daemon = soma_daemon::run(daemon_config).await.map_err(to_napi)?;

    let agentd = match soma_agentd::run(AgentdConfig::default()).await {
        Ok(h) => h,
        Err(err) => {
            if let Err(shutdown_err) = daemon.shutdown().await {
                tracing::error!(error = %shutdown_err, "rolling back daemon after agentd start failure");
            }
            return Err(to_napi(err));
        }
    };

    Ok(SomaHandle {
        inner: Mutex::new(Some(RuntimeBundle { daemon, agentd })),
    })
}

fn build_daemon_config(config: &StartConfig) -> napi::Result<DaemonConfig> {
    let mut daemon_config = DaemonConfig::default();
    daemon_config.db_path = PathBuf::from(&config.daemon_db_path);
    daemon_config.blob_dir = PathBuf::from(&config.blob_dir);
    if let Some(path) = config.identity_path.as_ref() {
        daemon_config.identity_path = PathBuf::from(path);
    }
    if let Some(addrs) = config.listen_addrs.as_ref() {
        daemon_config.listen_addrs = parse_multiaddrs(addrs, "listen_addrs")?;
    }
    if let Some(addrs) = config.bootstrap_addrs.as_ref() {
        daemon_config.bootstrap_addrs = parse_multiaddrs(addrs, "bootstrap_addrs")?;
    }
    if let Some(addrs) = config.rendezvous_addrs.as_ref() {
        daemon_config.rendezvous_addrs = parse_multiaddrs(addrs, "rendezvous_addrs")?;
    }
    if let Some(addrs) = config.relay_addrs.as_ref() {
        daemon_config.relay_addrs = parse_multiaddrs(addrs, "relay_addrs")?;
    }
    if let Some(enable) = config.enable_mdns {
        daemon_config.enable_mdns = enable;
    }
    Ok(daemon_config)
}

fn parse_multiaddrs(addrs: &[String], field: &str) -> napi::Result<Vec<libp2p::Multiaddr>> {
    addrs
        .iter()
        .enumerate()
        .map(|(idx, s)| {
            libp2p::Multiaddr::from_str(s).map_err(|err| {
                NapiError::new(
                    Status::InvalidArg,
                    format!("invalid multiaddr at {field}[{idx}] ({s:?}): {err}"),
                )
            })
        })
        .collect()
}

fn to_napi<E: std::fmt::Display>(err: E) -> NapiError {
    NapiError::new(Status::GenericFailure, err.to_string())
}

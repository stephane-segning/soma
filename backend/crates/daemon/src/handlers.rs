mod blob_reconcile;
mod document_blob_sync;
mod identify_store;
mod issuer_events;
mod join_decision_persistence;
mod join_events;
mod listen_addr;
mod logging;
mod mailbox_outbox;

pub use blob_reconcile::BlobReconcileHandler;
pub(crate) use document_blob_sync::spawn_document_blob_sync;
pub use identify_store::IdentifyStoreHandler;
pub use issuer_events::IssuerEventsHandler;
pub use join_decision_persistence::JoinDecisionPersistenceHandler;
pub use join_events::JoinEventsHandler;
pub use listen_addr::ListenAddrHandler;
pub use logging::LoggingHandler;
pub use mailbox_outbox::MailboxOutboxHandler;
// The document/roster sync trigger handler moved to `soma-replication`
// (see `crate::sync`'s doc comment) so `somad bot` can drive the same
// logic — it is generic over `soma_replication::SyncContext`, which
// `DaemonState` implements (see `state.rs`).
pub use soma_replication::DocumentSyncHandler;

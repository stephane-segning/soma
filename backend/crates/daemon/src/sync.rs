//! Thin re-export.
//!
//! The replication policy that used to live in this module (and its
//! `documents`/`roster` submodules) moved to `soma-replication`, so
//! `somad bot` — which has no dependency on `soma-daemon` and never
//! will — can link the same providers instead of forking them. This
//! module stays so every in-crate call site (`crate::sync::...`) keeps
//! compiling unchanged; nothing here has different behaviour from
//! before the move.
pub(crate) use soma_replication::{StorageDocumentSync, StorageRosterSync, space_peers};

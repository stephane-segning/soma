//! Plain-typed records returned from [`crate::DaemonHandle`].
//!
//! These mirror the daemon's proto messages but contain no proto/tonic types,
//! making them safe to surface across napi-rs to JavaScript or to call from
//! pure-Rust embedders.

#[derive(Debug, Clone)]
pub struct PageRecord {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct SpaceRecord {
    pub space_id: String,
    pub display_name: String,
    pub owner_peer_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct DocumentRecord {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct BlobMetadataRecord {
    pub space_id: String,
    pub cid: String,
    pub size: u64,
    pub mime: String,
    pub name: String,
    pub created_at_ms: i64,
    pub last_seen_ms: i64,
}

#[derive(Debug, Clone)]
pub struct SpaceMemberRecord {
    pub space_id: String,
    pub peer_id: String,
    pub role: String,
    pub expires_at: i64,
}

/// Bot-shaped read row for `DaemonHandle::list_space_bots`. The Bots tab
/// in Space Settings reads this directly; `alias` is the human label
/// the operator typed into the Add form, persisted alongside the
/// issuer capability.
///
/// `status` is derived at read time:
///   - `"expired"` — `expires_at != 0` and the wall clock has passed it
///   - `"pending"` / `"active"` / `"failed"` — whatever the storage row
///     carries (today every row writes `"active"`; `pending`/`failed`
///     flow in once the handshake protocol lands)
///
/// `scopes` are the operator-typed scope identifiers from the Add form.
/// Stored for forward-looking visibility only — NOT enforced at runtime.
#[derive(Debug, Clone)]
pub struct SpaceBotRecord {
    pub space_id: String,
    pub peer_id: String,
    pub expires_at: i64,
    pub alias: Option<String>,
    pub status: String,
    /// Operator-typed scope identifiers. Empty for pre-migration rows
    /// or when the user left the scopes field blank.
    ///
    /// NOTE: scopes are stored + plumbed only — runtime authorisation
    /// enforcement is NOT yet implemented.
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct DiscoveredSpace {
    pub space_id: String,
    pub display_name: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct CreateSpaceResult {
    pub space_id: String,
    pub owner_peer_id: String,
}

#[derive(Debug, Clone, Default)]
pub struct ListSpacesInput {
    pub q: Option<String>,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone)]
pub struct ListSpacesOutput {
    pub spaces: Vec<SpaceRecord>,
    pub limit: u32,
    pub offset: u32,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct CreateSpaceInput {
    pub space_id: String,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub struct UpdateSpaceInput {
    pub space_id: String,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub struct UploadBlobInput {
    pub space_id: String,
    pub data: Vec<u8>,
    pub mime: String,
    pub name: String,
    /// Optional document id to associate the blob with.
    pub doc_id: String,
}

#[derive(Debug, Clone)]
pub struct UploadBlobResult {
    pub cid: String,
    pub size: u64,
    pub mime: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct ReadBlobResult {
    pub data: Vec<u8>,
    pub size: u64,
    pub mime: String,
}

#[derive(Debug, Clone)]
pub struct EnsurePageInput {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct UpsertDocumentInput {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct JoinSpaceInput {
    pub space_id: String,
    pub display_name: String,
    pub device_name: String,
    pub target_peer_id: String,
    pub target_multiaddrs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct JoinRequestRecord {
    pub request_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub display_name: String,
    pub device_name: String,
    pub requested_role: i32,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct DecideJoinInput {
    pub request_id: String,
    pub approve: bool,
    /// Optional role override ("owner", "issuer", "member", ...). Empty string
    /// means "use the requested role".
    pub role: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct JoinDecisionRecord {
    pub decision_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    /// Numeric proto enum value of `JoinDecisionType` (1 = approved, 2 =
    /// rejected, 3 = blocked).
    pub decision: i32,
    pub reason: String,
    /// True when the decision approved the request and a membership capability
    /// was issued. Provided as a convenience so callers don't have to interpret
    /// the enum.
    pub approved: bool,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct RevokeSpaceInput {
    pub space_id: String,
    pub subject_peer_id: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct IssueIssuerCapabilityInput {
    pub space_id: String,
    pub target_peer_id: String,
    /// Unix-seconds expiration. `0` means no explicit expiration.
    pub expires_at: i64,
    /// Optional human alias used by the Bots-tab list view. Empty /
    /// whitespace-only strings collapse to `None` at the daemon
    /// boundary so the storage layer never holds blank rows.
    pub alias: Option<String>,
    /// Operator-typed scope identifiers from the Add form. Stored and
    /// plumbed through for forward-looking visibility.
    ///
    /// NOTE: scopes are NOT enforced at runtime — that is a separate,
    /// larger PR involving `validate_issuer_capability`.
    pub scopes: Vec<String>,
}

/// Plain-typed snapshot of one entry on the daemon's broadcast event stream.
/// Variants mirror the published `daemon::daemon_event::Event` cases that
/// downstream consumers (Soma renderer, future bot mirroring) care about.
#[derive(Debug, Clone)]
pub enum DaemonEventRecord {
    /// A blob was uploaded with a Yoopta document association.
    DocumentBlobAdded {
        space_id: String,
        doc_id: String,
        cid: String,
        mime: String,
        size: i64,
        name: String,
    },
    /// A `JoinRequest` was sent to a target peer.
    JoinSubmitted {
        request_id: String,
        target_peer_id: String,
    },
    /// A `JoinDecision` was received from a remote decider.
    JoinDecision {
        from_peer_id: String,
        space_id: String,
        /// Numeric proto enum value of `JoinDecisionType`.
        decision: i32,
        reason: String,
    },
    /// The libp2p send of a `JoinRequest` failed.
    JoinFailed {
        target_peer_id: String,
        error: String,
    },
    /// A bot's status changed (issued / handshake completed / expired
    /// / failed). The renderer's Bots tab subscribes and refreshes
    /// the list query for `space_id`.
    BotStatusChanged {
        space_id: String,
        delegate_peer_id: String,
        status: String,
    },
}

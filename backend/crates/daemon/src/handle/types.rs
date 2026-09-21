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
pub struct RevokeIssuerCapabilityInput {
    pub space_id: String,
    pub delegate_peer_id: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct CreateInviteInput {
    pub space_id: String,
    /// Role string ("owner"/"editor"/"viewer"/"member"/"bot"); empty or
    /// unrecognized defaults to "member".
    pub role: String,
    /// Seconds from now until expiry. `0` means "never expires".
    pub ttl_secs: i64,
    /// Optional label for UX (e.g. "Form 4 Maths"). Empty is fine.
    pub label: String,
    /// `false` (the default/recommended choice) makes the invite
    /// redeemable exactly once; `true` allows unlimited redemptions
    /// until revoked or expired. See `soma_membership::invite`'s module
    /// doc comment for the full rationale.
    pub multi_use: bool,
}

#[derive(Debug, Clone)]
pub struct InviteRecord {
    pub space_id: String,
    /// Opaque id `RevokeInviteInput::id` takes back.
    pub id: String,
    /// The full `soma://invite/...` link, ready to share.
    pub link: String,
    pub issuer_peer_id: String,
    pub role: String,
    /// Unix-seconds; `0` means never expires.
    pub expires_at: i64,
    pub label: String,
    pub multi_use: bool,
    pub created_at: i64,
    /// Unix-seconds; `0` means not revoked.
    pub revoked_at: i64,
    pub redeemed_count: i64,
}

#[derive(Debug, Clone)]
pub struct RevokeInviteInput {
    pub space_id: String,
    pub id: String,
}

/// Why an inspected invite link is or isn't usable — mirrors
/// `soma_membership::InviteValidity` one-to-one (kept as a distinct type
/// per this module's "no proto, no soma_membership types" contract; see
/// the module doc comment).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InviteValidity {
    Valid,
    InvalidSignature,
    Expired,
    Malformed,
}

/// Result of decoding + offline-verifying a `soma://invite/...` link.
/// Every field beyond `validity` is `None`/empty precisely when it isn't
/// knowable (e.g. every field but `validity` is absent for a
/// [`InviteValidity::Malformed`] link).
#[derive(Debug, Clone)]
pub struct InviteInspectionRecord {
    pub validity: InviteValidity,
    pub space_id: Option<String>,
    pub space_label: Option<String>,
    pub role: Option<String>,
    /// The verified issuer when `validity == Valid`; the UNVERIFIED
    /// claimed signer otherwise (UI display only — never a trust
    /// decision unless `validity == Valid`).
    pub issuer_peer_id: Option<String>,
    /// Unix-seconds. `None` means "never expires".
    pub expires_at: Option<i64>,
    pub bootstrap_multiaddrs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RedeemInviteInput {
    pub link: String,
    pub display_name: String,
    pub device_name: String,
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
    /// Multiaddrs to dial `target_peer_id` on before sending the offer.
    /// Same shape and purpose as `JoinSpaceInput::target_multiaddrs`.
    ///
    /// A freshly-deployed remote bot has no prior connection to this
    /// peer and (in the common case) no rendezvous config pointing at
    /// it yet, so `PeerCommand::SendIssuerOffer` needs somewhere to
    /// dial — without this, `send_request` can only reach a peer this
    /// process happens to already be connected to or already has
    /// addresses for in its peerstore, and the offer silently sits
    /// until it times out and the row flips to `failed`. May be empty
    /// when the target is already reachable some other way (already
    /// connected, known via mDNS/rendezvous, etc).
    pub target_multiaddrs: Vec<String>,
}

/// Scope-keyed AI provider config overrides, exactly as persisted. Every
/// field is `None` when this scope doesn't override that column —
/// callers resolve "inherit" themselves (space -> default -> the
/// caller's own compiled-in constants; this daemon has no opinion on
/// what those constants are).
///
/// `api_key` carries the real cleartext value and is for **in-process
/// Rust callers only** (e.g. `desktop-agent`'s config resolver, building
/// a Bearer header). It must never be serialized straight onto any
/// client-facing DTO — `desktop-api`'s handlers project it into a
/// `has_api_key: bool` before it ever reaches a Tauri command or HTTP
/// route; see `desktop_api::agent_config`.
#[derive(Debug, Clone, Default)]
pub struct AgentProviderConfigRecord {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub request_timeout_ms: Option<i64>,
    pub poll_interval_ms: Option<i64>,
    /// `None` when this scope has never been saved at all (an all-`None`
    /// row and "no row" are observably identical to every caller, so
    /// both collapse to this one record shape).
    pub updated_at_ms: Option<i64>,
}

/// Whole-state overwrite for the non-secret columns of one scope's AI
/// provider config. `None` on any field clears that column (reverts to
/// inherit) — this is a full replace, not a sparse patch: callers pass
/// every field's desired value on every call, matching an auto-save
/// settings form that always holds the complete state for a scope.
#[derive(Debug, Clone, Default)]
pub struct UpsertAgentProviderConfigInput {
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub request_timeout_ms: Option<i64>,
    /// Only meaningful on the default scope. `DaemonHandle::agent_config_upsert_space`
    /// rejects a call where this is `Some(_)`.
    pub poll_interval_ms: Option<i64>,
}

/// Three-state write for the one column that never round-trips to a
/// client in cleartext. See [`AgentProviderConfigRecord`]'s doc comment.
#[derive(Debug, Clone, Default)]
pub enum ApiKeyWrite {
    /// Don't touch the stored key (if any).
    #[default]
    Unchanged,
    /// Explicitly wipe the stored key. Distinct from `Unchanged` even
    /// though both can observably leave `has_api_key == false` — see
    /// `soma-storage`'s `clearing_the_key_is_distinct_from_never_setting_it` test.
    Clear,
    /// Replace the stored key with this value.
    Set(String),
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

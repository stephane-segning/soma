//! Scope vocabulary for issuer capabilities.
//!
//! Scopes narrow what action a delegated bot may perform on behalf of the
//! space owner.  They are stored in the `issuer_capabilities.scopes` column
//! (added in #92) and enforced at runtime in
//! [`crate::issuer::ensure_can_issue_membership`].
//!
//! # v0 vocabulary
//!
//! Only one scope exists today:
//!
//! - `"issue:membership"` — the bot may auto-approve membership
//!   (join-request) decisions for this space.  This is the only action
//!   `ensure_can_issue_membership` gates, and it is also the only action a
//!   delegated bot can perform in the current implementation.
//!
//! Extending the vocabulary (e.g. `"post:message"`, `"admin:kick"`) is a
//! product/security decision for the maintainer; no new scopes should be
//! added here without deliberate review.
//!
//! # Backward compatibility
//!
//! Pre-#92 rows have a NULL `scopes` column which maps to an empty `Vec` on
//! read.  An **empty scopes vec is treated as "no restriction"** — the
//! capability retains its full pre-scope behaviour.  This prevents a silent
//! regression for any bot that was issued before scopes existed.
//!
//! ## Limitation of empty-as-allow
//!
//! The "empty = allow" rule is pragmatic, not tight. It means an operator
//! running on a much older DB (one that pre-dates #92 and was never written
//! to by a post-#92 daemon) could in principle plant an empty-scopes row
//! and have it treated as fully-scoped. We accept this for v0 because:
//!
//!   * the explicit goal of #98 is forward-looking enforcement, not
//!     retroactive lockdown of in-place rows; and
//!   * all post-#98 write paths (the renderer Bots tab, the daemon's own
//!     issuance helpers, and somad's HTTP `issue`/`import` endpoints)
//!     write an explicit scope, so legitimate new rows can no longer
//!     land with an empty `scopes`.
//!
//! A tighter rule (e.g. "empty is only allowed for rows whose `issued_at`
//! pre-dates a recorded migration timestamp") was considered and deferred —
//! it requires schema work and a per-deployment migration marker. Track
//! this in the cutover-status doc if/when we want to lock it down.
//!
//! # Long-term note (option A)
//!
//! v0 scope enforcement is *local-only*: scopes are read from the daemon's
//! local SQLite row; the signed `IssuerCapability` protobuf does **not**
//! carry a scopes field.  That means a peer that obtains the raw capability
//! bytes (e.g. from a libp2p relay) cannot reproduce the same scope claim —
//! it would be allowed to perform any action the proto's `allowed_roles`
//! field permits, regardless of what the local DB says.
//!
//! The `Bot` role is already privileged; this isn't a security regression
//! from the pre-scope state.  The long-term fix (option A) is to add a
//! `scopes` repeated string field to the `IssuerCapability` proto so that
//! scopes are authenticated by the owner's signature.  That requires a
//! migration of in-flight capabilities and is deferred to a future PR.

/// The bot may auto-approve membership (join-request) decisions for the
/// space.  This is the only scope enforced in the current implementation.
pub const SCOPE_ISSUE_MEMBERSHIP: &str = "issue:membership";

/// Placeholder scope persisted for an `IssuerCapability` that arrived over
/// the wire (inbound issuer-offer ingest -- `persist_inbound_capability` /
/// `issuer_inbound.rs`) and has had no local operator review.
///
/// This is deliberately **not** an empty `Vec` and does **not** contain
/// [`SCOPE_ISSUE_MEMBERSHIP`], so [`crate::issuer::check_issue_membership_scope`]
/// rejects it by default. Empty-means-unrestricted (see the module doc
/// above) is reserved for genuinely pre-#92, LOCALLY owner-authored rows —
/// there the "no restriction" meaning is safe because a local operator
/// (the space owner, on their own machine) made that write. A capability
/// this process just received from a remote peer has had no such local
/// decision made about it at all, so it must fail closed instead of
/// silently inheriting the legacy meaning of empty. An operator can
/// explicitly grant `issue:membership` afterwards through the normal local
/// issuance UI/API once they've reviewed the delegation.
pub const SCOPE_PENDING_REVIEW: &str = "review:required";

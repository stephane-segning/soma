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

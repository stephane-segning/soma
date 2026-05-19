//! Persistent + derived statuses for delegated bot capabilities.
//!
//! The same string values are referenced by the storage layer
//! (`issuer_capabilities.status`), the daemon's `list_space_bots`
//! derivation, the `BotStatusChangedEvent` proto field, the napi
//! wire, and the renderer's `SpaceBotStatus` union. Centralising
//! them here prevents drift as more transitions land (the libp2p
//! handshake protocol introduces `PENDING` / `FAILED`, the expiry
//! scheduler reuses `EXPIRED`).

/// Capability is fully delegated and the bot is acting on behalf of
/// the issuer. Today every successful `issue_issuer_capability` lands
/// here directly — the handshake protocol will gate this behind an
/// ACK from the delegate.
pub const ACTIVE: &str = "active";

/// Capability has been issued but the delegate hasn't ACK'd. Reserved
/// for the libp2p handshake protocol — no code path writes this yet.
pub const PENDING: &str = "pending";

/// Delegate rejected the offer, signature failed, or the handshake
/// timed out. Reserved for the libp2p handshake protocol.
pub const FAILED: &str = "failed";

/// Wall clock has moved past the capability's `expires_at`. Derived
/// at read time by the daemon's `list_space_bots` (and by the
/// renderer as a safety net for tabs open across the transition);
/// never persisted to `issuer_capabilities.status`.
pub const EXPIRED: &str = "expired";

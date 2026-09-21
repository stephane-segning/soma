//! Event payload constants for the renderer ↔ main IPC surface.
//!
//! These match the channel names previously used by the Electron preload
//! bridge (`window.api.onDomainEvent` / `onAgentEvent` / `app:deep-link`).
//! The actual payload shapes are owned by the daemon/agent crates — we keep
//! them as `serde_json::Value` here so the desktop-core crate stays free of
//! soma-daemon transitive deps.

use serde::Serialize;
use specta::Type;

pub const DOMAIN_EVENT: &str = "domain_event";
pub const AGENT_EVENT: &str = "agent_event";
pub const DEEP_LINK_EVENT: &str = "app:deep-link";
/// Native-menu-bar dispatches: payload is the menu-item id (e.g.
/// `menu:new-page`). The renderer's Phase-4 menu router subscribes to this
/// channel and converts each id to its in-app action.
pub const MENU_EVENT: &str = "app:menu-action";

/// A parsed `soma://` deep link, emitted on [`DEEP_LINK_EVENT`] in place
/// of the raw URL string — see `startup::deep_link::dispatch` (the
/// `desktop-app` binary) for the route table that produces this. Unlike
/// [`DOMAIN_EVENT`] / [`AGENT_EVENT`], whose payload shapes are owned by
/// `soma-daemon`/`soma-agentd` and kept out of this dependency-light
/// crate, `DeepLinkRoute` genuinely belongs here: it's OS/URL-routing
/// concern, not a daemon/agent-runtime concept, and keeping it a real
/// type (rather than `serde_json::Value`) is what lets `desktop-app`
/// register it with `tauri-specta` for a properly typed `@soma/sdk`
/// binding.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeepLinkRoute {
    /// `soma://invite/<payload>` — a space invite link. `link` is the
    /// full original URL, ready to pass straight to
    /// `backend.invites.inspect({ link })`.
    Invite { link: String },
    /// Any `soma://...` URL that didn't match a known route — carries the
    /// raw URL so nothing is silently dropped.
    Unknown { url: String },
}

impl DeepLinkRoute {
    /// Parse a raw deep-link URL into a typed route. Pure string
    /// matching — no I/O, no validation of the invite link itself (that
    /// happens later, offline, via `backend.invites.inspect`).
    pub fn parse(url: &str) -> Self {
        if let Some(rest) = url.strip_prefix("soma://invite/")
            && !rest.is_empty()
        {
            return Self::Invite {
                link: url.to_string(),
            };
        }
        Self::Unknown {
            url: url.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_an_invite_link() {
        let route = DeepLinkRoute::parse("soma://invite/AbC123");
        assert_eq!(
            route,
            DeepLinkRoute::Invite {
                link: "soma://invite/AbC123".to_string()
            }
        );
    }

    #[test]
    fn dev_scheme_invite_link_is_unknown_by_this_exact_match() {
        // `soma-dev://` is a DIFFERENT scheme (see
        // `startup::deep_link::configured_schemes`) from the wire format
        // `soma_common::invite_link` actually produces (always
        // `soma://invite/...`, regardless of which OS-registered scheme
        // launched the app) -- so a dev-build launch URL is intentionally
        // routed as `Unknown` here rather than guessed at, and the actual
        // link string is preserved unmodified either way.
        let route = DeepLinkRoute::parse("soma-dev://invite/AbC123");
        assert_eq!(
            route,
            DeepLinkRoute::Unknown {
                url: "soma-dev://invite/AbC123".to_string()
            }
        );
    }

    #[test]
    fn empty_payload_is_unknown_not_a_blank_invite() {
        let route = DeepLinkRoute::parse("soma://invite/");
        assert_eq!(
            route,
            DeepLinkRoute::Unknown {
                url: "soma://invite/".to_string()
            }
        );
    }

    #[test]
    fn unrecognized_path_is_unknown() {
        let route = DeepLinkRoute::parse("soma://something-else");
        assert_eq!(
            route,
            DeepLinkRoute::Unknown {
                url: "soma://something-else".to_string()
            }
        );
    }
}

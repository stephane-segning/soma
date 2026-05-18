//! Internal runtime building blocks shared between the embeddable library
//! entry point (`crate::run`) and the binary shim.

mod bootstrap;
mod helpers;

pub(crate) use bootstrap::DaemonPeerBootstrap;
pub(crate) use helpers::{ensure_default_space, spawn_mailbox_sweeper};

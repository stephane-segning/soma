use std::{sync::Arc, time::Duration};

use soma_core::SomaResult;

use crate::state::DaemonState;
use crate::services::space::SpaceManager;

pub(crate) fn spawn_mailbox_sweeper(state: Arc<DaemonState>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5 * 60)).await;
            soma_membership::outbox::sweep_due(&state.repos, &state.peer_id, &state.peer_commands)
                .await;
        }
    });
}

pub(crate) async fn ensure_default_space(manager: &Arc<dyn SpaceManager>) -> SomaResult<()> {
    const DEFAULT_SPACE_ID: &str = "private";
    const DEFAULT_SPACE_NAME: &str = "Private space";
    manager
        .ensure_owned_space(DEFAULT_SPACE_ID, Some(DEFAULT_SPACE_NAME.to_string()))
        .await
}

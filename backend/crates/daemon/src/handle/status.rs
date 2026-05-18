use super::{DaemonHandle, DaemonStatus};

impl DaemonHandle {
    /// Current peer id + listen addresses.
    pub async fn status(&self) -> DaemonStatus {
        DaemonStatus {
            peer_id: self.state.peer_id.to_string(),
            listen_addrs: self.state.listen_addrs.lock().await.clone(),
        }
    }
}

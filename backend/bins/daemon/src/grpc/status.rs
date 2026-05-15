use soma_proto_build::daemon;
use tonic::{Request, Response, Status};

use super::DaemonService;

impl DaemonService {
    pub(super) async fn status_response(
        &self,
        _request: Request<daemon::StatusRequest>,
    ) -> Result<Response<daemon::StatusResponse>, Status> {
        let addrs = self.state.listen_addrs.lock().await.clone();
        Ok(Response::new(daemon::StatusResponse {
            peer_id: self.state.peer_id.to_string(),
            listen_addrs: addrs,
        }))
    }
}

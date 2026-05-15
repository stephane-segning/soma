use std::path::{Path, PathBuf};

use soma_proto_build::daemon;
use soma_socket::GrpcUnixService;
use tonic::transport::{Server, server::Router as TonicRouter};

use crate::grpc::DaemonService;

pub(super) struct DaemonGrpcService {
    pub(super) socket_path: PathBuf,
    pub(super) svc: daemon::daemon_server::DaemonServer<DaemonService>,
}

impl GrpcUnixService for DaemonGrpcService {
    fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    fn configure(self, mut server: Server) -> TonicRouter {
        server.add_service(self.svc)
    }
}

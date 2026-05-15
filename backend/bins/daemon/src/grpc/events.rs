use std::pin::Pin;

use futures::Stream;
use soma_proto_build::daemon;
use tokio_stream::{StreamExt as TokioStreamExt, wrappers::BroadcastStream};
use tonic::{Request, Response, Status};

use super::DaemonService;

pub(super) type StreamEventsStream =
    Pin<Box<dyn Stream<Item = Result<daemon::DaemonEvent, Status>> + Send + 'static>>;

impl DaemonService {
    pub(super) async fn stream_events_response(
        &self,
        _request: Request<daemon::StreamEventsRequest>,
    ) -> Result<Response<StreamEventsStream>, Status> {
        let stream = BroadcastStream::new(self.state.events.subscribe())
            .filter_map(|msg: Result<daemon::DaemonEvent, _>| msg.ok())
            .map(Ok);
        Ok(Response::new(Box::pin(stream)))
    }
}

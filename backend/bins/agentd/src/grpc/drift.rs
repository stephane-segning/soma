use soma_proto_build::agent;
use tonic::{Request, Response, Status};
use yrs::{Doc, ReadTxn, StateVector, Transact, Update, updates::decoder::Decode};

pub(super) async fn resolve_drift(
    request: Request<agent::ResolveDriftRequest>,
) -> Result<Response<agent::ResolveDriftResponse>, Status> {
    let payload = request.into_inner();
    if payload.left_update.is_empty() {
        return Err(Status::invalid_argument("left_update is required"));
    }
    if payload.right_update.is_empty() {
        return Err(Status::invalid_argument("right_update is required"));
    }

    let merged_update = merge_yjs_updates(&payload.left_update, &payload.right_update)
        .map_err(|err| Status::internal(format!("failed to merge Yjs updates: {err}")))?;

    Ok(Response::new(agent::ResolveDriftResponse { merged_update }))
}

fn merge_yjs_updates(left: &[u8], right: &[u8]) -> Result<Vec<u8>, String> {
    let doc = Doc::new();
    {
        let mut txn = doc.transact_mut();
        let left_update = Update::decode_v1(left).map_err(|err| format!("decode left: {err}"))?;
        txn.apply_update(left_update)
            .map_err(|err| format!("apply left: {err}"))?;
        let right_update =
            Update::decode_v1(right).map_err(|err| format!("decode right: {err}"))?;
        txn.apply_update(right_update)
            .map_err(|err| format!("apply right: {err}"))?;
    }

    let txn = doc.transact();
    Ok(txn.encode_state_as_update_v1(&StateVector::default()))
}

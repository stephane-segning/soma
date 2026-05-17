use soma_core::SomaResult;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update, updates::decoder::Decode};

use super::{AgentHandle, invalid};

impl AgentHandle {
    /// Merge two Yjs update payloads and return the merged state-as-update.
    ///
    /// Both inputs must be non-empty Yjs v1 update binaries. The result is
    /// a v1 update encoding the merged state vector, suitable for
    /// broadcasting back to peers.
    pub async fn resolve_drift(&self, local: Vec<u8>, remote: Vec<u8>) -> SomaResult<Vec<u8>> {
        if local.is_empty() {
            return Err(invalid("left_update is required"));
        }
        if remote.is_empty() {
            return Err(invalid("right_update is required"));
        }

        merge_yjs_updates(&local, &remote)
            .map_err(|err| invalid(format!("failed to merge Yjs updates: {err}")))
    }
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

use std::time::SystemTime;

use libp2p::{Multiaddr, PeerId};
use prost::Message;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::JoinRequest;
use soma_storage::{RepositoryProvider, mailbox::NewMailboxEntry};

use crate::time::epoch_seconds;

pub const MAILBOX_KIND_JOIN_DECISION: &str = "join_decision";
pub const MAILBOX_KIND_JOIN_REQUEST: &str = "join_request";

#[derive(Debug, Clone)]
pub struct OutgoingJoinRequest {
    pub request_id: String,
    pub addrs: Vec<String>,
    pub request: JoinRequest,
}

pub async fn enqueue_outgoing_join_request(
    repos: &dyn RepositoryProvider,
    target_peer_id: &PeerId,
    request_id: &str,
    addrs: &[Multiaddr],
    request: &JoinRequest,
) -> SomaResult<String> {
    let space_id = request
        .space_id
        .as_ref()
        .ok_or_else(|| Error::service("missing request.space_id"))?
        .value
        .clone();
    let now_secs = epoch_seconds(SystemTime::now());
    let id = format!("mbx-joinreq-{}", request_id);

    repos
        .mailbox_repo()
        .enqueue(&NewMailboxEntry {
            id: id.clone(),
            kind: MAILBOX_KIND_JOIN_REQUEST.to_string(),
            space_id: Some(space_id),
            subject_peer_id: Some(target_peer_id.to_string()),
            available_at: now_secs,
            payload: Some(encode_outgoing_join_request_payload(
                request_id, addrs, request,
            )),
            created_at: now_secs,
        })
        .await?;

    Ok(id)
}

pub fn decode_outgoing_join_request_payload(payload: &[u8]) -> SomaResult<OutgoingJoinRequest> {
    let mut idx = 0usize;
    let addr_count = read_u32(payload, &mut idx)? as usize;
    let mut addrs = Vec::with_capacity(addr_count);

    for _ in 0..addr_count {
        let bytes = read_bytes(payload, &mut idx)?;
        addrs.push(String::from_utf8(bytes).map_err(|_| Error::service("invalid addr utf8"))?);
    }

    let request_id = String::from_utf8(read_bytes(payload, &mut idx)?)
        .map_err(|_| Error::service("invalid request_id"))?;
    let req_bytes = read_bytes(payload, &mut idx)?;
    let request = JoinRequest::decode(req_bytes.as_slice()).map_err(Error::service)?;

    Ok(OutgoingJoinRequest {
        request_id,
        addrs,
        request,
    })
}

fn encode_outgoing_join_request_payload(
    request_id: &str,
    addrs: &[Multiaddr],
    request: &JoinRequest,
) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(&(addrs.len() as u32).to_be_bytes());
    for addr in addrs {
        let addr = addr.to_string();
        write_bytes(&mut buf, addr.as_bytes());
    }
    write_bytes(&mut buf, request_id.as_bytes());
    write_bytes(&mut buf, &request.encode_to_vec());
    buf
}

fn write_bytes(buf: &mut Vec<u8>, bytes: &[u8]) {
    buf.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
    buf.extend_from_slice(bytes);
}

fn read_u32(input: &[u8], idx: &mut usize) -> SomaResult<u32> {
    if *idx + 4 > input.len() {
        return Err(Error::service("invalid outbox payload (u32)"));
    }
    let mut bytes = [0u8; 4];
    bytes.copy_from_slice(&input[*idx..*idx + 4]);
    *idx += 4;
    Ok(u32::from_be_bytes(bytes))
}

fn read_bytes(input: &[u8], idx: &mut usize) -> SomaResult<Vec<u8>> {
    let len = read_u32(input, idx)? as usize;
    if *idx + len > input.len() {
        return Err(Error::service("invalid outbox payload (bytes)"));
    }
    let out = input[*idx..*idx + len].to_vec();
    *idx += len;
    Ok(out)
}

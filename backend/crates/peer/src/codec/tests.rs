use super::{JoinCodec, JoinDecisionAck, JoinDecisionCodec};
use crate::join::JoinDecider;
use crate::protocol::{JOIN_DECISION_PROTOCOL, JOIN_PROTOCOL, MAX_JOIN_MESSAGE_BYTES};
use futures::io::Cursor;
use libp2p::request_response::Codec;
use soma_proto_build::space;

fn sample_request() -> space::JoinRequest {
    space::JoinRequest {
        space_id: Some(space::SpaceId {
            value: "space-123".into(),
        }),
        peer_id: Some(space::PeerId {
            value: "peer-abc".into(),
        }),
        display_name: "User".into(),
        device_name: "Device".into(),
        requester_code: String::new(),
        requested_role: space::SpaceRole::Member as i32,
        invite_proof: None,
        created_at: None,
    }
}

#[tokio::test]
async fn join_codec_roundtrip() {
    let mut codec = JoinCodec;
    let mut buf = Cursor::new(Vec::new());
    let req = sample_request();
    let proto = JOIN_PROTOCOL.to_string();

    codec
        .write_request(&proto, &mut buf, req.clone())
        .await
        .expect("write");
    buf.set_position(0);
    let decoded = codec
        .read_request(&proto, &mut buf)
        .await
        .expect("read back join request");
    assert_eq!(decoded.space_id.unwrap().value, "space-123");
    assert_eq!(decoded.peer_id.unwrap().value, "peer-abc");
}

#[tokio::test]
async fn join_decision_codec_roundtrip() {
    let mut codec = JoinDecisionCodec;
    let mut buf = Cursor::new(Vec::new());
    let proto = JOIN_DECISION_PROTOCOL.to_string();

    let decision = space::JoinDecision {
        decision_id: "dec-1".into(),
        space_id: Some(space::SpaceId {
            value: "space-123".into(),
        }),
        subject_peer_id: Some(space::PeerId {
            value: "peer-abc".into(),
        }),
        decision: space::JoinDecisionType::JoinApproved as i32,
        reason: "ok".into(),
        capability: None,
        created_at: None,
    };

    codec
        .write_request(&proto, &mut buf, decision.clone())
        .await
        .expect("write");
    buf.set_position(0);
    let decoded = codec
        .read_request(&proto, &mut buf)
        .await
        .expect("read back join decision");
    assert_eq!(decoded.decision_id, "dec-1");

    let mut buf2 = Cursor::new(Vec::new());
    codec
        .write_response(&proto, &mut buf2, JoinDecisionAck {})
        .await
        .expect("write ack");
    buf2.set_position(0);
    let _ = codec
        .read_response(&proto, &mut buf2)
        .await
        .expect("read ack");
}

#[tokio::test]
async fn join_codec_rejects_oversized() {
    let mut codec = JoinCodec;
    let mut buf = Cursor::new(Vec::new());
    let mut req = sample_request();
    req.display_name = "x".repeat(MAX_JOIN_MESSAGE_BYTES + 1);
    let proto = JOIN_PROTOCOL.to_string();
    codec
        .write_request(&proto, &mut buf, req)
        .await
        .expect("write oversized");
    buf.set_position(0);
    let read_res = codec.read_request(&proto, &mut buf).await;
    assert!(
        read_res.is_err(),
        "oversized message should be rejected on read"
    );
}

#[tokio::test]
async fn reject_join_sets_rejection() {
    let req = sample_request();
    let peer = libp2p::PeerId::random();
    let decision = crate::join::RejectAll.decide(&req, &peer).await;
    assert_eq!(
        decision.decision,
        space::JoinDecisionType::JoinRejected as i32
    );
    assert_eq!(decision.space_id.unwrap().value, "space-123");
    assert_eq!(decision.subject_peer_id.unwrap().value, "peer-abc");
    assert_eq!(decision.reason, "issuer not configured");
}

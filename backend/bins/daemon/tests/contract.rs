//! Contract smoke tests for daemon gRPC surface.
//!
//! These tests verify that the proto-generated types exist and have expected fields.
//! Implementation tests should be done via integration tests that spawn a real daemon.

use soma_proto_build::daemon::{
    CreateSpaceRequest, CreateSpaceResponse, DaemonEvent, DecideJoinRequest, DecideJoinResponse,
    DeleteSpaceRequest, DeleteSpaceResponse, DiscoverSpacesRequest, DiscoverSpacesResponse,
    DocumentBlobAddedEvent, EnsurePageRequest, EnsurePageResponse, GetBlobMetadataRequest,
    GetBlobMetadataResponse, GetDocumentRequest, GetDocumentResponse, GetSpaceRequest,
    GetSpaceResponse, IssueIssuerCapabilityRequest, IssueIssuerCapabilityResponse,
    JoinDecisionEvent, JoinFailedEvent, JoinRequest, JoinSpaceRequest, JoinSpaceResponse,
    JoinSubmitEvent, ListBlobsRequest, ListBlobsResponse, ListJoinRequestsRequest,
    ListJoinRequestsResponse, ListMyMembershipsResponse, ListPagesRequest, ListPagesResponse,
    ListSpaceMembersRequest, ListSpaceMembersResponse, ListSpacesRequest, ListSpacesResponse,
    PageRecord, ReadBlobRequest, ReadBlobResponse, RevokeSpaceRequest, RevokeSpaceResponse,
    SetPageParentsRequest, SetPageParentsResponse, StatusRequest, StatusResponse,
    UpdatePageTitleRequest, UpdatePageTitleResponse, UpdateSpaceRequest, UpdateSpaceResponse,
    UploadBlobRequest, UploadBlobResponse,
};

#[test]
fn status_request_exists() {
    let _req = StatusRequest {};
}

#[test]
fn status_response_has_peer_id() {
    let resp = StatusResponse {
        peer_id: "test-peer".into(),
        listen_addrs: vec![],
    };
    assert_eq!(resp.peer_id, "test-peer");
}

#[test]
fn join_space_request_has_required_fields() {
    let req = JoinSpaceRequest {
        space_id: "space-1".into(),
        display_name: "User".into(),
        device_name: "Device".into(),
        target_peer_id: "peer-1".into(),
        target_multiaddrs: vec!["/ip4/127.0.0.1/tcp/4001".into()],
    };
    assert_eq!(req.space_id, "space-1");
    assert!(!req.target_multiaddrs.is_empty());
}

#[test]
fn join_space_response_has_request_id() {
    let resp = JoinSpaceResponse {
        request_id: "req-123".into(),
    };
    assert_eq!(resp.request_id, "req-123");
}

#[test]
fn daemon_event_has_join_decision_variant() {
    let event = DaemonEvent {
        event: Some(daemon_event::Event::JoinDecision(JoinDecisionEvent {
            from_peer_id: "peer-1".into(),
            decision: None,
        })),
    };
    assert!(matches!(
        event.event,
        Some(daemon_event::Event::JoinDecision(_))
    ));
}

#[test]
fn daemon_event_has_join_submitted_variant() {
    let event = DaemonEvent {
        event: Some(daemon_event::Event::JoinSubmitted(JoinSubmitEvent {
            request_id: "req-1".into(),
            target_peer_id: "peer-1".into(),
        })),
    };
    assert!(matches!(
        event.event,
        Some(daemon_event::Event::JoinSubmitted(_))
    ));
}

#[test]
fn daemon_event_has_join_failed_variant() {
    let event = DaemonEvent {
        event: Some(daemon_event::Event::JoinFailed(JoinFailedEvent {
            target_peer_id: "peer-1".into(),
            error: "timeout".into(),
        })),
    };
    assert!(matches!(
        event.event,
        Some(daemon_event::Event::JoinFailed(_))
    ));
}

#[test]
fn daemon_event_has_document_blob_added_variant() {
    let event = DaemonEvent {
        event: Some(daemon_event::Event::DocumentBlobAdded(
            DocumentBlobAddedEvent {
                space_id: "space-1".into(),
                doc_id: "doc-1".into(),
                cid: "cid-1".into(),
                mime: "image/png".into(),
                size: 1024,
                name: "image.png".into(),
            },
        )),
    };
    assert!(matches!(
        event.event,
        Some(daemon_event::Event::DocumentBlobAdded(_))
    ));
}

#[test]
fn read_blob_response_has_mime_field() {
    let resp = ReadBlobResponse {
        data: vec![1, 2, 3],
        size: 3,
        mime: "application/octet-stream".into(),
    };
    assert_eq!(resp.mime, "application/octet-stream");
}

#[test]
fn upload_blob_request_has_doc_id_for_yoopta() {
    let req = UploadBlobRequest {
        space_id: "space-1".into(),
        data: vec![1, 2, 3],
        mime: "image/png".into(),
        name: "image.png".into(),
        doc_id: "doc-1".into(),
    };
    assert_eq!(req.doc_id, "doc-1");
}

#[test]
fn discover_spaces_request_exists() {
    let _req = DiscoverSpacesRequest {};
}

#[test]
fn issue_issuer_capability_request_exists() {
    let req = IssueIssuerCapabilityRequest {
        space_id: "space-1".into(),
        target_peer_id: "peer-1".into(),
        expires_at: 0,
    };
    assert_eq!(req.space_id, "space-1");
}

#[test]
fn list_join_requests_request_is_empty() {
    let _req = ListJoinRequestsRequest {};
}

#[test]
fn decide_join_request_has_approve_flag() {
    let req = DecideJoinRequest {
        request_id: "req-1".into(),
        approve: true,
        role: "student".into(),
        reason: "".into(),
    };
    assert!(req.approve);
}

#[test]
fn page_record_has_parent_page_ids() {
    let page = PageRecord {
        space_id: "space-1".into(),
        page_id: "page-1".into(),
        title: "Page 1".into(),
        parent_page_ids: vec!["parent-1".into()],
        created_at_ms: 0,
        updated_at_ms: 0,
    };
    assert!(!page.parent_page_ids.is_empty());
}

pub mod daemon_event {
    pub use soma_proto_build::daemon::daemon_event::Event;
}

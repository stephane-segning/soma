#[derive(Clone, Copy)]
pub(super) enum EventKindLabel {
    NewListenAddr,
    ListenerClosed,
    ConnectionEstablished,
    ConnectionError,
    PingOk,
    PingErr,
    IdentifyReceived,
    MdnsDiscovered,
    RendezvousDiscovered,
    RelayReserved,
    RelayCircuitEstablished,
    JoinRequestSubmitted,
    JoinRequestDeliverySubmitted,
    JoinRequestDeliveryAck,
    JoinRequestDeliveryFailed,
    JoinDecision,
    JoinDecisionDeliverySubmitted,
    JoinDecisionDeliveryAck,
    JoinDecisionDeliveryFailed,
    JoinFailed,
    DocumentBlobAdded,
    BlobResponseReceived,
}

impl EventKindLabel {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::NewListenAddr => "new_listen_addr",
            Self::ListenerClosed => "listener_closed",
            Self::ConnectionEstablished => "connection_established",
            Self::ConnectionError => "connection_error",
            Self::PingOk => "ping_ok",
            Self::PingErr => "ping_err",
            Self::IdentifyReceived => "identify_received",
            Self::MdnsDiscovered => "mdns_discovered",
            Self::RendezvousDiscovered => "rendezvous_discovered",
            Self::RelayReserved => "relay_reserved",
            Self::RelayCircuitEstablished => "relay_circuit_established",
            Self::JoinRequestSubmitted => "join_request_submitted",
            Self::JoinRequestDeliverySubmitted => "join_request_delivery_submitted",
            Self::JoinRequestDeliveryAck => "join_request_delivery_ack",
            Self::JoinRequestDeliveryFailed => "join_request_delivery_failed",
            Self::JoinDecision => "join_decision",
            Self::JoinDecisionDeliverySubmitted => "join_decision_delivery_submitted",
            Self::JoinDecisionDeliveryAck => "join_decision_delivery_ack",
            Self::JoinDecisionDeliveryFailed => "join_decision_delivery_failed",
            Self::JoinFailed => "join_failed",
            Self::DocumentBlobAdded => "document_blob_added",
            Self::BlobResponseReceived => "blob_response_received",
        }
    }
}

#[derive(Clone, Copy)]
pub(super) enum JoinDecisionOutcome {
    Approved,
    Rejected,
    Blocked,
    Unspecified,
}

impl JoinDecisionOutcome {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Blocked => "blocked",
            Self::Unspecified => "unspecified",
        }
    }
}

impl From<soma_proto_build::space::JoinDecisionType> for JoinDecisionOutcome {
    fn from(value: soma_proto_build::space::JoinDecisionType) -> Self {
        use soma_proto_build::space::JoinDecisionType::*;

        match value {
            JoinApproved => Self::Approved,
            JoinRejected => Self::Rejected,
            JoinBlocked => Self::Blocked,
            JoinDecisionUnspecified => Self::Unspecified,
        }
    }
}

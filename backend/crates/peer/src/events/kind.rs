use crate::PeerEvent;

/// Compact discriminator for routing peer events to interested handlers.
#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum PeerEventKind {
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
    IssuerOfferAckReceived,
    IssuerOfferDeliveryFailed,
    IssuerOfferReceived,
    YooptaBlobAdded,
    BlobResponseReceived,
}

impl PeerEventKind {
    /// Static list of all kinds (used to size dispatch tables).
    pub const ALL: &'static [PeerEventKind] = &[
        PeerEventKind::NewListenAddr,
        PeerEventKind::ListenerClosed,
        PeerEventKind::ConnectionEstablished,
        PeerEventKind::ConnectionError,
        PeerEventKind::PingOk,
        PeerEventKind::PingErr,
        PeerEventKind::IdentifyReceived,
        PeerEventKind::MdnsDiscovered,
        PeerEventKind::RendezvousDiscovered,
        PeerEventKind::RelayReserved,
        PeerEventKind::RelayCircuitEstablished,
        PeerEventKind::JoinRequestSubmitted,
        PeerEventKind::JoinRequestDeliverySubmitted,
        PeerEventKind::JoinRequestDeliveryAck,
        PeerEventKind::JoinRequestDeliveryFailed,
        PeerEventKind::JoinDecision,
        PeerEventKind::JoinDecisionDeliverySubmitted,
        PeerEventKind::JoinDecisionDeliveryAck,
        PeerEventKind::JoinDecisionDeliveryFailed,
        PeerEventKind::JoinFailed,
        PeerEventKind::IssuerOfferAckReceived,
        PeerEventKind::IssuerOfferDeliveryFailed,
        PeerEventKind::IssuerOfferReceived,
        PeerEventKind::YooptaBlobAdded,
        PeerEventKind::BlobResponseReceived,
    ];

    /// Map a runtime event to its kind for routing.
    pub fn of(event: &PeerEvent) -> Self {
        match event {
            PeerEvent::NewListenAddr { .. } => PeerEventKind::NewListenAddr,
            PeerEvent::ListenerClosed { .. } => PeerEventKind::ListenerClosed,
            PeerEvent::ConnectionEstablished { .. } => PeerEventKind::ConnectionEstablished,
            PeerEvent::ConnectionError { .. } => PeerEventKind::ConnectionError,
            PeerEvent::PingOk { .. } => PeerEventKind::PingOk,
            PeerEvent::PingErr { .. } => PeerEventKind::PingErr,
            PeerEvent::IdentifyReceived { .. } => PeerEventKind::IdentifyReceived,
            PeerEvent::MdnsDiscovered { .. } => PeerEventKind::MdnsDiscovered,
            PeerEvent::RendezvousDiscovered { .. } => PeerEventKind::RendezvousDiscovered,
            PeerEvent::RelayReserved { .. } => PeerEventKind::RelayReserved,
            PeerEvent::RelayCircuitEstablished { .. } => PeerEventKind::RelayCircuitEstablished,
            PeerEvent::JoinRequestSubmitted { .. } => PeerEventKind::JoinRequestSubmitted,
            PeerEvent::JoinRequestDeliverySubmitted { .. } => {
                PeerEventKind::JoinRequestDeliverySubmitted
            }
            PeerEvent::JoinRequestDeliveryAck { .. } => PeerEventKind::JoinRequestDeliveryAck,
            PeerEvent::JoinRequestDeliveryFailed { .. } => PeerEventKind::JoinRequestDeliveryFailed,
            PeerEvent::JoinDecision { .. } => PeerEventKind::JoinDecision,
            PeerEvent::JoinDecisionDeliverySubmitted { .. } => {
                PeerEventKind::JoinDecisionDeliverySubmitted
            }
            PeerEvent::JoinDecisionDeliveryAck { .. } => PeerEventKind::JoinDecisionDeliveryAck,
            PeerEvent::JoinDecisionDeliveryFailed { .. } => {
                PeerEventKind::JoinDecisionDeliveryFailed
            }
            PeerEvent::JoinFailed { .. } => PeerEventKind::JoinFailed,
            PeerEvent::IssuerOfferAckReceived { .. } => PeerEventKind::IssuerOfferAckReceived,
            PeerEvent::IssuerOfferDeliveryFailed { .. } => {
                PeerEventKind::IssuerOfferDeliveryFailed
            }
            PeerEvent::IssuerOfferReceived { .. } => PeerEventKind::IssuerOfferReceived,
            PeerEvent::YooptaBlobAdded { .. } => PeerEventKind::YooptaBlobAdded,
            PeerEvent::BlobResponseReceived { .. } => PeerEventKind::BlobResponseReceived,
        }
    }

    /// Index into a pre-sized dispatch table.
    pub fn index(self) -> usize {
        match self {
            PeerEventKind::NewListenAddr => 0,
            PeerEventKind::ListenerClosed => 1,
            PeerEventKind::ConnectionEstablished => 2,
            PeerEventKind::ConnectionError => 3,
            PeerEventKind::PingOk => 4,
            PeerEventKind::PingErr => 5,
            PeerEventKind::IdentifyReceived => 6,
            PeerEventKind::MdnsDiscovered => 7,
            PeerEventKind::RendezvousDiscovered => 8,
            PeerEventKind::RelayReserved => 9,
            PeerEventKind::RelayCircuitEstablished => 10,
            PeerEventKind::JoinRequestSubmitted => 11,
            PeerEventKind::JoinRequestDeliverySubmitted => 12,
            PeerEventKind::JoinRequestDeliveryAck => 13,
            PeerEventKind::JoinRequestDeliveryFailed => 14,
            PeerEventKind::JoinDecision => 15,
            PeerEventKind::JoinDecisionDeliverySubmitted => 16,
            PeerEventKind::JoinDecisionDeliveryAck => 17,
            PeerEventKind::JoinDecisionDeliveryFailed => 18,
            PeerEventKind::JoinFailed => 19,
            PeerEventKind::IssuerOfferAckReceived => 20,
            PeerEventKind::IssuerOfferDeliveryFailed => 21,
            PeerEventKind::IssuerOfferReceived => 22,
            PeerEventKind::YooptaBlobAdded => 23,
            PeerEventKind::BlobResponseReceived => 24,
        }
    }
}

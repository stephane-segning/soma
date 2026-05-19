use crate::codec::{
    BlobCodec, IssuerCapabilityAck, IssuerOfferCodec, JoinCodec, JoinDecisionAck, JoinDecisionCodec,
};
use crate::protocol::{
    AGENT_PROTOCOL, build_blob_behaviour, build_issuer_offer_behaviour, build_join_behaviour,
    build_join_decision_behaviour,
};
use libp2p::{
    identify, identity, mdns, ping, relay, rendezvous, request_response as reqres,
    swarm::{NetworkBehaviour, behaviour::toggle},
};
use soma_proto_build::space;
use soma_vdfs::{BlobRequest, BlobResponse};

pub(crate) fn build_app_behaviour(
    enable_mdns: bool,
    keypair: identity::Keypair,
    relay_client: relay::client::Behaviour,
) -> AppBehaviour {
    let mdns_behaviour = if enable_mdns {
        Some(
            mdns::tokio::Behaviour::new(mdns::Config::default(), keypair.public().to_peer_id())
                .expect("mdns behaviour"),
        )
    } else {
        None
    };

    AppBehaviour {
        ping: ping::Behaviour::default(),
        identify: identify::Behaviour::new(identify::Config::new(
            AGENT_PROTOCOL.into(),
            keypair.public().clone(),
        )),
        mdns: mdns_behaviour.into(),
        rendezvous: rendezvous::client::Behaviour::new(
            keypair.clone().try_into().expect("to libp2p keypair"),
        ),
        relay_client,
        join: build_join_behaviour(),
        join_decision: build_join_decision_behaviour(),
        issuer_offer: build_issuer_offer_behaviour(),
        blob: build_blob_behaviour(),
    }
}

#[derive(NetworkBehaviour)]
#[behaviour(out_event = "AppEvent")]
pub(crate) struct AppBehaviour {
    pub(crate) ping: ping::Behaviour,
    pub(crate) identify: identify::Behaviour,
    pub(crate) mdns: toggle::Toggle<mdns::tokio::Behaviour>,
    pub(crate) rendezvous: rendezvous::client::Behaviour,
    pub(crate) relay_client: relay::client::Behaviour,
    pub(crate) join: reqres::Behaviour<JoinCodec>,
    pub(crate) join_decision: reqres::Behaviour<JoinDecisionCodec>,
    pub(crate) issuer_offer: reqres::Behaviour<IssuerOfferCodec>,
    pub(crate) blob: reqres::Behaviour<BlobCodec>,
}

#[derive(Debug)]
pub(crate) enum AppEvent {
    Ping(ping::Event),
    Identify(identify::Event),
    Mdns(mdns::Event),
    Rendezvous(rendezvous::client::Event),
    Relay(relay::client::Event),
    Join(reqres::Event<space::JoinRequest, space::JoinDecision>),
    JoinDecision(reqres::Event<space::JoinDecision, JoinDecisionAck>),
    IssuerOffer(reqres::Event<space::IssuerCapability, IssuerCapabilityAck>),
    Blob(reqres::Event<BlobRequest, BlobResponse>),
}

impl From<ping::Event> for AppEvent {
    fn from(event: ping::Event) -> Self {
        AppEvent::Ping(event)
    }
}

impl From<identify::Event> for AppEvent {
    fn from(event: identify::Event) -> Self {
        AppEvent::Identify(event)
    }
}

impl From<mdns::Event> for AppEvent {
    fn from(event: mdns::Event) -> Self {
        AppEvent::Mdns(event)
    }
}

impl From<rendezvous::client::Event> for AppEvent {
    fn from(event: rendezvous::client::Event) -> Self {
        AppEvent::Rendezvous(event)
    }
}

impl From<relay::client::Event> for AppEvent {
    fn from(event: relay::client::Event) -> Self {
        AppEvent::Relay(event)
    }
}

impl From<reqres::Event<space::JoinRequest, space::JoinDecision>> for AppEvent {
    fn from(event: reqres::Event<space::JoinRequest, space::JoinDecision>) -> Self {
        AppEvent::Join(event)
    }
}

impl From<reqres::Event<space::JoinDecision, JoinDecisionAck>> for AppEvent {
    fn from(event: reqres::Event<space::JoinDecision, JoinDecisionAck>) -> Self {
        AppEvent::JoinDecision(event)
    }
}

impl From<reqres::Event<space::IssuerCapability, IssuerCapabilityAck>> for AppEvent {
    fn from(event: reqres::Event<space::IssuerCapability, IssuerCapabilityAck>) -> Self {
        AppEvent::IssuerOffer(event)
    }
}

impl From<reqres::Event<BlobRequest, BlobResponse>> for AppEvent {
    fn from(event: reqres::Event<BlobRequest, BlobResponse>) -> Self {
        AppEvent::Blob(event)
    }
}

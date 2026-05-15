use crate::PeerEvent;
use crate::codec::JoinDecisionAck;
use crate::runtime::RuntimeState;
use libp2p::request_response as reqres;
use soma_proto_build::space;

pub(super) async fn handle_join_event(
    state: &mut RuntimeState,
    event: reqres::Event<space::JoinRequest, space::JoinDecision>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => {
                let decider = state.join_decider.clone();
                let response = decider.decide(&request, &state.peer_id).await;
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .join
                    .send_response(channel, response.clone());
                let _ = state.event_tx.try_send(PeerEvent::JoinDecision {
                    from: state.peer_id,
                    decision: response,
                });
            }
            reqres::Message::Response {
                request_id,
                response,
            } => {
                if let Some((target, delivery_id, client_request_id)) =
                    state.outbound_join_requests.remove(&request_id)
                {
                    let _ = state.event_tx.try_send(PeerEvent::JoinRequestDeliveryAck {
                        target,
                        delivery_id,
                        request_id: client_request_id,
                    });
                }
                let _ = state.event_tx.try_send(PeerEvent::JoinDecision {
                    from: peer,
                    decision: response,
                });
            }
        },
        reqres::Event::OutboundFailure {
            peer,
            request_id,
            error,
            ..
        } => {
            if let Some((_target, delivery_id, client_request_id)) =
                state.outbound_join_requests.remove(&request_id)
            {
                let _ = state
                    .event_tx
                    .try_send(PeerEvent::JoinRequestDeliveryFailed {
                        target: peer,
                        delivery_id,
                        request_id: client_request_id,
                        error: error.to_string(),
                    });
            }
            let _ = state.event_tx.try_send(PeerEvent::JoinFailed {
                target: peer,
                error: error.to_string(),
            });
        }
        reqres::Event::InboundFailure { .. } => {}
        reqres::Event::ResponseSent { .. } => {}
    }
}

pub(super) async fn handle_join_decision_event(
    state: &mut RuntimeState,
    event: reqres::Event<space::JoinDecision, JoinDecisionAck>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => {
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .join_decision
                    .send_response(channel, JoinDecisionAck {});
                let _ = state.event_tx.try_send(PeerEvent::JoinDecision {
                    from: peer,
                    decision: request,
                });
            }
            reqres::Message::Response { request_id, .. } => {
                if let Some((target, delivery_id)) =
                    state.outbound_join_decisions.remove(&request_id)
                {
                    let _ = state
                        .event_tx
                        .try_send(PeerEvent::JoinDecisionDeliveryAck {
                            target,
                            delivery_id,
                        });
                }
            }
        },
        reqres::Event::OutboundFailure {
            peer,
            request_id,
            error,
            ..
        } => {
            if let Some((_target, delivery_id)) = state.outbound_join_decisions.remove(&request_id)
            {
                let _ = state
                    .event_tx
                    .try_send(PeerEvent::JoinDecisionDeliveryFailed {
                        target: peer,
                        delivery_id,
                        error: error.to_string(),
                    });
            } else {
                let _ = state
                    .event_tx
                    .try_send(PeerEvent::JoinDecisionDeliveryFailed {
                        target: peer,
                        delivery_id: "unknown".into(),
                        error: error.to_string(),
                    });
            }
        }
        reqres::Event::InboundFailure { .. } => {}
        reqres::Event::ResponseSent { .. } => {}
    }
}

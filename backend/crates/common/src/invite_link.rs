//! `soma://invite/<payload>` link encoding.
//!
//! **Wire format** (a stable external contract — changing it breaks every
//! previously-shared link):
//!
//! ```text
//! soma://invite/<base64url-no-pad>
//! ```
//!
//! The payload is the CBOR encoding (via `ciborium`, matching this
//! crate's signing-view convention elsewhere in `views.rs`) of
//! [`InviteLinkPayload`], a plain `serde` mirror of the full,
//! ALREADY-SIGNED `InviteState` proto message (`signed` included this
//! time — unlike a `*SigningView` in `views.rs`, this is a full
//! round-trip codec, not a signature-payload derivation that deliberately
//! omits the signature). CBOR was chosen over raw protobuf bytes because
//! this crate already depends on `ciborium` for the signing views, so no
//! second serialization format is introduced; base64url (no padding)
//! keeps the link URL-safe without percent-encoding.
//!
//! Field order in [`InviteLinkPayload`] matches `InviteState`'s proto
//! declaration order; it is not semantically load-bearing (CBOR map keys
//! are named, not positional, unlike the tuple-encoded `*SigningView`
//! types), but keeping it aligned makes the format easy to audit against
//! the `.proto` source.
//!
//! **Decoding never touches the network and never verifies anything** —
//! call [`crate::verify_invite_state`] on the result before trusting any
//! of it. This module is pure encoding, by design, so the invitee's UI
//! can decode+display a link before ever dialling anyone.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{CborSigned, InviteState, PeerId as ProtoPeerId, SpaceId};

use crate::views::TimestampView;

/// Scheme of a Soma invite link (`soma://invite/...`).
pub const INVITE_LINK_SCHEME: &str = "soma";
/// Path segment identifying an invite link within the `soma://` scheme.
pub const INVITE_LINK_PATH: &str = "invite";

#[derive(Serialize, Deserialize)]
struct InviteLinkSigned {
    cbor: Vec<u8>,
    signer_peer_id: String,
    signature: Vec<u8>,
    alg: String,
    signer_public_key: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
struct InviteLinkPayload {
    space_id: String,
    default_role: i32,
    expires_at: Option<TimestampView>,
    bootstrap_multiaddrs: Vec<String>,
    invite_nonce: Vec<u8>,
    space_label: String,
    signed: InviteLinkSigned,
}

/// Encode an already-signed `InviteState` into a `soma://invite/...` link.
///
/// # Errors
/// Returns an error if `state.signed` is `None` — an unsigned invite is
/// never a valid link (see [`crate::sign_invite_state`]).
pub fn encode_invite_link(state: &InviteState) -> SomaResult<String> {
    let signed = state
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("cannot encode an unsigned invite into a link"))?;

    let payload = InviteLinkPayload {
        space_id: state
            .space_id
            .as_ref()
            .map(|s| s.value.clone())
            .unwrap_or_default(),
        default_role: state.default_role,
        expires_at: state.expires_at.as_ref().map(|ts| TimestampView {
            seconds: ts.seconds,
            nanos: ts.nanos,
        }),
        bootstrap_multiaddrs: state.bootstrap_multiaddrs.clone(),
        invite_nonce: state.invite_nonce.clone(),
        space_label: state.space_label.clone(),
        signed: InviteLinkSigned {
            cbor: signed.cbor.clone(),
            signer_peer_id: signed
                .signer_peer_id
                .as_ref()
                .map(|p| p.value.clone())
                .unwrap_or_default(),
            signature: signed.signature.clone(),
            alg: signed.alg.clone(),
            signer_public_key: signed.signer_public_key.clone(),
        },
    };

    let mut bytes = Vec::new();
    ciborium::ser::into_writer(&payload, &mut bytes).map_err(Error::service)?;
    let encoded = URL_SAFE_NO_PAD.encode(bytes);
    Ok(format!(
        "{INVITE_LINK_SCHEME}://{INVITE_LINK_PATH}/{encoded}"
    ))
}

/// Decode a `soma://invite/...` link back into an `InviteState`.
///
/// Pure parsing — does **not** verify the signature or expiry; call
/// [`crate::verify_invite_state`] on the result. Never returns a
/// signature/expiry error, only a "this isn't a well-formed link" one, so
/// callers can distinguish "malformed link" from "well-formed but
/// invalid invite" the way [`crate::verify_invite_state`]'s error variants
/// are meant to be distinguished by their caller.
pub fn decode_invite_link(link: &str) -> SomaResult<InviteState> {
    let prefix = format!("{INVITE_LINK_SCHEME}://{INVITE_LINK_PATH}/");
    let encoded = link
        .strip_prefix(&prefix)
        .ok_or_else(|| Error::service("not a soma invite link"))?;
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| Error::service("invite link is not valid base64url"))?;
    let payload: InviteLinkPayload = ciborium::de::from_reader(bytes.as_slice())
        .map_err(|_| Error::service("invite link payload is not valid CBOR"))?;

    Ok(InviteState {
        space_id: Some(SpaceId {
            value: payload.space_id,
        }),
        default_role: payload.default_role,
        expires_at: payload.expires_at.map(|ts| prost_types::Timestamp {
            seconds: ts.seconds,
            nanos: ts.nanos,
        }),
        bootstrap_multiaddrs: payload.bootstrap_multiaddrs,
        invite_nonce: payload.invite_nonce,
        space_label: payload.space_label,
        signed: Some(CborSigned {
            cbor: payload.signed.cbor,
            signer_peer_id: Some(ProtoPeerId {
                value: payload.signed.signer_peer_id,
            }),
            signature: payload.signed.signature,
            alg: payload.signed.alg,
            signer_public_key: payload.signed.signer_public_key,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sign_invite_state;
    use libp2p::identity::Keypair;
    use prost_types::Timestamp;
    use soma_proto_build::space::SpaceRole;

    fn sample_state() -> InviteState {
        InviteState {
            space_id: Some(SpaceId {
                value: "space-1".into(),
            }),
            default_role: SpaceRole::Member as i32,
            expires_at: Some(Timestamp {
                seconds: 4_102_444_800,
                nanos: 0,
            }),
            bootstrap_multiaddrs: vec!["/ip4/127.0.0.1/tcp/14005".into()],
            invite_nonce: vec![1, 2, 3, 4],
            space_label: "Form 4 Maths".into(),
            signed: None,
        }
    }

    #[test]
    fn link_round_trips_every_field() {
        let owner = Keypair::generate_ed25519();
        let mut state = sample_state();
        sign_invite_state(&mut state, &owner).expect("sign");

        let link = encode_invite_link(&state).expect("encode");
        assert!(link.starts_with("soma://invite/"), "link: {link}");

        let decoded = decode_invite_link(&link).expect("decode");
        assert_eq!(decoded.space_id, state.space_id);
        assert_eq!(decoded.default_role, state.default_role);
        assert_eq!(decoded.expires_at, state.expires_at);
        assert_eq!(decoded.bootstrap_multiaddrs, state.bootstrap_multiaddrs);
        assert_eq!(decoded.invite_nonce, state.invite_nonce);
        assert_eq!(decoded.space_label, state.space_label);
        assert_eq!(decoded.signed, state.signed);
    }

    #[test]
    fn rejects_a_non_invite_url() {
        let err = decode_invite_link("https://example.com/invite/abc").unwrap_err();
        assert!(format!("{err}").contains("not a soma invite link"));
    }

    #[test]
    fn rejects_garbage_after_the_prefix() {
        let err = decode_invite_link("soma://invite/not-valid-base64url!!!").unwrap_err();
        assert!(format!("{err}").contains("base64url") || format!("{err}").contains("CBOR"));
    }

    #[test]
    fn encoding_an_unsigned_state_is_rejected() {
        let state = sample_state();
        let err = encode_invite_link(&state).unwrap_err();
        assert!(format!("{err}").contains("unsigned"));
    }
}

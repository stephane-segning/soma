use std::time::SystemTime;

use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_common::sign_issuer_capability;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{IssuerCapability, SpaceId, SpaceRole};
use soma_storage::RepositoryProvider;

use crate::time::epoch_seconds;

pub async fn issue_issuer_capability_to_storage(
    repos: &dyn RepositoryProvider,
    signer: &Keypair,
    owner_peer_id: &PeerId,
    space_id: &str,
    delegate_peer_id: &PeerId,
    allowed_roles: Vec<SpaceRole>,
    expires_at_secs: Option<i64>,
    alias: Option<String>,
    initial_status: &str,
) -> SomaResult<IssuerCapability> {
    let now = SystemTime::now();
    let now_ts = Timestamp::from(now);
    let now_secs = epoch_seconds(now);

    let mut issuer_cap = IssuerCapability {
        space_id: Some(SpaceId {
            value: space_id.to_string(),
        }),
        issuer_peer_id: Some(soma_proto_build::space::PeerId {
            value: delegate_peer_id.to_string(),
        }),
        allowed_roles: allowed_roles.into_iter().map(|r| r as i32).collect(),
        default_permissions: Vec::new(),
        issued_at: Some(now_ts),
        expires_at: expires_at_secs.map(|secs| Timestamp {
            seconds: secs,
            nanos: 0,
        }),
        max_member_expires_at: None,
        max_issues_per_hour: 0,
        owner_peer_id: Some(soma_proto_build::space::PeerId {
            value: owner_peer_id.to_string(),
        }),
        signed: None,
    };

    sign_issuer_capability(&mut issuer_cap, signer)?;

    repos
        .issuer_repo()
        .upsert(&soma_storage::issuer::IssuerCapability {
            space_id: space_id.to_string(),
            issuer_peer_id: owner_peer_id.to_string(),
            delegate_peer_id: delegate_peer_id.to_string(),
            issued_at: now_secs,
            expires_at: expires_at_secs,
            capability: Some(issuer_cap.encode_to_vec()),
            alias,
            // Caller controls the initial status. The daemon's
            // owner-side issuance path writes `bot_status::PENDING`
            // and transitions on delegate ACK / timeout; somad's
            // server-to-server import handler writes `bot_status::ACTIVE`
            // because it isn't going through the handshake.
            status: initial_status.to_string(),
        })
        .await?;

    Ok(issuer_cap)
}

pub async fn issue_owned_issuer_capability_to_storage(
    repos: &dyn RepositoryProvider,
    signer: &Keypair,
    owner_peer_id: &PeerId,
    space_id: &str,
    delegate_peer_id: &PeerId,
    expires_at_secs: Option<i64>,
    alias: Option<String>,
    initial_status: &str,
) -> SomaResult<IssuerCapability> {
    let space = repos
        .membership_repo()
        .get_space(space_id)
        .await?
        .ok_or_else(|| Error::service("space not found"))?;
    let owns_space = space
        .owner_peer_id
        .as_ref()
        .map(|owner| owner == &owner_peer_id.to_string())
        .unwrap_or(false);
    if !owns_space {
        return Err(Error::service("current peer does not own this space"));
    }

    issue_issuer_capability_to_storage(
        repos,
        signer,
        owner_peer_id,
        space_id,
        delegate_peer_id,
        vec![SpaceRole::Member],
        expires_at_secs,
        alias,
        initial_status,
    )
    .await
}

pub(crate) async fn ensure_can_issue_membership(
    repos: &dyn RepositoryProvider,
    issuer_peer_id: &PeerId,
    space_id: &str,
    role_i32: i32,
) -> SomaResult<()> {
    let issuer = issuer_peer_id.to_string();
    let is_owner = repos
        .membership_repo()
        .get_space(space_id)
        .await?
        .and_then(|space| space.owner_peer_id)
        .map(|owner| owner == issuer)
        .unwrap_or(false);

    if is_owner {
        return Ok(());
    }

    let stored_cap = repos
        .issuer_repo()
        .get(space_id, &issuer)
        .await?
        .ok_or_else(|| Error::service("issuer capability missing for this space"))?;

    if let Some(expires_at) = stored_cap.expires_at {
        if expires_at <= epoch_seconds(SystemTime::now()) {
            return Err(Error::service("issuer capability expired"));
        }
    }

    let bytes = stored_cap
        .capability
        .as_ref()
        .ok_or_else(|| Error::service("issuer capability missing payload"))?;
    let issuer_cap = IssuerCapability::decode(bytes.as_slice())
        .map_err(|_| Error::service("issuer capability decode failed"))?;

    validate_issuer_capability(&issuer_cap, space_id, &issuer, role_i32)
}

pub(crate) fn issuer_cap_valid(
    cap: &IssuerCapability,
    space_id: &str,
    issuer_peer_id: &PeerId,
    requested_role: SpaceRole,
    now_secs: i64,
) -> bool {
    let issuer = issuer_peer_id.to_string();
    let space_ok = cap
        .space_id
        .as_ref()
        .map(|space| space.value.as_str() == space_id)
        .unwrap_or(false);
    let issuer_ok = cap
        .issuer_peer_id
        .as_ref()
        .map(|peer| peer.value.as_str() == issuer.as_str())
        .unwrap_or(false);
    let not_expired = cap
        .expires_at
        .as_ref()
        .map(|ts| ts.seconds > now_secs)
        .unwrap_or(true);
    let role_ok = cap.allowed_roles.is_empty()
        || cap
            .allowed_roles
            .iter()
            .any(|role| *role == requested_role as i32);

    space_ok && issuer_ok && not_expired && role_ok
}

fn validate_issuer_capability(
    issuer_cap: &IssuerCapability,
    space_id: &str,
    issuer: &str,
    role_i32: i32,
) -> SomaResult<()> {
    let cap_space = issuer_cap
        .space_id
        .as_ref()
        .map(|space| space.value.clone())
        .unwrap_or_default();
    if cap_space != space_id {
        return Err(Error::service("issuer capability space mismatch"));
    }

    let cap_delegate = issuer_cap
        .issuer_peer_id
        .as_ref()
        .map(|peer| peer.value.clone())
        .unwrap_or_default();
    if cap_delegate != issuer {
        return Err(Error::service("issuer capability delegate mismatch"));
    }

    let cap_owner = issuer_cap
        .owner_peer_id
        .as_ref()
        .map(|peer| peer.value.clone())
        .unwrap_or_default();
    let signed_by = issuer_cap
        .signed
        .as_ref()
        .and_then(|signed| signed.signer_peer_id.as_ref())
        .map(|peer| peer.value.clone())
        .unwrap_or_default();
    if cap_owner.is_empty() || signed_by != cap_owner {
        return Err(Error::service(
            "issuer capability signer does not match owner",
        ));
    }

    if !issuer_cap.allowed_roles.is_empty() && !issuer_cap.allowed_roles.contains(&role_i32) {
        return Err(Error::service(
            "issuer capability does not allow requested role",
        ));
    }

    Ok(())
}

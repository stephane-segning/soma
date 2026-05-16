use std::time::SystemTime;

use libp2p::{
    PeerId,
    identity::{Keypair, PublicKey},
};
use prost::Message;
use soma_common::{sign_space_genesis_artifact, space_genesis_signing_payload};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{self, SpaceGenesisArtifact};
use soma_storage::{
    RepositoryProvider,
    membership::{MembershipRepository, Space},
};

use crate::time::epoch_seconds;

pub async fn create_space(
    repos: &dyn RepositoryProvider,
    owner_peer_id: &PeerId,
    space_id: &str,
    display_name: Option<String>,
) -> SomaResult<()> {
    repos
        .membership_repo()
        .upsert_space(&Space {
            space_id: space_id.to_string(),
            display_name,
            owner_peer_id: Some(owner_peer_id.to_string()),
            created_at: epoch_seconds(SystemTime::now()),
        })
        .await
}

pub async fn create_space_with_genesis(
    repos: &dyn RepositoryProvider,
    owner_keypair: &Keypair,
    space_id: &str,
    display_name: Option<String>,
) -> SomaResult<SpaceGenesisArtifact> {
    create_space_with_genesis_in_repo(
        repos.membership_repo().as_ref(),
        owner_keypair,
        space_id,
        display_name,
    )
    .await
}

async fn create_space_with_genesis_in_repo(
    repo: &dyn MembershipRepository,
    owner_keypair: &Keypair,
    space_id: &str,
    display_name: Option<String>,
) -> SomaResult<SpaceGenesisArtifact> {
    let created_at = epoch_seconds(SystemTime::now());
    let genesis =
        build_space_genesis_artifact(owner_keypair, space_id, display_name.clone(), created_at)?;

    repo.upsert_space(&Space {
        space_id: space_id.to_string(),
        display_name,
        owner_peer_id: Some(owner_keypair.public().to_peer_id().to_string()),
        created_at,
    })
    .await?;
    repo.upsert_space_genesis(space_id, genesis.encode_to_vec())
        .await?;

    Ok(genesis)
}

pub fn build_space_genesis_artifact(
    owner_keypair: &Keypair,
    space_id: &str,
    display_name: Option<String>,
    created_at: i64,
) -> SomaResult<SpaceGenesisArtifact> {
    let mut genesis = SpaceGenesisArtifact {
        space_id: Some(space::SpaceId {
            value: space_id.to_string(),
        }),
        owner_peer_id: Some(space::PeerId {
            value: owner_keypair.public().to_peer_id().to_string(),
        }),
        display_name,
        created_at: Some(prost_types::Timestamp {
            seconds: created_at,
            nanos: 0,
        }),
        signed: None,
    };
    sign_space_genesis_artifact(&mut genesis, owner_keypair)?;
    Ok(genesis)
}

pub fn verify_space_genesis_artifact(
    genesis: &SpaceGenesisArtifact,
    owner_public_key: &PublicKey,
) -> SomaResult<()> {
    let owner_peer_id = owner_public_key.to_peer_id().to_string();
    let artifact_owner = genesis
        .owner_peer_id
        .as_ref()
        .map(|peer| peer.value.as_str())
        .ok_or_else(|| Error::service("space genesis missing owner"))?;
    if artifact_owner != owner_peer_id {
        return Err(Error::service(
            "space genesis owner does not match public key",
        ));
    }

    let signed = genesis
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("space genesis missing signature"))?;
    let signed_peer_id = signed
        .signer_peer_id
        .as_ref()
        .map(|peer| peer.value.as_str())
        .unwrap_or_default();
    if signed_peer_id != owner_peer_id {
        return Err(Error::service("space genesis signer does not match owner"));
    }

    if !owner_public_key.verify(&signed.cbor, &signed.signature) {
        return Err(Error::service(
            "space genesis signature verification failed",
        ));
    }

    let expected = space_genesis_signing_payload(genesis)?;
    if signed.cbor != expected {
        return Err(Error::service("space genesis payload mismatch"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use soma_storage::membership::{JoinDecision, JoinRequest, SpaceMembership};
    use std::sync::Mutex;

    #[test]
    fn genesis_verifies_with_owner_key() {
        let owner = Keypair::generate_ed25519();
        let genesis =
            build_space_genesis_artifact(&owner, "space-1", Some("Maths".to_string()), 42)
                .expect("genesis");

        verify_space_genesis_artifact(&genesis, &owner.public()).expect("verify");
    }

    #[test]
    fn genesis_rejects_tampered_fields() {
        let owner = Keypair::generate_ed25519();
        let mut genesis =
            build_space_genesis_artifact(&owner, "space-1", Some("Maths".to_string()), 42)
                .expect("genesis");

        genesis.display_name = Some("Physics".to_string());

        let err = verify_space_genesis_artifact(&genesis, &owner.public())
            .expect_err("tampering should fail");
        assert!(
            format!("{err}").contains("payload mismatch"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn genesis_rejects_wrong_owner_key() {
        let owner = Keypair::generate_ed25519();
        let other = Keypair::generate_ed25519();
        let genesis = build_space_genesis_artifact(&owner, "space-1", None, 42).expect("genesis");

        let err = verify_space_genesis_artifact(&genesis, &other.public())
            .expect_err("wrong key should fail");
        assert!(
            format!("{err}").contains("owner does not match"),
            "unexpected error: {err}"
        );
    }

    #[tokio::test]
    async fn create_space_with_genesis_persists_signed_artifact() {
        let repo = RecordingMembershipRepo::default();
        let owner = Keypair::generate_ed25519();

        let genesis =
            create_space_with_genesis_in_repo(&repo, &owner, "space-1", Some("Maths".to_string()))
                .await
                .expect("create space");

        verify_space_genesis_artifact(&genesis, &owner.public()).expect("verify");

        let stored = repo
            .space
            .lock()
            .expect("space lock")
            .clone()
            .expect("space");
        assert_eq!(stored.space_id, "space-1");
        assert_eq!(
            stored.owner_peer_id,
            Some(owner.public().to_peer_id().to_string())
        );
        let stored_genesis = SpaceGenesisArtifact::decode(
            repo.get_space_genesis("space-1")
                .await
                .expect("get genesis")
                .expect("stored genesis")
                .as_slice(),
        )
        .expect("decode genesis");
        verify_space_genesis_artifact(&stored_genesis, &owner.public()).expect("verify stored");
    }

    #[derive(Default)]
    struct RecordingMembershipRepo {
        space: Mutex<Option<Space>>,
        genesis: Mutex<Option<Vec<u8>>>,
    }

    #[async_trait]
    impl MembershipRepository for RecordingMembershipRepo {
        async fn upsert_space(&self, space: &Space) -> SomaResult<()> {
            *self.space.lock().expect("space lock") = Some(space.clone());
            Ok(())
        }

        async fn upsert_space_genesis(&self, _space_id: &str, genesis: Vec<u8>) -> SomaResult<()> {
            *self.genesis.lock().expect("genesis lock") = Some(genesis);
            Ok(())
        }

        async fn get_space_genesis(&self, _space_id: &str) -> SomaResult<Option<Vec<u8>>> {
            Ok(self.genesis.lock().expect("genesis lock").clone())
        }

        async fn get_space(&self, _space_id: &str) -> SomaResult<Option<Space>> {
            Ok(self.space.lock().expect("space lock").clone())
        }

        async fn list_spaces(
            &self,
            _owner_peer_id: Option<&str>,
            _query: Option<&str>,
            _created_after: Option<i64>,
            _created_before: Option<i64>,
            _limit: u32,
            _offset: u32,
        ) -> SomaResult<Vec<Space>> {
            Ok(self
                .space
                .lock()
                .expect("space lock")
                .clone()
                .into_iter()
                .collect())
        }

        async fn delete_space(&self, _space_id: &str) -> SomaResult<u64> {
            Ok(0)
        }

        async fn upsert_membership(&self, _membership: &SpaceMembership) -> SomaResult<()> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn delete_membership(
            &self,
            _space_id: &str,
            _subject_peer_id: &str,
        ) -> SomaResult<u64> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn get_membership(
            &self,
            _space_id: &str,
            _subject_peer_id: &str,
        ) -> SomaResult<Option<SpaceMembership>> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn list_memberships(&self, _space_id: &str) -> SomaResult<Vec<SpaceMembership>> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn list_memberships_by_subject(
            &self,
            _subject_peer_id: &str,
        ) -> SomaResult<Vec<SpaceMembership>> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn record_join_decision(&self, _decision: &JoinDecision) -> SomaResult<()> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn latest_join_decision(
            &self,
            _space_id: &str,
            _subject_peer_id: &str,
        ) -> SomaResult<Option<JoinDecision>> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn upsert_join_request(&self, _req: &JoinRequest) -> SomaResult<()> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn delete_join_request(&self, _request_id: &str) -> SomaResult<u64> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn get_join_request(&self, _request_id: &str) -> SomaResult<Option<JoinRequest>> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn list_join_requests(&self) -> SomaResult<Vec<JoinRequest>> {
            unimplemented!("not needed for space genesis tests")
        }

        async fn list_join_requests_filtered(
            &self,
            _target_peer_id: Option<&str>,
            _is_outgoing: Option<bool>,
            _limit: Option<u32>,
            _offset: Option<u32>,
        ) -> SomaResult<Vec<JoinRequest>> {
            unimplemented!("not needed for space genesis tests")
        }
    }
}

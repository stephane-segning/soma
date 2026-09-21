-- Space invite links: owner-signed, self-contained soma://invite/<payload>
-- credentials (see soma_common::invite_link + soma_membership::invite).
-- One row per issued invite, keyed by the invite's own random nonce so a
-- decider can determine "did I myself issue this?" purely from local
-- state -- mirrors issuer_capabilities' role as the local ground truth
-- for delegation (see join_decider::storage::self_issued_delegate_role).
--
-- `redeemed_count` + `multi_use` implement replay protection:
-- InviteRepository::try_consume's single guarded UPDATE (WHERE multi_use
-- = 1 OR redeemed_count = 0) makes a single-use invite (the default)
-- atomically consumable exactly once, even under concurrent redemption
-- attempts; a multi-use invite has no redemption ceiling and is closed
-- only by `revoked_at` or `expires_at`.
--
-- `invite_nonce` is TEXT (base64url of the nonce bytes), not BLOB, so it
-- matches every other id-shaped column already in this schema.
CREATE TABLE IF NOT EXISTS invites (
    space_id TEXT NOT NULL,
    invite_nonce TEXT NOT NULL,
    issuer_peer_id TEXT NOT NULL,
    default_role TEXT NOT NULL,
    expires_at INTEGER,
    label TEXT,
    multi_use INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER,
    redeemed_count INTEGER NOT NULL DEFAULT 0,
    state BLOB NOT NULL,
    PRIMARY KEY (space_id, invite_nonce)
);

CREATE INDEX IF NOT EXISTS idx_invites_space ON invites(space_id);

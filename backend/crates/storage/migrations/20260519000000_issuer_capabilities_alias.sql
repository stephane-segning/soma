-- Capability records grow an optional `alias` column so the Bots tab in
-- Space Settings can show the human-chosen name the user typed into the
-- Add form (instead of a `bot-<peerSuffix>` placeholder synthesised on
-- the renderer side). Nullable: pre-migration rows survive without
-- backfill, and the alias is purely a UX label — authz still keys on
-- (space_id, delegate_peer_id).
ALTER TABLE issuer_capabilities ADD COLUMN alias TEXT;

-- Track whether a join request is outgoing (initiated by this peer) or incoming (needs this peer's approval).
ALTER TABLE join_requests ADD COLUMN is_outgoing INTEGER NOT NULL DEFAULT 0;

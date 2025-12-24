# ADR-0004: Extract a dedicated VDFS crate (blob CAS + fetch-by-CID)

## Context

Soma’s “blob CAS” implementation is currently duplicated:

- `backend/bins/daemon/src/blob_store.rs`
- `backend/bins/botd/src/blob_cache.rs`

Meanwhile, the peer runtime (`backend/crates/peer/src/lib.rs`) defines the `BlobProvider` boundary and the `/soma/blob/1` protocol types. This makes it harder to:

- reuse the CAS implementation in other projects,
- keep hashing/layout rules consistent across binaries,
- evolve the blob protocol without touching multiple unrelated crates.

## Decision

Create a dedicated crate for the minimal “VDFS” surface (blob CAS + fetch-by-CID primitives), and make `soma-peer` depend on it.

The crate will intentionally stay narrow (no virtual filesystem mapping).

## Consequences

Positive:

- One canonical CID + layout implementation shared by daemon/bot (and other projects).
- Cleaner boundaries: `soma-peer` focuses on libp2p wiring; the VDFS crate focuses on CAS rules.
- Reduced duplication and drift.

Negative / follow-ups:

- Requires a small refactor to move `BlobProvider` and blob protocol types out of `soma-peer`.
- May need a short compatibility phase while consumers migrate.


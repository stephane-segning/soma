# ADR-0004: Extract a dedicated blob CAS crate (historical `soma-vdfs` naming)

## Context

Soma’s “blob CAS” implementation used to be duplicated in the daemon and bot binaries. It is now shared via `soma-vdfs`:

- `soma_vdfs::fs::FsBlobStore` (`backend/crates/vdfs/src/fs.rs`)

Meanwhile, the peer runtime (`backend/crates/peer/src/lib.rs`) defines the `BlobProvider` boundary and the `/soma/blob/1` protocol types. This makes it harder to:

- reuse the CAS implementation in other projects,
- keep hashing/layout rules consistent across binaries,
- evolve the blob protocol without touching multiple unrelated crates.

## Decision

Create (and use) a dedicated crate for the minimal blob CAS surface (blob CAS + fetch-by-CID primitives), and make `soma-peer` depend on it.

The crate will intentionally stay narrow (no virtual filesystem mapping).

## Consequences

Positive:

- One canonical CID + layout implementation shared by daemon/bot (and other projects).
- Cleaner boundaries: `soma-peer` focuses on libp2p wiring; the historical `soma-vdfs` crate focuses on CAS rules.
- Reduced duplication and drift.

Negative / follow-ups:

- Requires a small refactor to move `BlobProvider` and blob protocol types out of `soma-peer`.
- May need a short compatibility phase while consumers migrate.

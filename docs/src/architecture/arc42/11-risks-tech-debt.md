# 11. Risks and Technical Debt

This page tracks known architectural risks and “next refactor” items.

## Security risks / follow-ups

- **Canonical signing format**: current signing uses CBOR but canonicalization is not guaranteed across implementations/versions; this is a prerequisite for robust cross-version signature verification.
- **Signature verification completeness**: ensure membership and issuer delegation chains are verified consistently on receipt (not just on issuance).
- **Mode-gated HTTP auth**: `soma-botd` admin mode must remain authenticated/authorized; keep bot mode read-only.

## Networking and protocols

- **Large blob support**: blob transfer is currently a single request/response message with size limits; implement chunking/streaming for larger assets.
- **Multi-target join submission**: requesters should try multiple candidate approvers to avoid hard dependency on a single online peer.
- **Permission-gated blob downloads**: tighten authorization for blob fetch based on membership/permissions.

## Storage

- **Repository consolidation**: keep SQLx queries behind repositories; avoid leaking SQL into controllers.
- **Schema evolution**: maintain forward-compatible migrations and document how new tables are introduced.

## Product/UX

- **Discovery UX**: improve “what peers can I join?” surfacing, especially in mixed LAN/WAN environments.
- **Operational UX**: provide better local commands or UI for inspecting peer connectivity and join status.

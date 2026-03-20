# ADR-0002: Space membership via capabilities

## Context
We need secure space membership without accounts or central auth.

## Decision
Use **cryptographically signed capabilities**:
- MembershipCapability for access
- IssuerCapability for delegation to bots

Identity is based on PeerId, not usernames.

## Consequences
+ Offline-capable
+ No password handling
+ Strong security model
− Requires careful signature verification


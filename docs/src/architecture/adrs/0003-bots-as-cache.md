# ADR-0003: Bots as space cache and onboarding agents

## Context
Members may be offline or remote. Resources should remain available.

## Decision
Introduce **bot peers**:
- read-only
- cache blobs and docs
- serve as stable seeds
- optionally issue memberships when delegated

Bots are explicit space members and can be removed by space owners.

## Consequences
+ Excellent availability
+ Clear trust model
+ Works on LAN and WAN
− Requires cache management and revocation logic


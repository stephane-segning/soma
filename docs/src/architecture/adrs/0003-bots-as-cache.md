# ADR-0003: Bots as class cache and onboarding agents

## Context
Students may be offline or remote. Resources should remain available.

## Decision
Introduce **bot peers**:
- read-only
- cache blobs and docs
- serve as stable seeds
- optionally issue memberships when delegated

Bots are explicit class members and can be removed by teachers.

## Consequences
+ Excellent availability
+ Clear trust model
+ Works on LAN and WAN
− Requires cache management and revocation logic


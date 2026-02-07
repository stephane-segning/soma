# Plan 05: Space Enrollment + Settings MVP

Goal: ship a minimal but complete space-management experience in the Soma desktop UI using existing daemon join/membership RPCs.

## Scope

- ~~`/settings`~~
  - ~~List current memberships/spaces~~
  - ~~Join a space (submit join request)~~
  - ~~Quit a space (self-revoke membership)~~
- ~~`/spaces/:spaceId/settings`~~
  - ~~Pending join approvals for that space~~
  - ~~Member board (role + expiry)~~
  - ~~Minimal permission action: revoke member~~

## Existing backend surface (already in daemon)

- `JoinSpace`, `ListJoinRequests`, `DecideJoin`, `RevokeSpace`, `ListMyMemberships`
- `ListSpaceMembers`, `GetSpace`, `ListSpaces`

## Implementation steps

1) ~~Main-process bridge (daemon client + IPC)~~
- ~~Add methods in `desktop/soma/src/main/services/daemon-client.ts`:~~
  - ~~`joinSpace`~~
  - ~~`listJoinRequests`~~
  - ~~`decideJoin`~~
  - ~~`revokeSpace`~~
  - ~~`listMyMemberships`~~
- ~~Expose new IPC commands in `desktop/soma/src/main/command-registry.ts` via `SpacesController`.~~
- ~~Add corresponding controller methods in `desktop/soma/src/main/controllers/spaces-controller.ts`.~~

2) ~~Renderer data layer~~
- ~~Add new service calls in `desktop/soma/src/renderer/src/services/spaces-service.ts`.~~
- ~~Add RTK Query endpoints + tags in `desktop/soma/src/renderer/src/store/api.ts`.~~
- ~~Extend `desktop/soma/src/renderer/src/queries/spaces.ts` with hooks/mutations for:~~
  - ~~list my memberships~~
  - ~~join space~~
  - ~~list/decide join requests~~
  - ~~revoke space member~~

3) ~~`/settings` MVP UI~~
- ~~Keep existing agent settings.~~
- ~~Add a “Space Access” section:~~
  - ~~membership list with space name/id + role + expiry~~
  - ~~join form (`spaceId`, `targetPeerId`, `targetMultiaddrs`, optional display/device names)~~
  - ~~quit button per membership (self-revoke)~~

4) ~~`/spaces/:spaceId/settings` MVP UI~~
- ~~Keep existing workspace model overrides.~~
- ~~Add space-centric section:~~
  - ~~pending requests filtered by `spaceId`~~
  - ~~approve/reject actions (`DecideJoin`) with optional role override~~
  - ~~member board and revoke action (`RevokeSpace`)~~

5) Validation
- ~~Typecheck Soma package.~~
- Manual smoke:
  - submit join request from `/settings`
  - approve/reject from `/spaces/:spaceId/settings`
  - revoke member and confirm member list refresh.

## Validation notes

- `pnpm --filter soma run typecheck` still fails due to pre-existing type errors in `desktop/soma/src/renderer/src/components/app-error-boundary.tsx` (unrelated to this MVP work).

## Out of scope for MVP

- Full issuer delegation lifecycle UI
- Discover spaces UX
- Fine-grained permission editor beyond revoke
- Cross-peer revocation cryptographic propagation redesign

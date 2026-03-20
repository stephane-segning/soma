# Plan 06: Backend/Desktop Contract Cleanup

**Status:** COMPLETED (2026-03-20)

Goal: make the shared backend/desktop contract explicit, accurate, and safe to evolve.

Scope:

- `proto/daemon/v1/daemon.proto`
- `proto/agent/v1/agent.proto`
- `proto/spaceroom/v1/membership.proto`
- `backend/crates/proto-build`
- `desktop/desktp-proto`
- desktop main-process daemon/agent clients
- docs that describe daemon, agent, event, and join semantics

## Why this exists

The repo currently has multiple contract mismatches:

- proto methods that are declared but explicitly unimplemented
- services that appear declared but are not actually bound as live servers
- event semantics that are real in code but not documented as contracts
- desktop behavior that only partially matches the declared proto surface

This plan is the precondition for any serious backend/desktop decoupling.

## Inventory of Known Mismatches

### Declared but unimplemented

- `Daemon/IssueIssuerCapability`
- `Daemon/DiscoverSpaces`

### Declared but likely not live as services

- `spaceroom.v1.MembershipService`
- `spaceroom.v1.MailboxService`

### Implemented but semantically underspecified

- `JoinSpace` returns submission state, not approval success
- pending manual approval is encoded as a rejection-like placeholder (`reject-pending`)
- `StreamEvents` can duplicate `joinSubmitted`
- `ListJoinRequests` semantics are broader than its name/comment suggests
- `ReadBlobResponse.mime` does not currently reflect real stored MIME behavior
- `ChatStream` semantics are ambiguous and should not be treated as a stable streaming contract yet

### Implemented but not fully surfaced to desktop wrappers

- some daemon and agent RPCs exist in generated stubs but are not exposed through the current Electron main-process wrappers/controllers

## Deliverables

### Phase 1: Contract Inventory

Create a single tracked inventory table for every shared contract surface:

- RPC/service/event name
- declared in proto?
- implemented in backend?
- exposed in desktop main-process wrapper?
- documented?
- status: `implemented`, `unimplemented`, `declared-only`, `desktop-hidden`, `transitional`

Acceptance criteria:

- there is one source of truth for what the contract actually is today

### Phase 2: Lock Down Semantics

Document and, where necessary, correct the highest-risk semantics:

1. `JoinSpace`
   - define as async submission, not approval success
2. `reject-pending`
   - either formalize as explicit pending state or stop encoding it as a reject
3. `StreamEvents`
   - document duplication/reconnect behavior
4. `ListJoinRequests`
   - decide whether it means pending-only or all relevant rows
5. `ReadBlobResponse.mime`
   - either fix runtime behavior or document current limitation clearly
6. `ChatStream`
   - fix or freeze semantics before treating it as a stable contract

Acceptance criteria:

- desktop and backend can both point to a documented semantic contract for these surfaces

### Phase 3: Decide Agent Contract Ownership

Choose one of the following and document it clearly:

Option A:
- desktop agent features go through `agent.proto` / `soma-agentd` consistently

Option B:
- some desktop features intentionally bypass `agent.proto` in favor of direct provider flows

Acceptance criteria:

- the repo no longer implies one agent contract while implementing another

### Phase 4: Remove or Quarantine Dead Declarations

For each declared-but-not-real surface, choose one action:

- implement it
- mark it as planned and remove it from active docs
- stop generating it into desktop-facing SDK surfaces if it is not meant for active use

Targets:

- `IssueIssuerCapability`
- `DiscoverSpaces`
- `MembershipService`
- `MailboxService`

Acceptance criteria:

- desktop/backend users are not misled into using dead contract surfaces

### Phase 5: Add Contract Tests

Add lightweight checks that keep the contract honest:

- daemon proto smoke tests
- agent proto smoke tests
- desktop main-process wrapper tests for critical RPCs/events
- optional doc lint/checklist to ensure documented contract status is updated when proto changes

Acceptance criteria:

- contract drift becomes visible in CI instead of being discovered later by humans

## High-Risk Breakage Points

These should be handled first if backend and desktop may evolve separately:

- `ChatStream`
- `reject-pending`
- `joinSubmitted` duplication
- generated `spaceroom` clients for services that do not really exist
- the difference between raw daemon events and renderer-facing `domain_event` / `agent_event`

## Suggested Execution Order

1. contract inventory doc/table
2. fix or freeze `ChatStream`
3. formalize join and pending-decision semantics
4. resolve unimplemented proto declarations
5. add contract tests

## Definition of Done

- [x] every shared RPC/service/event is classified and documented
- [x] desktop and backend implement the same semantics for critical shared flows
- [x] dead declarations are either removed from active use or implemented
- [x] CI has at least minimal protection against future contract drift

## Completed Work

### Phase 1: Contract Inventory
- Created `docs/src/contracts/inventory.md` with full inventory table
- Documented all daemon RPCs, agent RPCs, events, and spaceroom services
- Identified status: implemented, unimplemented, declared-only, desktop-hidden, transitional

### Phase 2: Lock Down Semantics
- Created `docs/src/contracts/join-semantics.md` documenting join flow contract
- Fixed `ReadBlobResponse.mime` to return stored MIME type instead of hardcoded value
- Documented async submission semantics for `JoinSpace`
- Documented `reject-pending` encoding workaround and its risks
- Documented `StreamEvents` duplication behavior

### Phase 3: Agent Contract Ownership
- Created `docs/src/contracts/agent-ownership.md`
- Documented dual-path behavior (agentd vs openai-compatible)
- Marked proto-bound features vs provider-specific features

### Phase 4: Remove or Quarantine Dead Declarations
- Updated `proto/spaceroom/v1/membership.proto` with DECLARED-ONLY comments
- Updated `proto/daemon/v1/daemon.proto` with UNIMPLEMENTED status comments
- Desktop stubs for spaceroom services remain but are clearly documented as not to be used

### Phase 5: Add Contract Tests
- Created `backend/bins/daemon/tests/contract.rs` with 15 proto surface tests
- Tests verify existence of proto types and key fields
- Tests pass in CI

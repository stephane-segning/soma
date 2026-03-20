# Plan 09: Two-Hours-Per-Week Implementation Roadmap

Goal: move Soma and Tapia toward the real product vision with a pace that is realistic for roughly **2 hours per week**, using:

- agent-driven coding for implementation work
- human visual testing for product quality and UX judgment

This roadmap is intentionally narrow, sequential, and biased toward finishing visible slices instead of opening many parallel tracks.

## Working Model

Each week should aim for one small loop:

1. define one narrow goal
2. let agents implement the code-heavy parts
3. do human visual testing and product judgment yourself
4. record follow-ups, but do not expand scope mid-week

Recommended time split for each 2-hour block:

- 20 min: pick scope and brief the agent
- 70 min: agent coding and review
- 25 min: human visual/product testing
- 5 min: capture next-step notes

## Success Criteria

By following this roadmap, the product should become:

- clearer in purpose
- more usable as a structured note-taking app
- safer in workspace permissions and membership behavior
- more resilient in low-connectivity environments
- more split-ready at the architecture level

## Priority Order

The product should be built in this order:

1. Soma core note-taking/workspace experience
2. workspace permissions and bot capabilities
3. low-connectivity and p2p reliability
4. Tapia focused training loops
5. optional AI and cross-product integrations

## Phase 1: Stabilize the Product Core

Duration: 6 weeks

### Goal

Make Soma feel like a serious structured note-taking app with a credible workspace model.

### Topics

- editor usability and page flow
- navigation and workspace clarity
- memberships and space settings basics
- current-state docs and implementation truth staying aligned

### Weekly breakdown

#### Week 1: Product framing and app entry clarity

- Agent work:
  - propagate the updated product framing across key docs and visible app labels
  - remove obviously misleading education-only wording where it hurts product clarity
- Human visual testing:
  - read the onboarding surfaces and settings labels
  - verify the app feels like a workspace/note app, not just an experimental school tool

#### Week 2: Page and navigation sanity

- Agent work:
  - tighten page tree flows, empty states, and page naming defaults
  - reduce placeholder screens in Soma where possible
- Human visual testing:
  - create pages, rename them, navigate them, and judge whether the structure feels understandable

#### Week 3: Editor polish pass

- Agent work:
  - improve the current editor behavior around block interactions, list behavior, and common note-taking flows
- Human visual testing:
  - write realistic notes for 15-20 minutes
  - note friction around writing speed, structure, drag/drop, and formatting

#### Week 4: Blob and attachment usability

- Agent work:
  - tighten image/file insertion, rendering, and page-level attachment flows
- Human visual testing:
  - upload files and images in realistic notes
  - confirm the behavior feels coherent and reliable

#### Week 5: Workspace settings and memberships UX

- Agent work:
  - improve the current membership/settings screens so they explain who is in a workspace and what can be managed there
- Human visual testing:
  - test join/approval/revoke flows visually
  - judge whether a non-technical user could understand what is happening

#### Week 6: Phase review

- Agent work:
  - fix the most visible defects found in Weeks 1-5
  - clean small UX inconsistencies only, not architecture yet
- Human visual testing:
  - do one end-to-end "create a workspace and take notes" pass

## Phase 2: Make Permissions and Bots Real

Duration: 6 weeks

### Goal

Make workspaces feel intentionally private and capability-driven, for both humans and bots.

### Topics

- membership semantics
- approvals and roles
- bot identity and capability framing
- basic capability visibility in UI/docs

### Weekly breakdown

#### Week 7: Contract clarity for permissions

- Agent work:
  - tighten docs and code around membership, approval, pending states, and capability semantics
- Human visual testing:
  - review UI copy and flows for whether they make permission behavior understandable

#### Week 8: Human member roles

- Agent work:
  - surface clearer role/capability concepts for humans in workspace settings
- Human visual testing:
  - check whether the permission surface is understandable without backend knowledge

#### Week 9: Bot capability framing

- Agent work:
  - introduce or improve UI/docs that explain bots as members with delegated capabilities
- Human visual testing:
  - verify that bots do not feel like magical hidden infrastructure

#### Week 10: Bot actions boundary

- Agent work:
  - make the permitted bot action categories more explicit: cache/serve, organize/index, automation/script execution
- Human visual testing:
  - verify that these actions feel controlled and not scary or vague

#### Week 11: Approval workflow polish

- Agent work:
  - reduce confusion around join request state, pending state, and decisions
- Human visual testing:
  - simulate member approval and rejection journeys and look for ambiguity

#### Week 12: Phase review

- Agent work:
  - clean the most confusing permission and bot UX issues discovered so far
- Human visual testing:
  - run one realistic “private workspace with humans + bot” scenario review

## Phase 3: Low-Connectivity and P2P Reliability

Duration: 6 weeks

### Goal

Make the low-connectivity story believable, not just architecturally described.

### Topics

- blob resolution from peers
- caching and availability behavior
- user-visible trust in offline/weak-network mode
- docs and diagnostics for p2p behavior

### Weekly breakdown

#### Week 13: Low-connectivity product story

- Agent work:
  - improve docs and visible wording around offline/weak-network expectations
- Human visual testing:
  - review whether the product promises the right thing, not too much and not too little

#### Week 14: Blob/network diagnostics

- Agent work:
  - improve diagnostics or observability around blob fetch and peer availability where helpful
- Human visual testing:
  - verify that failure states are legible enough for a human to debug basic issues

#### Week 15: Cached content experience

- Agent work:
  - improve the product experience around content that is available from peers or cache
- Human visual testing:
  - test notes with attachments across peer availability changes if possible

#### Week 16: Membership-gated p2p trust

- Agent work:
  - tighten remaining rough edges where private workspace expectations meet p2p fetch behavior
- Human visual testing:
  - verify that the app still feels private while using peer-based resolution

#### Week 17: Bot-as-cache-peer experience

- Agent work:
  - improve the product framing and visible system behavior around cache-serving bots
- Human visual testing:
  - check whether the idea is understandable without needing protocol knowledge

#### Week 18: Phase review

- Agent work:
  - clean reliability, messaging, and state-surface issues found in this phase
- Human visual testing:
  - run one weak-connectivity test scenario and note what still feels brittle

## Phase 4: Tapia as a Focused Companion App

Duration: 4 weeks

### Goal

Make Tapia feel like a deliberate training product, not a side shell.

### Topics

- typing drills
- exams and small structured exercises
- relationship to Soma
- progress and session continuity

### Weekly breakdown

#### Week 19: Tapia product scope clarity

- Agent work:
  - align Tapia docs, labels, and visible scope with the actual product goal
- Human visual testing:
  - verify Tapia feels focused and not like a half-copy of Soma

#### Week 20: Core training loop polish

- Agent work:
  - improve one narrow training loop end to end
- Human visual testing:
  - run a full exercise and judge feedback, motion, and clarity

#### Week 21: Session/progress continuity

- Agent work:
  - improve local persistence or session recovery for Tapia where needed
- Human visual testing:
  - verify stopping/restarting the app does not feel careless

#### Week 22: Phase review

- Agent work:
  - clean the top UX defects found in the Tapia loop
- Human visual testing:
  - do one realistic “use Tapia on purpose” pass

## Phase 5: AI and Cross-Product Integration

Duration: 4 weeks

### Goal

Add higher-level value only after Soma and Tapia are already coherent on their own.

### Topics

- AI inside Soma note-taking
- Soma -> Tapia workflows
- future chat groundwork only if it supports note-taking, not distracts from it

### Weekly breakdown

#### Week 23: AI note-taking utility

- Agent work:
  - improve one practical AI-assisted note-taking workflow
- Human visual testing:
  - judge whether it genuinely helps writing and organizing notes

#### Week 24: Soma -> Tapia bridge

- Agent work:
  - improve the product handoff between Soma and Tapia where it makes sense
- Human visual testing:
  - verify the relationship feels intentional and not bolted on

#### Week 25: Future chat boundary

- Agent work:
  - only document or scaffold chat where it clearly supports the note/workspace product direction
- Human visual testing:
  - judge whether it helps the core product or distracts from it

#### Week 26: Roadmap review

- Agent work:
  - produce a new state-of-product review and next-priority recommendation
- Human visual testing:
  - review the whole product shape against the original goal

## Recommended Agent Topics

When delegating coding, use topics like:

- editor usability
- workspace membership UX
- bot capability framing
- offline/p2p diagnostics
- Tapia exercise loop polish
- contract cleanup and split-readiness groundwork

Avoid giving agents a vague goal like “improve the product.” Give them one narrow slice per week.

## Recommended Human Testing Topics

Use your own time mainly for:

- visual coherence
- whether terminology feels understandable
- whether workflows feel safe and private
- whether writing notes feels pleasant
- whether the app still makes sense when the network story gets complex

## What Not To Do At 2h/Week

- do not run many large feature tracks in parallel
- do not spend weeks on invisible infrastructure only
- do not let AI/chat features outrun the note-taking core
- do not try to do repo split work before contract and packaging groundwork are truly stable

## Practical Next Step

Start with Phase 1, Week 1, and treat the next 6 weeks as a single objective:

> make Soma feel like a credible structured note-taking workspace app first

Everything else gets easier once that is true.

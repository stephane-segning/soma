# Plan 09: Weeks 1-20 Human Test Suite

Goal: give Soma and Tapia a compact manual QA pass that matches the roadmap work completed through Week 20.

Use this as a repeatable checklist after each visible product polish pass.

## Test Setup

- Use one local Soma desktop build with a running `soma-daemon`.
- If possible, also use a second device or second peer identity for join/access testing.
- Keep notes while testing:
  - what felt clear
  - what felt confusing
  - what broke expectations
  - whether the wording matched the actual behavior

## Pass 1: Entry and Product Framing

Purpose: verify Weeks 1 and 6 still make Soma feel like a serious note-taking workspace app.

- Launch Soma from cold start.
- Observe splash/loading copy.
- Land on the spaces entry flow.
- Open the command palette and inspect the top navigation actions.
- Use the plus button in the spaces rail.

Questions to answer:

- Does the app immediately read like a private notes/workspace product?
- Do the landing page labels avoid demo/template vibes?
- Do create-space and join-space actions feel distinct and understandable?
- Is there any backend jargon shown too early?

## Pass 2: Space Creation and Navigation

Purpose: verify Weeks 2 and 6 around page flow and empty states.

- Create a new space.
- Create a first page from the sidebar.
- Create another root page.
- Create a child page from an existing page row.
- Rename pages through normal editing/title sync flows.
- Navigate across multiple pages and tabs.

Questions to answer:

- Does each empty state tell you what to do next?
- When you create a page, do you land where you expect?
- Is the page tree understandable without explanation?
- Are root pages vs child pages visually clear enough?

## Pass 3: Real Note-Taking Session

Purpose: verify Week 3 editor polish under realistic use.

- Spend 15-20 minutes writing realistic notes.
- Use headings, bullet lists, numbered lists, and task lists.
- Insert page links.
- Reorder pages in the tree.
- Switch between multiple pages while writing.

Questions to answer:

- Does writing feel fast enough?
- Do list behaviors match normal note-taking expectations?
- Does title syncing feel helpful rather than surprising?
- Do page links and structure support real note organization?

## Pass 4: Attachment Flows

Purpose: verify Week 4 attachment usability.

- On a blank page, insert an image from the add menu.
- Insert a file from the add menu.
- Paste an image into the editor.
- Drag a file into the editor.
- Open uploaded attachments from their rendered cards.
- Try an intentionally broken or interrupted upload if possible.

Questions to answer:

- Do attachments feel like part of the page, not a separate hidden system?
- Are image/file insertion paths consistent enough?
- Do uploading, uploaded, and failed states make sense?
- If a page only has attachments, does its title still make sense?

## Pass 5: Members and Access Screens

Purpose: verify Week 5 clarity around memberships.

- Open global settings.
- Inspect the memberships list for the current device.
- Open a space's members screen.
- Open that space's settings/access screen.
- Compare the labels used across Settings, Members, and Space Settings.

Questions to answer:

- Can a non-technical user tell the difference between device memberships, members, and access management?
- Are leave/revoke actions understandable and safely framed?
- Do the summaries help explain who currently has access?
- Is any important action too hidden?

## Pass 6: Join and Approval Mental Model

Purpose: verify Weeks 6 and 7 around request/access semantics.

- Open the dedicated join screen.
- Read all helper text before entering anything.
- Try submitting with missing fields.
- Submit a real access request if you have another peer/space available.
- Observe what the UI promises before approval arrives.

Questions to answer:

- Is it obvious that this flow requests access rather than granting it immediately?
- Is the required information understandable enough for a human who got an invite from someone else?
- Are validation messages helpful?
- Does the UI avoid pretending that pending approval is already a full membership?

## Pass 7: Approval, Revoke, and Pending Review

Purpose: verify Week 7 permission semantics on the admin side.

- Use a space that can receive join requests.
- Open the space settings approval section.
- Review a pending request.
- Approve one request.
- Reject one request if possible.
- Revoke an existing member.

Questions to answer:

- Is it obvious who is requesting access and what role they want?
- Do approve/reject/revoke actions feel deliberate and safe?
- Does the wording around pending requests match what actually happens?
- After approval or revoke, does the rest of the UI update in a believable way?

## Pass 8: Permission vs Model Settings Separation

Purpose: verify Week 7 clarity that local AI options are not security permissions.

- Open global settings and scroll to model features.
- Open per-space settings and review workspace model features.
- Compare that wording with the access/members areas.

Questions to answer:

- Is it clear that model features are local UI hints only?
- Could a user confuse model feature toggles with membership permissions?
- Does the screen structure keep security/access concerns separate from AI configuration?

## Pass 9: End-to-End Story

Purpose: run one complete product narrative across Weeks 1-7.

- Create or open a space.
- Create several pages.
- Write notes with lists and page links.
- Add an image and a file.
- Open members and space settings.
- Use the join screen or at least review its copy.

Questions to answer:

- Does Soma now feel like a credible structured note-taking workspace app?
- Which screen still feels the least finished?
- Which wording still feels too technical?
- What is the single most visible defect left after Weeks 1-7?

## Pass 10: Bot and Access Role Clarity

Purpose: verify Weeks 8-11 around human roles, bot framing, and access-request language.

- Open members, global settings, and space settings for one workspace.
- Read every role description without clicking anything first.
- Review at least one pending access request if available.
- Compare the words `Bot`, `Owner`, `Member`, `approver`, and `model features` across screens.

Questions to answer:

- Is it obvious which labels describe workspace permissions vs local model settings?
- Is it clear that a bot member does not automatically become a join approver?
- Do approval actions feel like access decisions rather than abstract admin mechanics?
- Are there still any places where a non-technical user could confuse reachability with authority?

## Pass 11: Weak-Network Expectations

Purpose: verify Weeks 12-14 around offline/weak-network truthfulness.

- Open global settings and read the connectivity guidance.
- Read the join screen helper copy again.
- Read the peer-connectivity docs or internal guidance you expect to rely on while debugging.

Questions to answer:

- Does Soma promise the right amount, neither too much nor too little?
- Is it clear which actions stay local and which may wait for peers?
- Do troubleshooting notes help explain joins, peers, and missing attachments in plain language?
- Is there any place where the product still sounds “online/offline” in an oversimplified way?

## Pass 12: Cached Content and Trust Boundaries

Purpose: verify Weeks 15-17 around cached attachments, membership-gated fetches, and cache-serving bots.

- Open a page with attachments that this device already fetched.
- If possible, open the same page from another device that has not fetched those attachments yet.
- Review the attachment cards and the connectivity guidance.
- Review bot explanations in members/settings screens.

Questions to answer:

- Is it clear when an attachment is already local vs when it may need another peer?
- Does the product explain that reachable peers still need the right workspace membership?
- Do cache-serving bots feel understandable without protocol knowledge?
- Is any copy still too internal, especially around cache peers or transport services?

## Pass 13: Tapia Product Scope

Purpose: verify Week 19 so Tapia feels focused instead of vague.

- Launch Tapia from cold start.
- Read the splash, top header, track switcher, list screen, empty state, and not-found screen.
- Generate at least one new passage.

Questions to answer:

- Does Tapia now read as a typing-practice app instead of a generic shell?
- Do visible labels avoid leaking Soma-internal or daemon-heavy language?
- Are the available tracks understandable and intentionally named?
- Does the product promise only what is actually there today?

## Pass 14: Tapia Core Training Loop

Purpose: verify Week 20 around one full practice loop.

- Open one passage.
- Start typing slowly, then with deliberate mistakes.
- Use backspace to recover.
- Finish the full passage.
- Review the completion panel and retry the passage.

Questions to answer:

- Is the next-key guidance helpful?
- Does the prompt make mistakes and recovery obvious enough?
- Does completion feel like a real finish rather than the UI just stopping?
- Are the results useful enough to encourage another run?

## Pass 15: Multi-Week Product Checkpoint

Purpose: create one combined checkpoint across Weeks 1-20.

- Run one realistic Soma session with notes, attachments, members, and access review.
- Run one realistic Tapia session from passage generation to completion.
- Compare the overall product feel between the two apps.

Questions to answer:

- Does Soma feel like a credible structured note-taking workspace?
- Does Tapia feel like a deliberate companion rather than an unfinished side shell?
- Which upcoming week now feels most important to visible product quality?
- What are the top 3 manual follow-ups to validate in the next iteration?

## Reporting Template

For each test pass, capture:

- Result: pass / mixed / fail
- Friction points: 1-3 bullets
- Confusing copy: exact screen + text
- Broken behavior: exact screen + reproduction steps
- Follow-up priority: high / medium / low

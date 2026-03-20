# Planning Folder

This folder holds active planning and restructuring work that should not be treated as canonical product or developer documentation.

## Purpose

Use `planning/` for:

- active implementation plans
- migration plans
- cutover notes
- cleanup checklists
- split-readiness work
- agent execution plans

Do not use `planning/` for:

- current product docs
- current architecture docs
- current developer workflows
- historical reference material

Those belong in `docs/src/` or `docs/src/archive/`.

## Structure

- `planning/active/`: plans that are still relevant or in progress
- `planning/done/`: optional destination for completed plans worth keeping briefly

## Working Rules

1. If a file describes current working behavior, move that truth into `docs/`.
2. If a plan is completed and no longer useful, delete it.
3. If a completed plan still explains a near-term follow-up, move it to `planning/done/`.
4. Do not let root-level `plan-*.md` files reappear; put them here instead.
5. Keep plans concrete: scope, risks, phases, acceptance criteria, and next actions.

## For Agents

When using this folder:

- treat `docs/` as the canonical surface for current truth
- treat `planning/` as execution guidance, not product truth
- prefer updating an existing relevant plan over creating duplicate plan files
- create new plans only when the work is large enough to need a tracked checklist

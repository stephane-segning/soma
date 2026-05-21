import type { DraftRecord } from "@soma/sdk";
import type * as documentsService from "../../services/documents-service";
import type * as spacesService from "../../services/spaces-service";

export type SpaceMember = spacesService.SpaceMember;
export type JoinRequestRecord = spacesService.JoinRequestRecord;
export type DecideJoinResult = spacesService.DecideJoinResult;

export type PageRecord = Awaited<ReturnType<typeof documentsService.listPages>>[number];

// The Rust DTO emits `published: number` (specta forbids narrower
// `0 | 1` literals), but the daemon round-trips it as a boolean → 1|0.
export type DraftRow = DraftRecord;

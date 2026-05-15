import type * as documentsService from "../../services/documents-service";
import type * as spacesService from "../../services/spaces-service";

export type SpaceMember = spacesService.SpaceMember;
export type JoinRequestRecord = spacesService.JoinRequestRecord;
export type DecideJoinResult = spacesService.DecideJoinResult;

export type PageRecord = Awaited<ReturnType<typeof documentsService.listPages>>[number];

export type DraftRow = {
	spaceId: string;
	documentId: string;
	contentJson: string;
	published: 0 | 1;
	updatedAtMs: number;
};

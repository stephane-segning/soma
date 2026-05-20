import { call } from "./client";
import type { StagedUpload, StageUploadArgs, UploadBlobArgs, UploadBlobResult } from "./types";

export const blobs = {
	upload: (args: UploadBlobArgs) => call<UploadBlobResult>("blobs_upload", { args }),
	read: (spaceId: string, cid: string) => call<number[] | null>("blobs_read", { spaceId, cid }),
	stageUpload: (args: StageUploadArgs) => call<StagedUpload>("blobs_stage_upload", { args }),
};

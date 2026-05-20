import { call } from "./client";
import type { StagedUpload, StageUploadArgs, UploadBlobArgs, UploadBlobResult } from "./types";

export const blobs = {
	upload: (args: UploadBlobArgs) => call<UploadBlobResult>("upload_blob", { args }),
	read: (spaceId: string, cid: string) => call<number[] | null>("read_blob", { spaceId, cid }),
	stageUpload: (args: StageUploadArgs) => call<StagedUpload>("stage_upload", { args }),
};

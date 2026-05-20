import type * as B from "../bindings";
import type { Transport } from "../transport";

export function blobs(t: Transport) {
	return {
		upload: (args: B.UploadBlobArgs) => t.invoke<B.UploadBlobResult>("blobs_upload", { args }),
		read: (spaceId: string, cid: string) => t.invoke<number[] | null>("blobs_read", { spaceId, cid }),
		stageUpload: (args: B.StageUploadArgs) => t.invoke<B.StagedUpload>("blobs_stage_upload", { args }),
	};
}

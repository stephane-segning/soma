import type * as B from "../bindings";
import type { Transport } from "../transport";

/**
 * Args for {@link stage}. Hand-rolled (not in the generated bindings yet) because
 * `blobs_stage` is currently an Electron-only command — the Electron handler is
 * mime-aware (zips non-image payloads, synthesizes a `soma-blob://` URL) and the
 * Tauri side exposes only the raw `blobs_upload` primitive. Same wire shape, but
 * the Tauri presenter for `blobs_stage` will land in a follow-up; the renderer
 * already speaks this typed surface either way.
 *
 * `bytes` is `number[]` (i.e. `Array.from(uint8)`) to stay JSON-friendly across
 * both transports.
 */
export type StageBlobArgs = {
	spaceId: string;
	docId?: string;
	bytes: number[];
	mime: string;
	fileName?: string;
};

/** Raw response from `blobs_stage`. `size` stays in bytes; the renderer-side
 * service renames it to `byteLength` to match its public type. */
export type StageBlobResult = {
	cid: string;
	size: number;
	mime: string;
	name: string;
	url: string;
	variants?: {
		cid: string;
		size: number;
		mime: string;
		name: string;
		url: string;
		width?: number;
		height?: number;
	}[];
};

export function blobs(t: Transport) {
	return {
		upload: (args: B.UploadBlobArgs) => t.invoke<B.UploadBlobResult>("blobs_upload", { args }),
		read: (spaceId: string, cid: string) => t.invoke<number[] | null>("blobs_read", { spaceId, cid }),
		stageUpload: (args: B.StageUploadArgs) => t.invoke<B.StagedUpload>("blobs_stage_upload", { args }),
		/**
		 * Mime-aware stage: image payloads pass through verbatim, anything else
		 * gets zipped before hitting the daemon. The handler also synthesizes the
		 * `soma-blob://` URL used by the renderer for display.
		 *
		 * The Electron handler reads a flat payload; the Tauri presenter (when it
		 * lands) will receive `{ args }` thanks to the transport's args-envelope
		 * unwrap. Either way the call shape here stays the same.
		 */
		stage: (args: StageBlobArgs) => t.invoke<StageBlobResult>("blobs_stage", { args }),
	};
}

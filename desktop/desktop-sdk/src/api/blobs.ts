import type * as B from "../bindings";
import { BackendError } from "../errors";
import type { Transport } from "../transport";

/**
 * The mime-aware stage handler now exists on both shells, so we re-export
 * the generated bindings rather than maintaining hand-rolled twins. The
 * Tauri presenter (`blobs_stage`) zips non-image payloads and synthesizes
 * a `soma-blob://daemon/<space>/<cid>` URL; the Electron handler does the
 * same. `variants` is a forward-compat slot for thumbnails — both
 * presenters return `null`/`undefined` today.
 *
 * `bytes` is `number[]` (i.e. `Array.from(uint8)`) to stay JSON-friendly
 * across both transports.
 */
export type StageBlobArgs = B.StageBlobArgs;

/** Raw response from `blobs_stage`. `size` stays in bytes; the renderer-side
 * service renames it to `byteLength` to match its public type. The
 * `_Serialize` flavor is the on-the-wire shape Rust hands back. */
export type StageBlobResult = B.StageBlobResult_Serialize;
export type StageBlobVariant = B.StageBlobVariant_Serialize;

/**
 * Args for the upload-outbox's "stage a payload to disk" step. Same
 * wire shape as {@link B.StageUploadArgs} — re-exported under the
 * renderer-expected name so the SDK call site doesn't churn.
 */
export type StagePayloadArgs = B.StageUploadArgs;
export type StagePayloadResult = B.StagedUpload;

/** Args for "consume a previously-staged payload and stage it as a blob". */
export type StageFromPayloadArgs = B.StageFromPayloadArgs;
export type StageFromPayloadResult = B.StageBlobResult_Serialize;
export type StageFromPayloadVariant = B.StageBlobVariant_Serialize;

export function blobs(t: Transport) {
	return {
		upload: (args: B.UploadBlobArgs) => t.invoke<B.UploadBlobResult>("blobs_upload", { args }),
		/**
		 * `blobs_read`'s missing-blob case is `Ok(None)` over Tauri, but
		 * `desktop-bff`'s HTTP route encodes the same case as a bare 404
		 * with no JSON body (see `desktop-bff/src/routes/blobs.rs`'s doc
		 * comment on `blobs_read` — bytes stream as
		 * `application/octet-stream`, which can't also carry a JSON
		 * `null`). `httpTransport.invoke` surfaces that as a thrown
		 * `BackendError` with `kind: "not-found"` (derived from the plain
		 * HTTP status, since there's no JSON envelope to parse) rather
		 * than silently resolving `null` itself — only this call site
		 * knows "404 here" means "absent value", not "error", so the
		 * translation happens here, keeping both transports' return
		 * values identical for callers.
		 */
		read: async (spaceId: string, cid: string): Promise<number[] | null> => {
			try {
				return await t.invoke<number[]>("blobs_read", { spaceId, cid });
			} catch (err) {
				if (err instanceof BackendError && err.kind === "not-found") return null;
				throw err;
			}
		},
		stageUpload: (args: B.StageUploadArgs) => t.invoke<B.StagedUpload>("blobs_stage_upload", { args }),
		/**
		 * Mime-aware stage: image payloads pass through verbatim, anything else
		 * gets zipped before hitting the daemon. The handler also synthesizes the
		 * `soma-blob://` URL used by the renderer for display.
		 */
		stage: (args: StageBlobArgs) => t.invoke<StageBlobResult>("blobs_stage", { args }),
		/**
		 * Upload-outbox two-step (stage-to-disk, then upload). The Electron
		 * handler reads a flat payload; the Tauri presenter receives `{ args }`
		 * thanks to the transport's args-envelope unwrap. The call shape here
		 * stays identical across shells.
		 */
		stagePayload: (args: StagePayloadArgs) => t.invoke<StagePayloadResult>("blobs_stage_payload", { args }),
		stageFromPayload: (args: StageFromPayloadArgs) =>
			t.invoke<StageFromPayloadResult>("blobs_stage_from_payload", { args }),
	};
}

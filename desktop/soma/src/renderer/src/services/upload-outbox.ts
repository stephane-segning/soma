import { uploadJobsCollection } from "@app/lib/db";
import { invoke } from "@app/lib/ipc";
import { createId } from "@paralleldrive/cuid2";
import { createUploadJobRecord, isUploadJobRecord, type UploadJobRecord } from "@soma/desktop-db";

type QueueUploadInput = {
	bytes: Uint8Array;
	mime: string;
	fileName?: string;
	spaceId: string;
	docId?: string;
};

function decodeBase64Payload(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function queueUploadJob(input: QueueUploadInput): Promise<string> {
	const stagedPayload = await invoke<{
		payloadPath: string;
	}>("blobs_stage_payload", {
		bytes: Array.from(input.bytes),
		mime: input.mime,
		fileName: input.fileName,
	});

	const id = createId();
	const record = createUploadJobRecord({
		id,
		spaceId: input.spaceId,
		docId: input.docId,
		fileName: input.fileName,
		mime: input.mime,
		byteLength: input.bytes.length,
		payloadPath: stagedPayload.payloadPath,
	});
	uploadJobsCollection.insert(record);
	return id;
}

export function awaitUploadJob(jobId: string, timeoutMs = 120_000): Promise<UploadJobRecord> {
	return new Promise((resolve, reject) => {
		const existing = uploadJobsCollection.state.get(jobId);
		if (existing && isUploadJobRecord(existing)) {
			if (existing.status === "done") {
				resolve(existing);
				return;
			}
			if (existing.status === "failed") {
				reject(new Error(existing.lastError ?? "Upload failed"));
				return;
			}
		}

		const subscription = uploadJobsCollection.subscribeChanges((changes) => {
			for (const change of changes) {
				if (change.key !== jobId) continue;
				const record = uploadJobsCollection.state.get(jobId);
				if (!record || !isUploadJobRecord(record)) continue;
				if (record.status === "done") {
					subscription.unsubscribe();
					resolve(record);
					return;
				}
				if (record.status === "failed") {
					subscription.unsubscribe();
					reject(new Error(record.lastError ?? "Upload failed"));
					return;
				}
			}
		});

		const timeout = window.setTimeout(() => {
			subscription.unsubscribe();
			reject(new Error("Upload timed out"));
		}, timeoutMs);

		const originalUnsubscribe = subscription.unsubscribe.bind(subscription);
		subscription.unsubscribe = () => {
			window.clearTimeout(timeout);
			originalUnsubscribe();
		};
	});
}

async function processJob(record: UploadJobRecord): Promise<void> {
	if (record.status !== "queued") return;
	let payloadPath = record.payloadPath;

	if (!payloadPath && record.bytesBase64) {
		const stagedPayload = await invoke<{
			payloadPath: string;
		}>("blobs_stage_payload", {
			bytes: Array.from(decodeBase64Payload(record.bytesBase64)),
			mime: record.mime,
			fileName: record.fileName,
		});
		payloadPath = stagedPayload.payloadPath;
		uploadJobsCollection.update(record.id, (draft) => {
			draft.payloadPath = stagedPayload.payloadPath;
			draft.bytesBase64 = undefined;
			draft.updatedAtMs = Date.now();
		});
	}

	if (!payloadPath) {
		uploadJobsCollection.update(record.id, (draft) => {
			draft.status = "failed";
			draft.updatedAtMs = Date.now();
			draft.attempts += 1;
			draft.lastError = "Missing payload path";
		});
		return;
	}

	uploadJobsCollection.update(record.id, (draft) => {
		draft.status = "uploading";
		draft.updatedAtMs = Date.now();
		draft.attempts += 1;
		draft.lastError = undefined;
	});

	try {
		const staged = await invoke<{
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
		}>("blobs_stage_from_payload", {
			spaceId: record.spaceId,
			docId: record.docId,
			payloadPath,
			mime: record.mime,
			fileName: record.fileName,
		});

		uploadJobsCollection.update(record.id, (draft) => {
			draft.status = "done";
			draft.updatedAtMs = Date.now();
			draft.payloadPath = undefined;
			draft.bytesBase64 = undefined;
			draft.result = {
				cid: staged.cid,
				url: staged.url,
				size: staged.size,
				mime: staged.mime,
				name: staged.name ?? record.fileName ?? "blob",
				variants: staged.variants,
			};
		});
	} catch (error) {
		uploadJobsCollection.update(record.id, (draft) => {
			draft.status = "failed";
			draft.updatedAtMs = Date.now();
			draft.lastError = error instanceof Error ? error.message : String(error);
		});
	}
}

export function startUploadOutboxWorker(): () => void {
	const inFlight = new Set<string>();

	const kick = () => {
		for (const record of uploadJobsCollection.state.values()) {
			if (!isUploadJobRecord(record)) continue;
			if (record.status !== "queued") continue;
			if (inFlight.has(record.id)) continue;
			inFlight.add(record.id);
			processJob(record).finally(() => {
				inFlight.delete(record.id);
			});
		}
	};

	kick();

	const subscription = uploadJobsCollection.subscribeChanges(() => {
		kick();
	});

	return () => {
		subscription.unsubscribe();
	};
}

import { protocol } from "electron";
import fs from "fs/promises";
import path from "path";
import { AppDataStore } from "./app-data-store";
import { DaemonClient } from "./daemon-client";

export class BlobProtocolRegistrar {
	constructor(
		private readonly store: AppDataStore,
		private readonly daemon: DaemonClient,
	) {}

	register(): void {
		protocol.registerFileProtocol("soma-blob", async (request, callback) => {
			const url = request.url.replace("soma-blob://", "");
			const [, spaceId, cid] = url.split("/");
			if (!spaceId || !cid) {
				callback({ error: -324 }); // ERR_INVALID_URL
				return;
			}

			const blobPath = this.store.getBlobPath(spaceId, cid);
			try {
				await fs.access(blobPath);
			} catch {
				const bytes = await this.daemon.readBlob(spaceId, cid);
				if (!bytes) {
					callback({ error: -6 }); // ERR_FILE_NOT_FOUND
					return;
				}
				await this.store.persistBlobBytes(spaceId, cid, bytes);
			}

			const normalized = path.normalize(blobPath);
			callback({ path: normalized });
		});
	}
}

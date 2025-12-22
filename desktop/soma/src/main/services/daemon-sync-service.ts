import log from "electron-log";
import { inject, injectable } from "inversify";
import { TYPES } from "../tokens";
import type { DaemonClient } from "./daemon-client";
import type { DaemonOutboxItem, DocumentsService } from "./documents-service";

@injectable()
class DaemonSyncService {
	private readonly logger = log.scope("daemon-sync-service");
	private timer: NodeJS.Timeout | null = null;
	private running = false;

	constructor(
		@inject(TYPES.daemonClient) private readonly daemon: DaemonClient,
		@inject(TYPES.documentsService) private readonly documents: DocumentsService,
	) {}

	start(): void {
		if (this.timer) return;
		// Frequent sync attempts keep the daemon mailbox drained without blocking UI.
		this.timer = setInterval(() => {
			void this.flush();
		}, 5_000);
		void this.flush();
	}

	stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = null;
	}

	async flush(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			// If the daemon is offline, skip quietly; the outbox will be retried later.
			try {
				await this.daemon.status();
			} catch (error) {
				this.logger.debug("Daemon offline during outbox flush", error);
				return;
			}

			const batch = this.documents.takeDaemonOutbox(8);
			if (!batch.length) return;

			const processed: string[] = [];
			for (const item of batch) {
				try {
					await this.pushOne(item);
					processed.push(item.id);
				} catch (error) {
					this.logger.warn("Failed to push daemon outbox item", {
						id: item.id,
						spaceId: item.spaceId,
						documentId: item.documentId,
						error,
					});
				}
			}

			if (processed.length > 0) {
				this.documents.deleteDaemonOutboxEntries(processed);
			}
		} finally {
			this.running = false;
		}
	}

	private async pushOne(item: DaemonOutboxItem): Promise<void> {
		await this.daemon.upsertDocument({
			spaceId: item.spaceId,
			documentId: item.documentId,
			contentJson: item.contentJson,
			published: item.published === 1,
			updatedAtMs: item.updatedAtMs,
		});

		const blobIds = this.documents.extractLocalBlobIds(item.contentJson);
		for (const blobId of blobIds) {
			if (this.documents.getBlobMigration(blobId)) continue;
			const blob = this.documents.readStagedBlob(blobId);
			if (!blob) continue;

			const res = await this.daemon.uploadBlob({
				spaceId: item.spaceId,
				data: blob.bytes,
				mime: blob.mime,
				name: blob.fileName ?? blobId,
				docId: item.documentId,
			});
			this.documents.recordBlobMigration(item.spaceId, blobId, res.cid);
		}
	}
}

export { DaemonSyncService };

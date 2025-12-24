import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import { inject, injectable } from "inversify";
import { readLastRoute, writeLastRoute } from "../route-store";
import { TYPES } from "../tokens";
import type { AgentService } from "./agent-service";
import type { AppSettingsService } from "./app-settings-service";
import type { DaemonClient } from "./daemon-client";
import type { DbService } from "./db-service";
import type { DocumentsService } from "./documents-service";

@injectable()
export class MainIpcController {
	private readonly logger = log.scope("main-ipc-controller");
	private registered = false;

	constructor(
		@inject(TYPES.appSettingsService)
		private readonly appSettings: AppSettingsService,
		@inject(TYPES.dbService) private readonly db: DbService,
		@inject(TYPES.documentsService)
		private readonly documents: DocumentsService,
		@inject(TYPES.agentService) private readonly agent: AgentService,
		@inject(TYPES.daemonClient) private readonly daemon: DaemonClient,
	) {}

	register(): void {
		if (this.registered) return;
		this.registered = true;

		ipcMain.on("ping", () => this.logger.silly("ping received"));

		ipcMain.handle("router:get-last-route", () => readLastRoute());

		ipcMain.on("router:set-last-route", async (_event, route: string) => {
			await writeLastRoute(route);
			await this.appSettings.setLastPage(route);
			this.logger.debug(`Persisted last route: ${route}`);
		});

		ipcMain.handle("settings:get", async (_event, key: string) => {
			return this.appSettings.get(key);
		});

		ipcMain.handle("search:query", async (_event, rawQuery: string) => {
			const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
			if (query.length < 2) return [];

			const tableNames = this.db.all<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 50",
			);

			const results: Array<{ id: string; title: string; subtitle?: string }> =
				[];

			for (const { name } of tableNames) {
				if (results.length >= 25) break;
				const safeTable = `"${name.replaceAll('"', '""')}"`;
				const columns = this.db.all<{ name: string; type: string }>(
					`PRAGMA table_info(${safeTable})`,
				);

				for (const column of columns) {
					if (results.length >= 25) break;
					const type = String(column.type ?? "").toUpperCase();
					const isText =
						type.includes("CHAR") ||
						type.includes("CLOB") ||
						type.includes("TEXT");
					if (!isText) continue;

					const safeColumn = `"${String(column.name).replaceAll('"', '""')}"`;
					const rows = this.db.all<{ rowid: number; value: string }>(
						`SELECT rowid as rowid, ${safeColumn} as value FROM ${safeTable} WHERE ${safeColumn} LIKE ? LIMIT 3`,
						[`%${query}%`],
					);

					for (const row of rows) {
						if (results.length >= 25) break;
						const value =
							typeof row.value === "string"
								? row.value
								: String(row.value ?? "");
						const title =
							value.length > 120 ? `${value.slice(0, 117)}...` : value;
						results.push({
							id: `${name}:${column.name}:${row.rowid}`,
							title,
							subtitle: `${name}.${column.name}`,
						});
					}
				}
			}

			return results;
		});

		ipcMain.handle(
			"documents:upsert-draft",
			async (
				_event,
				input: {
					spaceId: string;
					documentId: string;
					contentJson: string;
					published: boolean;
				},
			) => {
				this.documents.upsertDraft(input);
				return { ok: true };
			},
		);

		ipcMain.handle(
			"documents:get-draft",
			async (_event, input: { spaceId: string; documentId: string }) => {
				return this.documents.getDraft(input.spaceId, input.documentId);
			},
		);

		ipcMain.handle(
			"documents:queue-daemon-sync",
			async (
				_event,
				input: {
					spaceId: string;
					documentId: string;
					contentJson: string;
					updatedAtMs: number;
				},
			) => {
				this.documents.queueDaemonSync(input);
				return { ok: true };
			},
		);

		ipcMain.handle(
			"documents:ensure-page",
			async (
				_event,
				input: {
					spaceId: string;
					pageId?: string;
					title?: string;
					parentPageIds?: string[];
				},
			) => {
				return this.documents.ensurePage(input);
			},
		);

		ipcMain.handle(
			"documents:list-pages",
			async (_event, input: { spaceId: string }) => {
				return this.documents.listPages(input.spaceId);
			},
		);

		ipcMain.handle(
			"documents:update-page-title",
			async (
				_event,
				input: { spaceId: string; pageId: string; title: string },
			) => {
				return this.documents.updatePageTitle(
					input.spaceId,
					input.pageId,
					input.title,
				);
			},
		);

		ipcMain.handle(
			"documents:set-page-parents",
			async (
				_event,
				input: { spaceId: string; pageId: string; parentPageIds: string[] },
			) => {
				return this.documents.setPageParents(
					input.spaceId,
					input.pageId,
					input.parentPageIds,
				);
			},
		);

		ipcMain.handle(
			"daemon:upsert-document",
			async (
				_event,
				input: {
					spaceId: string;
					documentId: string;
					contentJson: string;
					published: boolean;
					updatedAtMs: number;
				},
			) => {
				await this.daemon.upsertDocument(input);
				return { ok: true };
			},
		);

		ipcMain.handle(
			"daemon:sync-published-document",
			async (
				_event,
				input: {
					spaceId: string;
					documentId: string;
					contentJson: string;
					updatedAtMs: number;
				},
			) => {
				await this.daemon.upsertDocument({
					spaceId: input.spaceId,
					documentId: input.documentId,
					contentJson: input.contentJson,
					published: true,
					updatedAtMs: input.updatedAtMs,
				});

				const blobIds = this.documents.extractLocalBlobIds(input.contentJson);
				let uploaded = 0;
				for (const blobId of blobIds) {
					if (this.documents.getBlobMigration(blobId)) continue;
					const blob = this.documents.readStagedBlob(blobId);
					if (!blob) continue;
					const res = await this.daemon.uploadBlob({
						spaceId: input.spaceId,
						data: blob.bytes,
						mime: blob.mime,
						name: blob.fileName ?? blobId,
						docId: input.documentId,
					});
					this.documents.recordBlobMigration(input.spaceId, blobId, res.cid);
					uploaded += 1;
				}

				return { ok: true, uploaded };
			},
		);

		ipcMain.handle(
			"blobs:stage",
			async (
				_event,
				input: { bytes: Uint8Array; mime: string; fileName?: string },
			) => {
				return this.documents.stageBlob(input);
			},
		);

		ipcMain.handle(
			"agent:inline-complete",
			async (_event, input: { prompt: string; context?: string }) => {
				return this.agent.inlineComplete(input);
			},
		);

		ipcMain.on("window:minimize", (event) => {
			BrowserWindow.fromWebContents(event.sender)?.minimize();
		});

		ipcMain.on("window:toggle-maximize", (event) => {
			const window = BrowserWindow.fromWebContents(event.sender);
			if (!window) return;
			if (window.isMaximized()) window.unmaximize();
			else window.maximize();
		});

		ipcMain.on("window:close", (event) => {
			BrowserWindow.fromWebContents(event.sender)?.close();
		});
	}
}

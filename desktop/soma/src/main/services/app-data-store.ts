import ElectronStore from "electron-store";
import { app } from "electron";
import path from "path";
import fs from "fs/promises";

export type StoredBlob = {
	cid: string;
	spaceId: string;
	docId?: string;
	mime: string;
	name: string;
	size: number;
	createdAtMs: number;
};

type StoreSchema = {
	blobs: StoredBlob[];
	settings: Record<string, unknown>;
};

export class AppDataStore {
	private store: ElectronStore<StoreSchema>;

	constructor() {
		// electron-store v10+ may be exported under `.default` when required from CJS;
		// resolve to the constructor explicitly to avoid "not a constructor".
		const StoreCtor: any = (ElectronStore as any).default ?? ElectronStore;

		this.store = new StoreCtor({
			name: "soma-data",
			defaults: {
				blobs: [],
				settings: {},
			},
		}) as ElectronStore<StoreSchema>;
	}

	get blobs(): StoredBlob[] {
		return this.store.get("blobs", []);
	}

	set blobs(value: StoredBlob[]) {
		this.store.set("blobs", value);
	}

	get settings(): Record<string, unknown> {
		return this.store.get("settings", {});
	}

	set settings(value: Record<string, unknown>) {
		this.store.set("settings", value);
	}

	getBlobPath(spaceId: string, cid: string): string {
		const base = app.getPath("userData");
		return path.join(base, "blobs", spaceId, cid);
	}

	async persistBlobBytes(
		spaceId: string,
		cid: string,
		bytes: Buffer,
	): Promise<string> {
		const target = this.getBlobPath(spaceId, cid);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, bytes);
		return target;
	}
}

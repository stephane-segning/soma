import { join } from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { app } from "electron";
import log from "electron-log";
import { injectable } from "inversify";

@injectable()
export class DbService {
	private db: DatabaseType | null = null;
	private dbPath: string | null = null;
	private readonly logger = log.scope("DbService");

	init(dbFileName = "soma.db"): void {
		if (this.db) return;
		this.dbPath = join(app.getPath("userData"), dbFileName);
		this.db = new Database(this.dbPath);
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("foreign_keys = ON");
		this.logger.info(`SQLite ready at ${this.dbPath}`);
	}

	close(): void {
		if (!this.db) return;
		this.db.close();
		this.db = null;
	}

	run(
		query: string,
		values: Array<string | number | null | Buffer> = [],
	): void {
		this.ensureInitialized();
		this.db!.prepare(query).run(values);
	}

	all<T>(
		query: string,
		values: Array<string | number | null | Buffer> = [],
	): T[] {
		this.ensureInitialized();
		return this.db!.prepare(query).all(values) as T[];
	}

	get<T>(
		query: string,
		values: Array<string | number | null | Buffer> = [],
	): T | null {
		this.ensureInitialized();
		const row = this.db!.prepare(query).get(values) as T | undefined;
		return row ?? null;
	}

	transaction<T>(fn: () => T): T {
		this.ensureInitialized();
		return this.db!.transaction(fn)();
	}

	private ensureInitialized(): void {
		if (!this.db) {
			this.init();
		}
		if (!this.db) {
			throw new Error("DbService not initialized");
		}
	}
}

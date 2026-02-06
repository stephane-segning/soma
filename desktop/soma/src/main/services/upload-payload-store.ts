import { createId } from "@paralleldrive/cuid2";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export type StageUploadPayloadParams = {
	bytes: number[];
	mime: string;
	fileName?: string;
};

export type StageUploadPayloadResult = {
	payloadPath: string;
	byteLength: number;
	mime: string;
	fileName?: string;
	createdAtMs: number;
};

export class UploadPayloadStore {
	constructor(private readonly baseDir: string) {}

	async stage(params: StageUploadPayloadParams): Promise<StageUploadPayloadResult> {
		await mkdir(this.baseDir, {
			recursive: true,
		});

		const payloadPath = join(this.baseDir, `${createId()}.bin`);
		const buffer = Buffer.from(params.bytes);
		await writeFile(payloadPath, buffer);

		return {
			payloadPath,
			byteLength: buffer.byteLength,
			mime: params.mime,
			fileName: params.fileName,
			createdAtMs: Date.now(),
		};
	}

	async read(payloadPath: string): Promise<Buffer> {
		const safePath = this.resolvePayloadPath(payloadPath);
		return readFile(safePath);
	}

	async remove(payloadPath: string): Promise<void> {
		const safePath = this.resolvePayloadPath(payloadPath);
		await rm(safePath, {
			force: true,
		});
	}

	private resolvePayloadPath(payloadPath: string): string {
		const root = resolve(this.baseDir);
		const candidate = resolve(payloadPath);
		if (!candidate.startsWith(`${root}${sep}`)) {
			throw new Error("Invalid upload payload path");
		}
		return candidate;
	}
}

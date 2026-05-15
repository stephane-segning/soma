import type { ReadBlobResponse, UploadBlobResponse } from "@soma/proto/daemon/v1/daemon";

import type { DaemonGrpcClient } from "./connection";
import { isNotFound, unary } from "./connection";
import type { UploadBlobInput, UploadBlobResult } from "./types";

export async function uploadBlob(client: DaemonGrpcClient, input: UploadBlobInput): Promise<UploadBlobResult> {
	const res = await unary<UploadBlobResponse>((callback) => {
		client.uploadBlob(
			{
				spaceId: input.spaceId,
				data: Buffer.from(input.bytes),
				mime: input.mime,
				name: input.name,
				docId: input.docId ?? "",
			},
			callback,
		);
	});

	return {
		cid: res.cid,
		size: Number(res.size ?? input.bytes.length),
		mime: res.mime ?? input.mime,
		name: res.name ?? input.name,
	};
}

export async function readBlob(
	client: DaemonGrpcClient,
	spaceId: string,
	cid: string,
): Promise<ReadBlobResponse | null> {
	try {
		const res = await unary<ReadBlobResponse>((callback) => {
			client.readBlob(
				{
					spaceId,
					cid,
				},
				callback,
			);
		});
		if (!res?.data || !res.data.length) return null;
		return res;
	} catch (error: unknown) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

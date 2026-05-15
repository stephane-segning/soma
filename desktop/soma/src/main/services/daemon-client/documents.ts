import type { GetDocumentResponse, UpsertDocumentResponse } from "@soma/proto/daemon/v1/daemon";
import Long from "long";

import type { DaemonGrpcClient } from "./connection";
import { isNotFound, unary } from "./connection";
import type { StoredDocument } from "./types";

export async function upsertDocument(client: DaemonGrpcClient, doc: StoredDocument): Promise<void> {
	await unary<UpsertDocumentResponse>((callback) => {
		client.upsertDocument(
			{
				spaceId: doc.spaceId,
				documentId: doc.documentId,
				contentJson: doc.contentJson,
				published: doc.published,
				updatedAtMs: Long.fromNumber(doc.updatedAtMs),
			},
			callback,
		);
	});
}

export async function getDocument(
	client: DaemonGrpcClient,
	spaceId: string,
	documentId: string,
): Promise<StoredDocument | null> {
	try {
		const res = await unary<GetDocumentResponse>((callback) => {
			client.getDocument(
				{
					spaceId,
					documentId,
				},
				callback,
			);
		});
		if (!res) return null;
		return {
			spaceId: res.spaceId,
			documentId: res.documentId,
			contentJson: res.contentJson,
			published: !!res.published,
			updatedAtMs: Number(res.updatedAtMs ?? Date.now()),
		};
	} catch (error: unknown) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

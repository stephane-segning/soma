import type {
	EnsurePageResponse,
	ListPagesResponse,
	SetPageParentsResponse,
	UpdatePageTitleResponse,
} from "@soma/proto/daemon/v1/daemon";
import Long from "long";

import type { DaemonGrpcClient } from "./connection";
import { isNotFound, unary } from "./connection";
import { fromPageRecord } from "./mappers";
import type { StoredPage } from "./types";

export async function ensurePage(client: DaemonGrpcClient, page: StoredPage): Promise<StoredPage> {
	const res = await unary<EnsurePageResponse>((callback) => {
		client.ensurePage(
			{
				spaceId: page.spaceId,
				pageId: page.pageId,
				title: page.title,
				parentPageIds: page.parentPageIds,
				createdAtMs: Long.fromNumber(page.createdAtMs),
				updatedAtMs: Long.fromNumber(page.updatedAtMs),
			},
			callback,
		);
	});
	if (!res.page) throw new Error("Daemon returned empty page");
	return fromPageRecord(res.page);
}

export async function listPages(client: DaemonGrpcClient, spaceId: string): Promise<StoredPage[]> {
	const res = await unary<ListPagesResponse>((callback) => {
		client.listPages(
			{
				spaceId,
			},
			callback,
		);
	});
	return (res.pages ?? []).map((page) => fromPageRecord(page));
}

export async function updatePageTitle(
	client: DaemonGrpcClient,
	spaceId: string,
	pageId: string,
	title: string,
): Promise<StoredPage | null> {
	try {
		const res = await unary<UpdatePageTitleResponse>((callback) => {
			client.updatePageTitle(
				{
					spaceId,
					pageId,
					title,
				},
				callback,
			);
		});
		return res.page ? fromPageRecord(res.page) : null;
	} catch (error: unknown) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

export async function setPageParents(
	client: DaemonGrpcClient,
	spaceId: string,
	pageId: string,
	parentPageIds: string[],
): Promise<StoredPage | null> {
	try {
		const res = await unary<SetPageParentsResponse>((callback) => {
			client.setPageParents(
				{
					spaceId,
					pageId,
					parentPageIds,
				},
				callback,
			);
		});
		return res.page ? fromPageRecord(res.page) : null;
	} catch (error: unknown) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

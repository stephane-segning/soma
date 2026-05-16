import type {
	CreateSpaceResponse,
	DeleteSpaceResponse,
	GetSpaceResponse,
	ListMyMembershipsResponse,
	ListSpaceMembersResponse,
	ListSpacesResponse,
	UpdateSpaceResponse,
} from "@soma/proto/daemon/v1/daemon";

import type { DaemonGrpcClient } from "./connection";
import { isNotFound, unary } from "./connection";
import { fromSpace, fromSpaceMember } from "./mappers";
import type { ListSpacesResult, StoredSpace, StoredSpaceMember } from "./types";

export async function listSpaces(
	client: DaemonGrpcClient,
	options?: { limit?: number; offset?: number; query?: string },
): Promise<ListSpacesResult> {
	const res = await unary<ListSpacesResponse>((callback) => {
		client.listSpaces(
			{
				limit: options?.limit ?? 50,
				offset: options?.offset ?? 0,
				q: options?.query,
			},
			callback,
		);
	});
	return {
		spaces: (res.spaces ?? []).map((space) => fromSpace(space)),
		limit: Number(res.limit ?? options?.limit ?? 50),
		offset: Number(res.offset ?? options?.offset ?? 0),
		nextOffset: res.nextOffset ?? null,
	};
}

export async function createSpace(
	client: DaemonGrpcClient,
	input: { spaceId?: string; displayName?: string },
): Promise<StoredSpace> {
	const res = await unary<CreateSpaceResponse>((callback) => {
		client.createSpace(
			{
				spaceId: input.spaceId ?? "",
				displayName: input.displayName ?? "",
			},
			callback,
		);
	});
	return {
		spaceId: res.spaceId || input.spaceId || "",
		displayName: input.displayName ?? "",
		ownerPeerId: res.ownerPeerId ?? "",
		createdAt: Date.now(),
	};
}

export async function getSpace(client: DaemonGrpcClient, spaceId: string): Promise<StoredSpace | null> {
	try {
		const res = await unary<GetSpaceResponse>((callback) => {
			client.getSpace(
				{
					spaceId,
				},
				callback,
			);
		});
		return res.space ? fromSpace(res.space) : null;
	} catch (error: unknown) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

export async function updateSpace(
	client: DaemonGrpcClient,
	input: { spaceId: string; displayName?: string },
): Promise<StoredSpace> {
	const res = await unary<UpdateSpaceResponse>((callback) => {
		client.updateSpace(
			{
				spaceId: input.spaceId,
				displayName: input.displayName ?? "",
			},
			callback,
		);
	});
	if (res.space) return fromSpace(res.space);
	return {
		spaceId: input.spaceId,
		displayName: input.displayName ?? "",
		ownerPeerId: "",
		createdAt: Date.now(),
	};
}

export async function deleteSpace(client: DaemonGrpcClient, spaceId: string): Promise<boolean> {
	const res = await unary<DeleteSpaceResponse>((callback) => {
		client.deleteSpace(
			{
				spaceId,
			},
			callback,
		);
	});
	return !!res.deleted;
}

export async function listSpaceMembers(client: DaemonGrpcClient, spaceId: string): Promise<StoredSpaceMember[]> {
	if (!spaceId) return [];
	const res = await unary<ListSpaceMembersResponse>((callback) => {
		client.listSpaceMembers(
			{
				spaceId,
			},
			callback,
		);
	});
	return (res.members ?? []).map((member) => fromSpaceMember(member));
}

export async function listMyMemberships(client: DaemonGrpcClient): Promise<StoredSpaceMember[]> {
	const res = await unary<ListMyMembershipsResponse>((callback) => {
		client.listMyMemberships({}, callback);
	});

	return (res.memberships ?? []).map((member) => fromSpaceMember(member));
}

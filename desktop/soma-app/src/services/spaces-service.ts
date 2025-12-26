import { invoke } from "@tauri-apps/api/core";

export type Space = {
	spaceId: string;
	displayName: string;
	ownerPeerId: string;
	createdAt: number;
};

export type ListSpacesResult = {
	spaces: Space[];
	limit: number;
	offset: number;
	nextOffset?: number | null;
};

export async function listSpaces(params?: {
	limit?: number;
	offset?: number;
	query?: string;
}): Promise<ListSpacesResult> {
	const payload = {
		limit: params?.limit,
		offset: params?.offset,
		q: params?.query,
	};
	return invoke<ListSpacesResult>("spaces_list", payload);
}

export async function createSpace(input: {
	spaceId?: string;
	displayName?: string;
}): Promise<Space> {
	const res = await invoke<Space>("spaces_create", {
		spaceId: input.spaceId,
		displayName: input.displayName,
	});
	return res;
}

export async function getSpace(spaceId: string): Promise<Space> {
	return invoke<Space>("spaces_get", { spaceId });
}

export async function updateSpace(input: {
	spaceId: string;
	displayName?: string;
}): Promise<Space> {
	return invoke<Space>("spaces_update", {
		spaceId: input.spaceId,
		displayName: input.displayName,
	});
}

export async function deleteSpace(spaceId: string): Promise<boolean> {
	return invoke<boolean>("spaces_delete", { spaceId });
}

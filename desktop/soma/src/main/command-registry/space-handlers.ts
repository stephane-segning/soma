import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerSpaceHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("spaces_list", (_event, params) => context.spaces.list(params));
	ipc.handle("spaces_list_members", (_event, params) => context.spaces.listMembers(params?.spaceId ?? ""));
	ipc.handle("spaces_list_my_memberships", () => context.spaces.listMyMemberships());
	ipc.handle("spaces_join", (_event, params) =>
		context.spaces.join({
			spaceId: params?.spaceId ?? "",
			targetPeerId: params?.targetPeerId ?? "",
			targetMultiaddrs: params?.targetMultiaddrs ?? [],
			displayName: params?.displayName,
			deviceName: params?.deviceName,
		}),
	);
	ipc.handle("spaces_list_join_requests", () => context.spaces.listJoinRequests());
	ipc.handle("spaces_decide_join", async (_event, params) => {
		const result = await context.spaces.decideJoin({
			requestId: params?.requestId ?? "",
			approve: params?.approve === true,
			role: params?.role,
			reason: params?.reason,
		});
		if (result?.spaceId) broadcastSpaceChanged(context, result.spaceId, "spaces_decide_join");
		broadcastSpacesChanged(context, "spaces_decide_join");
		return result;
	});
	ipc.handle("spaces_revoke_member", async (_event, params) => {
		const accepted = await context.spaces.revokeMembership({
			spaceId: params?.spaceId ?? "",
			subjectPeerId: params?.subjectPeerId ?? "",
			reason: params?.reason,
		});
		if (accepted && params?.spaceId) broadcastSpaceChanged(context, params.spaceId, "spaces_revoke_member");
		if (accepted) broadcastSpacesChanged(context, "spaces_revoke_member");
		return accepted;
	});
	ipc.handle("spaces_issue_issuer_capability", async (_event, params) => {
		const accepted = await context.spaces.issueIssuerCapability({
			spaceId: params?.spaceId ?? "",
			targetPeerId: params?.targetPeerId ?? "",
			expiresAt: Number(params?.expiresAt ?? 0),
		});
		if (accepted && params?.spaceId)
			broadcastSpaceChanged(context, params.spaceId, "spaces_issue_issuer_capability");
		return accepted;
	});
	ipc.handle("spaces_create", async (_event, params) => {
		const space = await context.spaces.create(params ?? {});
		broadcastSpacesChanged(context, "spaces_create");
		return space;
	});
	ipc.handle("spaces_get", (_event, params) => context.spaces.get(params?.spaceId));
	ipc.handle("spaces_update", async (_event, params) => {
		const space = await context.spaces.update(params);
		broadcastSpaceChanged(context, space.spaceId, "spaces_update");
		return space;
	});
	ipc.handle("spaces_delete", async (_event, params) => {
		const result = await context.spaces.delete(params?.spaceId ?? "");
		broadcastSpacesChanged(context, "spaces_delete");
		return result;
	});
}

function broadcastSpaceChanged(context: CommandRegistryContext, spaceId: string, reason: string): void {
	context.domainEvents.broadcast({
		kind: "space-changed",
		source: "renderer",
		atMs: Date.now(),
		spaceId,
		reason,
	});
}

function broadcastSpacesChanged(context: CommandRegistryContext, reason: string): void {
	context.domainEvents.broadcast({
		kind: "spaces-changed",
		source: "renderer",
		atMs: Date.now(),
		reason,
	});
}

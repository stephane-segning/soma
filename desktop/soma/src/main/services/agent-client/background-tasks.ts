import type {
	BackgroundTask as ProtoBackgroundTask,
	EnqueueBackgroundTaskResponse,
	ListBackgroundTasksResponse,
} from "@soma/proto/agent/v1/agent";

import type { AgentGrpcClient } from "./connection";
import { unary } from "./connection";
import { mapBackgroundTask, toProtoTaskKind } from "./mappers";
import type { BackgroundTask, EnqueueBackgroundTaskParams, ListBackgroundTasksParams } from "./types";

export async function enqueueBackgroundTask(
	client: AgentGrpcClient,
	params: EnqueueBackgroundTaskParams,
): Promise<BackgroundTask> {
	validateBackgroundTask(params);
	const response = await unary<EnqueueBackgroundTaskResponse>((callback) => {
		client.enqueueBackgroundTask(
			{
				kind: toProtoTaskKind(params.kind),
				spaceId: params.spaceId,
				documentId: params.documentId,
				selectionText: params.selectionText,
				model: params.model ?? "",
				persistInDocument: params.persistInDocument ?? false,
			},
			callback,
		);
	});

	if (!response.task) {
		throw new Error("agentd did not return the enqueued task");
	}
	return mapBackgroundTask(response.task);
}

export async function listBackgroundTasks(
	client: AgentGrpcClient,
	params: ListBackgroundTasksParams = {},
): Promise<BackgroundTask[]> {
	const response = await unary<ListBackgroundTasksResponse>((callback) => {
		client.listBackgroundTasks(
			{
				spaceId: params.spaceId ?? "",
				limit: params.limit ?? 50,
			},
			callback,
		);
	});

	return (response.tasks ?? []).map((task: ProtoBackgroundTask) => mapBackgroundTask(task));
}

function validateBackgroundTask(params: EnqueueBackgroundTaskParams): void {
	if (!params.spaceId?.trim()) {
		throw new Error("spaceId is required");
	}
	if (!params.documentId?.trim()) {
		throw new Error("documentId is required");
	}
	if (!params.selectionText?.trim()) {
		throw new Error("selectionText is required");
	}
}

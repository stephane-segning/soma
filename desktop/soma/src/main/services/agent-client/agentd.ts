import * as grpc from "@grpc/grpc-js";
import {
	type ChatStreamEvent,
	type ListModelsResponse,
	type RerankResponse,
	type ResolveDriftResponse,
	type StatusResponse,
} from "@soma/proto/agent/v1/agent";
import Long from "long";

import type { AgentGrpcClient } from "./connection";
import { isUnimplemented, unary } from "./connection";
import { mapModelInfo } from "./mappers";
import type { AgentModel, ChatMessage, ChatOptions, RerankParams, RerankResult, ResolveDriftParams, ResolveDriftResult, StreamEvent } from "./types";

export async function chatStreamViaAgentd(
	client: AgentGrpcClient,
	messages: ChatMessage[],
	options: ChatOptions = {},
): Promise<StreamEvent> {
	try {
		const stream: grpc.ClientReadableStream<ChatStreamEvent> = client.chatStream({
			model: options.model ?? "",
			messages: messages.map((message) => ({
				role: message.role,
				content: message.content,
			})),
			temperature: options.temperature ?? 0,
			maxTokens: Long.fromNumber(options.maxTokens ?? 256),
		});

		let combined = "";
		return await new Promise<StreamEvent>((resolve, reject) => {
			stream.on("data", (chunk: ChatStreamEvent) => {
				if (chunk.token) combined += chunk.token;
				if (chunk.done?.content) combined += chunk.done.content;
			});
			stream.on("end", () =>
				resolve({
					token: combined,
					done: true,
				}),
			);
			stream.on("error", (err) => reject(err));
		});
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function listModelsViaAgentd(client: AgentGrpcClient): Promise<AgentModel[]> {
	try {
		const res = await unary<ListModelsResponse>((callback) => {
			client.listModels({}, callback);
		});
		return (res.models ?? []).map((model) => mapModelInfo(model));
	} catch (error: unknown) {
		if (!isUnimplemented(error)) throw error;
		const status = await unary<StatusResponse>((callback) => {
			client.status({}, callback);
		});
		return (status.models ?? []).map((model) => mapModelInfo(model));
	}
}

export async function rerankViaAgentd(client: AgentGrpcClient, params: RerankParams): Promise<RerankResult[]> {
	const res = await unary<RerankResponse>((callback) => {
		client.rerank(
			{
				query: params.query,
				candidates: params.candidates,
				model: params.model ?? "",
				topN: params.topN ?? 0,
			},
			callback,
		);
	});

	const results = res.results ?? [];
	return results.slice().sort((a, b) => a.rank - b.rank);
}

export async function resolveDriftViaAgentd(
	client: AgentGrpcClient,
	params: ResolveDriftParams,
): Promise<ResolveDriftResult> {
	if (!params.leftUpdateBase64?.trim()) {
		throw new Error("leftUpdateBase64 is required");
	}
	if (!params.rightUpdateBase64?.trim()) {
		throw new Error("rightUpdateBase64 is required");
	}

	const res = await unary<ResolveDriftResponse>((callback) => {
		client.resolveDrift(
			{
				leftUpdate: Buffer.from(params.leftUpdateBase64, "base64"),
				rightUpdate: Buffer.from(params.rightUpdateBase64, "base64"),
			},
			callback,
		);
	});

	const merged = res.mergedUpdate ?? Buffer.alloc(0);
	return {
		mergedUpdateBase64: merged.toString("base64"),
	};
}

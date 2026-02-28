import { useChatConversation } from "@app/hooks/use-chat-conversation.ts";
import {
	AGENT_CONFIG_SETTINGS_KEY,
	normalizeAgentRuntimeConfig,
	resolveEffectiveWorkspaceAgentConfig,
} from "@app/lib/agent-config";
import { useSettingQuery } from "@app/queries/settings";
import { listBackgroundTasks } from "@app/services/chat-service";
import { api } from "@app/store/api";
import { AiChat } from "@soma/ui/components/chat/ai-chat";
import { AiConversation } from "@soma/ui/components/chat/ai-conversation";
import { AiInput } from "@soma/ui/components/forms/ai-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

function ChatSidebar(): React.JSX.Element {
	const location = useLocation();
	const spaceId = useMemo(() => parseSpaceIdFromPath(location.pathname), [location.pathname]);
	const { data: rawAgentConfig } = useSettingQuery(AGENT_CONFIG_SETTINGS_KEY);
	const effectiveConfig = useMemo(
		() => resolveEffectiveWorkspaceAgentConfig(normalizeAgentRuntimeConfig(rawAgentConfig), spaceId),
		[rawAgentConfig, spaceId],
	);

	const { data, error } = api.useListAgentModelsQuery(spaceId, {
		// leave cache around; listModels is cheap
		refetchOnMountOrArgChange: false,
	});

	const chatModels = useMemo(() => {
		const models = data ?? [];
		const configuredByName = effectiveConfig.modelCapabilities;
		const filtered = models.filter((model) => {
			const configured = configuredByName[model.name];
			if (typeof configured?.chat === "boolean") {
				return configured.chat;
			}
			if (model.name === effectiveConfig.chatModel) {
				return true;
			}
			return model.kind === "chat";
		});

		if (filtered.some((model) => model.name === effectiveConfig.chatModel)) {
			return filtered;
		}
		if (!effectiveConfig.chatModel) {
			return filtered;
		}
		return [
			{
				name: effectiveConfig.chatModel,
				kind: "unknown" as const,
				path: "",
				loaded: false,
			},
			...filtered,
		];
	}, [data, effectiveConfig]);

	const [selectedModel, setSelectedModel] = useState<string>(() => effectiveConfig.chatModel);
	const [draft, setDraft] = useState("");

	useEffect(() => {
		if (selectedModel && chatModels.some((model) => model.name === selectedModel)) {
			return;
		}
		if (chatModels.some((model) => model.name === effectiveConfig.chatModel)) {
			setSelectedModel(effectiveConfig.chatModel);
			return;
		}
		if (chatModels.length > 0) {
			setSelectedModel(chatModels[0].name);
			return;
		}
		setSelectedModel("");
	}, [chatModels, selectedModel, effectiveConfig.chatModel]);

	const { visibleMessages, isSending, sendPrompt, appendMessage } = useChatConversation({
		model: selectedModel || effectiveConfig.chatModel,
		spaceId,
	});
	const seenTaskIdsBySpaceRef = useRef<Map<string, Set<string>>>(new Map());

	useEffect(() => {
		if (!spaceId) return;
		let active = true;
		const seen = seenTaskIdsBySpaceRef.current.get(spaceId) ?? new Set<string>();
		seenTaskIdsBySpaceRef.current.set(spaceId, seen);

		const poll = async () => {
			try {
				const tasks = await listBackgroundTasks({
					spaceId,
					limit: 100,
				});
				if (!active) return;

				const pendingMessages = tasks
					.filter(
						(task) =>
							task.kind === "research-selection" &&
							task.status === "succeeded" &&
							task.resultText.trim().length > 0 &&
							!seen.has(task.taskId),
					)
					.reverse();

				for (const task of pendingMessages) {
					seen.add(task.taskId);
					appendMessage({
						role: "assistant",
						content: `Research result:\n\n${task.resultText.trim()}`,
					});
				}
			} catch (error) {
				console.warn("failed to poll background tasks", error);
			}
		};

		void poll();
		const timer = window.setInterval(() => {
			void poll();
		}, 4_000);

		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [appendMessage, spaceId]);

	const handleSend = () => {
		const prompt = draft.trim();
		if (!prompt || isSending) return;

		setDraft(() => "");
		sendPrompt(prompt, selectedModel || effectiveConfig.chatModel);
	};

	if (error) {
		console.error(error);
	}

	return (
		<div className="flex h-full flex-col gap-1 text-sm antialiased">
			<div className="grow overflow-y-scroll">
				<AiChat className="min-h-full">
					<AiConversation messages={visibleMessages as any} />
				</AiChat>
			</div>

			<AiInput
				className="border-base-300 border-t pb-2"
				modelSelector={
					<>
						{chatModels.length > 0 && (
							<select
								className="select select-sm select-ghost"
								defaultValue="Pick a font"
								onChange={(e) => setSelectedModel(e.target.value)}
							>
								{chatModels.map((a) => (
									<option id={a.name} key={a.name}>
										{a.name}
									</option>
								))}
							</select>
						)}

						{!chatModels.length && <span className="text-sm">No models</span>}
					</>
				}
				onChange={setDraft}
				onSend={handleSend}
				textareaProps={{
					maxRows: 8,
				}}
				value={draft}
			/>
		</div>
	);
}

export { ChatSidebar };

function parseSpaceIdFromPath(pathname: string): string | undefined {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length < 2) return undefined;
	if (parts[0] !== "spaces") return undefined;
	const spaceId = parts[1]?.trim();
	return spaceId || undefined;
}

import type * as B from "../bindings";
import type { Transport } from "../transport";

export function agent(t: Transport) {
	return {
		chat: (args: B.ChatStreamArgs) => t.invoke<B.ChatResponse>("agent_chat_stream", { args }),
		listModels: (spaceId: string | null = null) => t.invoke<B.AgentModel[]>("agent_list_models", { spaceId }),
		rerank: (args: B.RerankParams) => t.invoke<B.RerankResult[]>("agent_rerank", { args }),
		resolveDrift: (args: B.ResolveDriftParams) => t.invoke<B.ResolveDriftResult>("agent_resolve_drift", { args }),
		enqueueBackgroundTask: (args: B.EnqueueBackgroundTaskParams) =>
			t.invoke<B.BackgroundTask>("agent_enqueue_background_task", { args }),
		listBackgroundTasks: (args: B.ListBackgroundTasksParams | null = null) =>
			t.invoke<B.BackgroundTask[]>("agent_list_background_tasks", { args }),
		/**
		 * Per-space AI provider configuration. Config lives in the same
		 * database on both transports (Tauri and the BFF read/write
		 * through the same `soma-daemon`-owned SQLite file), so every
		 * method here is a real command on both — never gated to Tauri
		 * only the way `backend.settings`/`backend.dbStorage` are.
		 *
		 * Resolution order for actual chat/embed calls is space -> default
		 * -> compiled-in constants; these methods operate on the raw
		 * override row for one scope at a time (get/set/clear), not the
		 * resolved/effective value. `set*` is a whole-state overwrite —
		 * send the complete desired form state on every call, not a
		 * sparse patch (a field left `null`/undefined clears that
		 * column's override). The API key is write-only: `get*` only ever
		 * reports `hasApiKey`, never the value; use `apiKey` on `set*` to
		 * change it (`{ kind: "unchanged" }` is the default when omitted).
		 */
		config: {
			getDefault: () => t.invoke<B.AgentProviderConfigView>("agent_config_get_default"),
			getSpace: (spaceId: string) => t.invoke<B.AgentProviderConfigView>("agent_config_get_space", { spaceId }),
			setDefault: (args: B.SetDefaultAgentProviderConfigArgs) =>
				t.invoke<B.AgentProviderConfigView>("agent_config_set_default", { args }),
			setSpace: (args: B.SetSpaceAgentProviderConfigArgs) =>
				t.invoke<B.AgentProviderConfigView>("agent_config_set_space", { args }),
			clearDefault: () => t.invoke<boolean>("agent_config_clear_default"),
			clearSpace: (spaceId: string) => t.invoke<boolean>("agent_config_clear_space", { spaceId }),
			/**
			 * Probes `{baseUrl}/models` with the given credentials/timeout
			 * — not necessarily saved config, so the UI can validate a
			 * field on blur (ADR-0005 §3) before or instead of persisting
			 * it. Never rejects on an unreachable/misconfigured endpoint;
			 * that's reported as `{ ok: false, error }`, not a thrown
			 * `BackendError` — only a genuine transport/auth failure
			 * (e.g. the session itself is unauthenticated) rejects.
			 */
			validate: (args: B.ValidateAgentProviderConfigArgs) =>
				t.invoke<B.ValidateAgentProviderConfigResult>("agent_config_validate", { args }),
		},
	};
}

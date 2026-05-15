import type { Dispatch, SetStateAction } from "react";
import type { AgentRuntimeConfig } from "./use-global-agent-settings";

type ConnectivitySectionProps = {
	draft: AgentRuntimeConfig;
	setDraft: Dispatch<SetStateAction<AgentRuntimeConfig>>;
	title: string;
};

export function ConnectivitySection({ draft, setDraft, title }: ConnectivitySectionProps): React.JSX.Element {
	return (
		<div className="card border border-base-300 bg-base-100">
			<div className="card-body space-y-4">
				<h2 className="card-title text-base">{title}</h2>
				<p className="text-base-content/70 text-sm">
					Local work already on this device stays usable on weak networks. Peer-dependent actions like new joins,
					first-time attachment fetches, and remote updates may wait until another peer is reachable.
				</p>
				<div className="grid gap-3 md:grid-cols-3">
					<ConnectivityNote title="Works locally now" text="Pages and attachments already stored on this device remain available." />
					<ConnectivityNote title="May complete later" text="Access requests, attachments this device has not downloaded yet, and remote updates can wait for connectivity." />
					<ConnectivityNote title="Improves with infra" text="Discovery services help devices find each other. Always-on bots can keep shared attachments available." />
				</div>
				<div className="rounded-xl border border-base-300 bg-base-200/40 px-4 py-3 text-sm text-base-content/70">
					Peer connectivity helps members reach each other. It does not bypass workspace membership, and discovery services do not store your private content.
				</div>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3 text-sm">
						<div className="font-medium">Provider</div>
						<div className="mt-1 text-base-content/70 text-xs">OpenAI-compatible endpoint</div>
					</div>
					<AgentTextInput label="API base URL" onChange={(openAiBaseUrl) => setDraft((prev) => ({ ...prev, openAiBaseUrl }))} placeholder="http://127.0.0.1:11434/v1" value={draft.openAiBaseUrl} />
					<AgentTextInput label="API key (optional)" onChange={(openAiApiKey) => setDraft((prev) => ({ ...prev, openAiApiKey }))} placeholder="sk-..." type="password" value={draft.openAiApiKey ?? ""} />
					<AgentTextInput label="Default chat model" onChange={(openAiChatModel) => setDraft((prev) => ({ ...prev, openAiChatModel }))} placeholder="llama3.2" value={draft.openAiChatModel} />
					<AgentTextInput label="Default embed model" onChange={(openAiEmbedModel) => setDraft((prev) => ({ ...prev, openAiEmbedModel }))} placeholder="nomic-embed-text" value={draft.openAiEmbedModel} />
					<AgentNumberInput label="Request timeout (ms)" min={3000} onChange={(requestTimeoutMs) => setDraft((prev) => ({ ...prev, requestTimeoutMs }))} value={draft.requestTimeoutMs} />
					<AgentNumberInput label="Status poll interval (ms)" min={1000} onChange={(pollIntervalMs) => setDraft((prev) => ({ ...prev, pollIntervalMs }))} value={draft.pollIntervalMs} />
				</div>
			</div>
		</div>
	);
}

function ConnectivityNote({ title, text }: { title: string; text: string }) {
	return (
		<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3 text-sm">
			<div className="font-medium">{title}</div>
			<div className="mt-1 text-base-content/70 text-xs">{text}</div>
		</div>
	);
}

function AgentTextInput({ label, onChange, placeholder, type, value }: { label: string; onChange: (value: string) => void; placeholder: string; type?: string; value: string }) {
	return (
		<label className="form-control w-full">
			<span className="label-text">{label}</span>
			<input className="input input-bordered w-full" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} />
		</label>
	);
}

function AgentNumberInput({ label, min, onChange, value }: { label: string; min: number; onChange: (value: number) => void; value: number }) {
	return (
		<label className="form-control w-full">
			<span className="label-text">{label}</span>
			<input className="input input-bordered w-full" min={min} onChange={(event) => onChange(Number(event.target.value || value))} type="number" value={value} />
		</label>
	);
}

/**
 * Live readout of the Rust backend. Polls daemon status (until ready),
 * fetches the spaces list once the daemon is up, and tails the
 * domain/agent event streams. End-to-end demo for the new `BackendApi`.
 */

import { useEffect, useState } from "react";
import { type AgentRuntimeEvent, backend, type DaemonStatus, type DomainEvent, type StoredSpace } from "../lib/backend";

type Ready =
	| { phase: "booting" }
	| { phase: "error"; message: string }
	| { phase: "ready"; status: DaemonStatus; spaces: StoredSpace[] };

type WithId<T> = T & { _id: number };

let eventIdCounter = 0;
const stamp = <T,>(e: T): WithId<T> => ({ ...e, _id: ++eventIdCounter });

export function BackendStatusPanel(): React.JSX.Element {
	const [state, setState] = useState<Ready>({ phase: "booting" });
	const [domainEvents, setDomainEvents] = useState<WithId<DomainEvent>[]>([]);
	const [agentEvents, setAgentEvents] = useState<WithId<AgentRuntimeEvent>[]>([]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			while (!cancelled) {
				try {
					const ready = await backend.daemon.isReady();
					if (ready) {
						const [status, spacesPage] = await Promise.all([
							backend.daemon.status(),
							backend.spaces.list({ limit: 25 }),
						]);
						if (!cancelled) setState({ phase: "ready", status, spaces: spacesPage.spaces });
						return;
					}
				} catch (err) {
					if (!cancelled) setState({ phase: "error", message: (err as Error).message });
				}
				await new Promise((r) => setTimeout(r, 500));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const offDomain = backend.events.onDomain((e) => setDomainEvents((prev) => [stamp(e), ...prev].slice(0, 8)));
		const offAgent = backend.events.onAgent((e) => setAgentEvents((prev) => [stamp(e), ...prev].slice(0, 8)));
		const offDeep = backend.events.onDeepLink((url) => console.info("[deep-link]", url));
		return () => {
			offDomain();
			offAgent();
			offDeep();
		};
	}, []);

	return (
		<section className="grid grid-cols-1 gap-3 rounded-lg border border-base-300 bg-base-200/40 p-4 md:grid-cols-2">
			<StatusCard state={state} />
			<EventsCard agentEvents={agentEvents} domainEvents={domainEvents} />
		</section>
	);
}

function StatusCard({ state }: { state: Ready }): React.JSX.Element {
	if (state.phase === "booting") {
		return <Card body="Starting…" title="Daemon" />;
	}
	if (state.phase === "error") {
		return <Card body={`Error: ${state.message}`} title="Daemon" tone="error" />;
	}
	const { status, spaces } = state;
	return (
		<Card
			body={
				<>
					<KeyValue k="peerId" v={status.peerId || "—"} />
					<KeyValue k="listenAddrs" v={status.listenAddrs.length ? status.listenAddrs.join(", ") : "—"} />
					<KeyValue k="spaces" v={`${spaces.length}`} />
				</>
			}
			title="Daemon"
		/>
	);
}

function EventsCard({
	domainEvents,
	agentEvents,
}: {
	domainEvents: WithId<DomainEvent>[];
	agentEvents: WithId<AgentRuntimeEvent>[];
}): React.JSX.Element {
	return (
		<Card
			body={
				<>
					<p className="text-xs opacity-60">domain ({domainEvents.length})</p>
					<ul className="mb-2 text-xs">
						{domainEvents.length === 0 ? (
							<li className="opacity-40">no events yet</li>
						) : (
							domainEvents.map((e) => (
								<li className="truncate font-mono" key={e._id}>
									{e.kind}
								</li>
							))
						)}
					</ul>
					<p className="text-xs opacity-60">agent ({agentEvents.length})</p>
					<ul className="text-xs">
						{agentEvents.length === 0 ? (
							<li className="opacity-40">no events yet</li>
						) : (
							agentEvents.map((e) => (
								<li className="truncate font-mono" key={e._id}>
									{e.kind}
								</li>
							))
						)}
					</ul>
				</>
			}
			title="Live events"
		/>
	);
}

function Card({ title, body, tone }: { title: string; body: React.ReactNode; tone?: "error" }): React.JSX.Element {
	const toneClass = tone === "error" ? "text-error" : "";
	return (
		<div className="rounded-md border border-base-300 bg-base-100/60 p-3">
			<h2 className="mb-1 font-semibold text-xs uppercase tracking-wide opacity-60">{title}</h2>
			<div className={`text-sm ${toneClass}`}>{body}</div>
		</div>
	);
}

function KeyValue({ k, v }: { k: string; v: string }): React.JSX.Element {
	return (
		<p className="truncate text-xs">
			<span className="opacity-50">{k}</span> <span className="font-mono">{v}</span>
		</p>
	);
}

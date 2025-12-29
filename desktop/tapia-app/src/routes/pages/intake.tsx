import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart2, Clock, RefreshCw, Zap } from "react-feather";
import { Link } from "react-router";
import { PolymorphButton } from "soma-ui/components/actions/polymorph-button";
import { DesktopArea } from "soma-ui/components/layout/desktop-area";
import { DesktopShell } from "soma-ui/components/layout/desktop-shell";
import { Taskbar } from "soma-ui/components/layout/taskbar";
import { WindowChrome } from "soma-ui/components/layout/window-chrome";
import type { DesktopIcon, RunningApp } from "soma-ui/types";
import { usePersistentStatus } from "../../hooks/use-persistent-status";

type DeepLinkPayload = {
	host: string;
	exerciseId: string;
	raw: string;
};

type RemoteExercise = {
	message: string;
	topic?: string;
	difficulty?: string;
	spaceId?: string;
	tags?: string[];
	source?: string;
};

type ActiveExercise = {
	text: string;
	meta: {
		id: string;
		spaceId: string;
		topic?: string;
		difficulty?: string;
		length: number;
		cid?: string;
		sourceHost?: string;
		sourceLink?: string;
	};
};

type BlobUpload = {
	cid: string;
	size: number;
	mime: string;
	name: string;
};

const INITIAL_STATUS = "Waiting for tapia:// link";

function IntakePage() {
	const { status, setStatus } = usePersistentStatus(INITIAL_STATUS);
	const [incoming, setIncoming] = useState<DeepLinkPayload | null>(null);
	const [exercise, setExercise] = useState<ActiveExercise | null>(null);
	const [exerciseCid, setExerciseCid] = useState<string | null>(null);
	const [input, setInput] = useState<string>("");
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [completedAt, setCompletedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const unlistenPromise = listen<DeepLinkPayload>(
			"tapia://exercise",
			(event) => {
				const payload = event.payload;
				setIncoming(payload);
				setStatus("Fetching exercise from link…");
				setExercise(null);
				setExerciseCid(null);
				setError(null);
			},
		);

		return () => {
			void unlistenPromise.then((unlisten) => unlisten());
		};
	}, [setStatus]);

	useEffect(() => {
		setInput("");
		setStartedAt(null);
		setCompletedAt(null);
	}, [exercise?.meta.id]);

	const correctCharacters = useMemo(() => {
		if (!exercise) return 0;
		let correct = 0;
		for (let index = 0; index < input.length; index += 1) {
			if (exercise.text[index] === input[index]) correct += 1;
		}
		return correct;
	}, [exercise, input]);

	const accuracy =
		input.length === 0
			? 100
			: Math.max(0, Math.round((correctCharacters / input.length) * 1000) / 10);
	const elapsedMs = startedAt ? (completedAt ?? Date.now()) - startedAt : 0;
	const wpm =
		elapsedMs > 0 && startedAt
			? Math.round((correctCharacters / 5 / (elapsedMs / 1000)) * 60 * 100) /
				100
			: 0;

	useEffect(() => {
		if (!exercise) return;
		if (!startedAt && input.length > 0) {
			setStartedAt(Date.now());
		}
	}, [exercise, input.length, startedAt]);

	const stageMutation = useMutation({
		mutationFn: async ({
			active,
			remote,
			payload,
		}: {
			active: ActiveExercise;
			remote: RemoteExercise;
			payload: DeepLinkPayload;
		}) => {
			const response = await invoke<BlobUpload>("stage_exercise", {
				spaceId: active.meta.spaceId,
				exerciseId: active.meta.id,
				text: active.text,
				topic: active.meta.topic,
				difficulty: active.meta.difficulty,
				source: remote.source ?? "deep-link",
				sourceHost: payload.host,
				sourceLink: payload.raw,
				tags: remote.tags,
			});
			return response;
		},
		onSuccess: (upload) => {
			setExerciseCid(upload.cid);
			setExercise((prev) =>
				prev ? { ...prev, meta: { ...prev.meta, cid: upload.cid } } : prev,
			);
		},
		onError: (err) => {
			console.warn("failed to stage exercise blob", err);
		},
	});

	const recordBenchmarkMutation = useMutation({
		mutationFn: async ({
			active,
			metrics,
		}: {
			active: ActiveExercise;
			metrics: {
				wpm: number;
				accuracy: number;
				durationMs: number;
				completedAtMs: number;
			};
		}) => {
			const upload = await invoke<BlobUpload>("record_benchmark", {
				spaceId: active.meta.spaceId,
				exerciseId: active.meta.id,
				exerciseCid: active.meta.cid ?? exerciseCid,
				wpm: metrics.wpm,
				accuracy: metrics.accuracy,
				durationMs: metrics.durationMs,
				completedAtMs: metrics.completedAtMs,
				sourceHost: active.meta.sourceHost,
				sourceLink: active.meta.sourceLink,
			});
			return upload;
		},
		onSuccess: (upload) => {
			setExerciseCid(upload.cid);
			setStatus("Benchmark saved to daemon");
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Failed to save benchmark");
			setStatus("Benchmark save failed");
		},
	});

	useEffect(() => {
		if (!exercise || !startedAt || completedAt) return;
		if (input.length !== exercise.meta.length) return;

		const finished = Date.now();
		setCompletedAt(finished);
		void recordBenchmarkMutation.mutateAsync({
			active: exercise,
			metrics: {
				wpm,
				accuracy,
				durationMs: finished - startedAt,
				completedAtMs: finished,
			},
		});
	}, [
		accuracy,
		completedAt,
		exercise,
		input.length,
		recordBenchmarkMutation,
		startedAt,
		wpm,
	]);

	const exerciseQuery = useQuery({
		enabled: Boolean(incoming),
		queryKey: ["tapia", "exercise", incoming?.exerciseId, incoming?.host],
		queryFn: async () => {
			if (!incoming) throw new Error("No deep link");
			const remote = await fetchExercise(incoming);
			const active: ActiveExercise = {
				text: remote.message,
				meta: {
					id: incoming.exerciseId,
					spaceId: remote.spaceId ?? incoming.host,
					topic: remote.topic,
					difficulty: remote.difficulty,
					length: remote.message.length,
					sourceHost: incoming.host,
					sourceLink: incoming.raw,
				},
			};
			setExercise(active);
			stageMutation.mutate({ active, remote, payload: incoming });
			return remote;
		},
		staleTime: 0,
		cacheTime: 0,
		retry: 0,
		onSuccess: () => setStatus("Ready to type"),
		onError: (err) => {
			const message =
				err instanceof Error ? err.message : "Failed to load exercise";
			setError(message);
			setStatus("Could not fetch exercise");
		},
	});

	const fetchExercise = async (
		payload: DeepLinkPayload,
	): Promise<RemoteExercise> => {
		const host = payload.host.replace(/\/+$/, "");
		const candidates = [
			`https://${host}/api/tapia/exercises/${payload.exerciseId}`,
			`https://${host}/tapia/exercises/${payload.exerciseId}`,
			`https://${host}/${payload.exerciseId}`,
			`http://${host}/api/tapia/exercises/${payload.exerciseId}`,
			`http://${host}/tapia/exercises/${payload.exerciseId}`,
			`http://${host}/${payload.exerciseId}`,
		];

		let lastError: Error | null = null;
		for (const url of candidates) {
			try {
				const response = await fetch(url, {
					headers: { Accept: "application/json" },
				});
				if (!response.ok)
					throw new Error(`request failed (${response.status})`);
				const data: unknown = await response.json();
				const parsed = parseRemoteExercise(data);
				return parsed;
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
			}
		}

		throw lastError ?? new Error("no valid exercise endpoint found");
	};

	const parseRemoteExercise = (data: unknown): RemoteExercise => {
		if (!data || typeof data !== "object") {
			throw new Error("exercise payload must be an object");
		}
		const maybeMessage =
			(data as Record<string, unknown>).message ??
			(data as Record<string, unknown>).text;
		if (!maybeMessage || typeof maybeMessage !== "string") {
			throw new Error("exercise payload is missing 'message' or 'text'");
		}
		const topic = (data as Record<string, unknown>).topic;
		const difficulty = (data as Record<string, unknown>).difficulty;
		const spaceId = (data as Record<string, unknown>).spaceId;
		const tags = (data as Record<string, unknown>).tags;
		const source = (data as Record<string, unknown>).source;

		return {
			message: maybeMessage,
			topic: typeof topic === "string" ? topic : undefined,
			difficulty: typeof difficulty === "string" ? difficulty : undefined,
			spaceId: typeof spaceId === "string" ? spaceId : undefined,
			tags: Array.isArray(tags) ? (tags as string[]) : undefined,
			source: typeof source === "string" ? source : undefined,
		};
	};

	const reset = (): void => {
		setInput("");
		setStartedAt(null);
		setCompletedAt(null);
		setStatus("Ready to type");
		setError(null);
	};

	const progressPercent =
		exercise && exercise.meta.length > 0
			? Math.round((input.length / exercise.meta.length) * 100)
			: 0;

	const chromeStatus: "online" | "syncing" | "offline" = error
		? "offline"
		: incoming
			? "online"
			: "syncing";

	const shortcuts: DesktopIcon[] = useMemo(
		() => [
			{
				id: "status",
				label: "Status",
				hint: status,
				icon: <Activity size={18} />,
			},
			{
				id: "incoming",
				label: incoming ? "Latest deep link" : "Waiting for tapia://",
				hint: incoming ? `${incoming.host}` : "Launch a tapia:// link to start",
				icon: <Zap size={18} />,
			},
			{
				id: "reset",
				label: "Reset input",
				hint: input ? `${input.length} chars typed` : "Clear typing state",
				icon: <RefreshCw size={18} />,
			},
		],
		[incoming, input, status],
	);

	const handleShortcut = (item: DesktopIcon) => {
		if (item.id === "reset") {
			reset();
			return;
		}
		if (item.id === "incoming" && incoming) {
			exerciseQuery.refetch();
		}
	};

	const taskbarApps: RunningApp[] = useMemo(
		() => [
			{
				id: "exercise",
				title: exercise ? `Exercise ${exercise.meta.id}` : "Exercise intake",
				status: exercise ? "running" : "sleeping",
				badge: exerciseCid ? "saved" : undefined,
			},
			{
				id: "benchmark",
				title: "Benchmark logger",
				status: completedAt ? "attention" : "sleeping",
				badge: completedAt ? `${Math.round(elapsedMs / 1000)}s` : undefined,
			},
		],
		[completedAt, elapsedMs, exercise, exerciseCid],
	);

	return (
		<DesktopShell
			className="relative"
			footer={
				<Taskbar
					activeAppId="exercise"
					apps={taskbarApps}
					tray={
						<span className="badge badge-ghost badge-sm border-none">
							{status}
						</span>
					}
				/>
			}
			header={({
				hasLeft,
				hasRight,
				leftOpen,
				rightOpen,
				toggleLeft,
				toggleRight,
			}) => (
				<div data-tauri-drag-region>
					<WindowChrome
						actions={
							<div className="flex items-center gap-2" data-no-drag>
								{hasLeft ? (
									<PolymorphButton
										onClick={toggleLeft}
										size="sm"
										variant="ghost"
									>
										{leftOpen ? "Hide shortcuts" : "Show shortcuts"}
									</PolymorphButton>
								) : null}
								{hasRight ? (
									<PolymorphButton
										onClick={toggleRight}
										size="sm"
										variant="ghost"
									>
										{rightOpen ? "Hide sidebar" : "Show sidebar"}
									</PolymorphButton>
								) : null}
							</div>
						}
						status={chromeStatus}
						subtitle="Deep link to typing exercises"
						title="Tapia intake"
					/>
				</div>
			)}
			initialLeftWidth={280}
			initialRightWidth={320}
			leftColumn={
				<div className="space-y-3">
					<p className="px-1 text-base-content/60 text-xs uppercase tracking-[0.1em]">
						Quick actions
					</p>
					<DesktopArea
						contextMenuItems={() => []}
						emptyHint="Waiting for a tapia:// link."
						items={shortcuts}
						onActivate={handleShortcut}
					/>
				</div>
			}
			rightColumn={
				<div className="space-y-3">
					<div className="glass-panel rounded-2xl p-3">
						<p className="text-base-content/60 text-xs uppercase">Live stats</p>
						<div className="mt-3 grid grid-cols-2 gap-2">
							<StatChip label="WPM" value={wpm.toFixed(2)} />
							<StatChip label="Accuracy" value={`${accuracy.toFixed(1)}%`} />
							<StatChip
								label="Progress"
								value={exercise ? `${progressPercent}%` : "—"}
							/>
							<StatChip
								label="Elapsed"
								value={`${Math.round(elapsedMs / 1000)}s`}
							/>
						</div>
					</div>
					<div className="glass-panel rounded-2xl p-3">
						<p className="text-base-content/60 text-xs uppercase">Link inbox</p>
						{incoming ? (
							<div className="mt-3 space-y-1">
								<p className="font-semibold">{incoming.host}</p>
								<p className="text-base-content/70 text-sm">
									Exercise{" "}
									<span className="font-semibold">{incoming.exerciseId}</span>
								</p>
							</div>
						) : (
							<p className="mt-2 text-base-content/70 text-sm">
								Waiting for the OS to hand over a tapia:// link.
							</p>
						)}
						{error ? (
							<p className="mt-3 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-error text-sm">
								{error}
							</p>
						) : null}
					</div>
				</div>
			}
		>
			<div className="flex flex-col gap-4">
				<section className="surface-card space-y-4 rounded-3xl p-5 shadow-xl lg:p-6">
					<header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div className="space-y-1">
							<p className="text-base-content/60 text-xs uppercase">
								tapia:// deep link
							</p>
							<h1 className="font-semibold text-2xl leading-tight">
								Typing exercise intake
							</h1>
							<p className="text-base-content/70 text-sm">
								Click a <code>tapia://&lt;host&gt;/&lt;cuid&gt;</code> link to
								fetch and start an exercise. Benchmarks are saved to the daemon
								as blobs so they can be dispatched in the active space.
							</p>
						</div>
						<div className="glass-panel rounded-xl px-3 py-2 text-right">
							<div className="flex items-center justify-between gap-2">
								<div className="text-right">
									<p className="text-base-content/60 text-xs uppercase">
										Status
									</p>
									<p className="font-semibold">{status}</p>
								</div>
								<Link className="btn btn-ghost btn-xs" to="/history">
									History
								</Link>
							</div>
						</div>
					</header>

					{incoming ? (
						<div className="flex flex-wrap gap-2">
							<span className="badge badge-outline badge-lg border-primary/40 bg-primary/10 text-primary">
								host: {incoming.host}
							</span>
							<span className="badge badge-outline badge-lg border-secondary/40 bg-secondary/10 text-secondary">
								exercise: {incoming.exerciseId}
							</span>
						</div>
					) : (
						<p className="text-base-content/70 text-sm">
							Waiting for the OS to hand over a tapia:// link.
						</p>
					)}

					{exercise ? (
						<div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
							<div className="space-y-4">
								<div className="grid grid-cols-2 gap-3 rounded-2xl border border-base-300/60 bg-base-100/70 p-3 shadow-inner">
									<div>
										<p className="text-base-content/60 text-xs uppercase">
											Space
										</p>
										<p className="font-semibold">{exercise.meta.spaceId}</p>
									</div>
									<div>
										<p className="text-base-content/60 text-xs uppercase">
											Length
										</p>
										<p className="font-semibold">
											{exercise.meta.length} chars
										</p>
									</div>
									{exerciseCid ? (
										<div className="col-span-2">
											<p className="text-base-content/60 text-xs uppercase">
												Blob CID
											</p>
											<p className="break-words text-base-content/70 text-sm">
												{exerciseCid}
											</p>
										</div>
									) : null}
								</div>

								<label className="flex flex-col gap-2">
									<span className="text-base-content/60 text-xs uppercase">
										Type the prompt
									</span>
									<textarea
										className="w-full rounded-2xl border border-base-300/70 bg-base-100/80 p-4 text-base shadow-inner outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
										onChange={(event) => setInput(event.target.value)}
										placeholder={exercise.text.slice(0, 64)}
										rows={5}
										value={input}
									/>
								</label>

								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3 text-base-content/70 text-sm">
										<BarChart2 size={16} />
										<span>
											{progressPercent}% progress • {wpm.toFixed(1)} WPM •{" "}
											{accuracy.toFixed(1)}% accuracy
										</span>
									</div>
									<PolymorphButton
										leadingIcon={<RefreshCw size={16} />}
										onClick={reset}
										variant="ghost"
									>
										Reset
									</PolymorphButton>
								</div>
							</div>

							<div className="glass-panel flex flex-col gap-3 rounded-2xl border border-base-300/60 bg-base-100/70 p-4 shadow-xl">
								<p className="flex items-center gap-2 font-semibold text-sm">
									<Clock size={16} /> Prompt
								</p>
								<div className="rounded-2xl border border-base-300/60 bg-base-100 p-4 shadow-inner">
									<p className="text-base leading-relaxed">{exercise.text}</p>
								</div>
							</div>
						</div>
					) : (
						<div className="rounded-2xl border border-base-300/70 border-dashed bg-base-100/80 p-6 text-base-content/70">
							<div className="flex items-center gap-3">
								<Activity size={18} />
								<p>
									No exercise loaded yet. Trigger a <code>tapia://</code> link
									to pull one in.
								</p>
							</div>
						</div>
					)}
				</section>
			</div>
		</DesktopShell>
	);
}

function StatChip({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-base-300/70 bg-base-100/70 px-3 py-2">
			<p className="text-[11px] text-base-content/60 uppercase tracking-wide">
				{label}
			</p>
			<p className="font-semibold">{value}</p>
		</div>
	);
}

export { IntakePage };

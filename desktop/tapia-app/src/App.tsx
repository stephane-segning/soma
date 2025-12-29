import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useTauriStore } from "soma-ui";
import "./App.css";

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

const TAPIA_STORE_NAME = "tapia-settings.json";
const STATUS_KEY = "lastStatus";
const INITIAL_STATUS = "Waiting for tapia:// link";

function usePersistentStatus(initialStatus: string) {
	const store = useTauriStore(TAPIA_STORE_NAME);
	const queryClient = useQueryClient();

	const statusQuery = useQuery({
		queryKey: ["tapia", "status"],
		initialData: initialStatus,
		queryFn: async () => {
			try {
				await store.init();
				return (await store.get<string>(STATUS_KEY)) ?? initialStatus;
			} catch (err) {
				console.warn("Failed to load status from store", err);
				return initialStatus;
			}
		},
	});

	const persistStatus = useMutation({
		mutationFn: async (next: string) => {
			await store.init();
			await store.set(STATUS_KEY, next);
			await store.save();
			return next;
		},
		onSuccess: (next) => {
			queryClient.setQueryData(["tapia", "status"], next);
		},
		onError: (err) => {
			console.warn("Failed to persist status to store", err);
		},
	});

	const setStatus = useCallback(
		(next: string) => {
			persistStatus.mutate(next);
		},
		[persistStatus],
	);

	return {
		status: statusQuery.data ?? initialStatus,
		setStatus,
	};
}

function App() {
	const { status, setStatus } = usePersistentStatus(INITIAL_STATUS);
	const [incoming, setIncoming] = useState<DeepLinkPayload | null>(null);
	const [exercise, setExercise] = useState<ActiveExercise | null>(null);
	const [exerciseCid, setExerciseCid] = useState<string | null>(null);
	const [input, setInput] = useState<string>("");
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [completedAt, setCompletedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const unlistenPromise = listen<DeepLinkPayload>("tapia://exercise", (event) => {
			const payload = event.payload;
			setIncoming(payload);
			void bootstrapFromLink(payload);
		});

		return () => {
			void unlistenPromise.then((unlisten) => unlisten());
		};
	}, []);

	useEffect(() => {
		// Reset typing state when a new exercise arrives
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
			? Math.round((correctCharacters / 5 / (elapsedMs / 1000)) * 60 * 100) / 100
			: 0;

	useEffect(() => {
		if (!exercise) return;
		if (!startedAt && input.length > 0) {
			setStartedAt(Date.now());
		}
	}, [exercise, input.length, startedAt]);

	useEffect(() => {
		if (!exercise || !startedAt || completedAt) return;
		if (input.length !== exercise.meta.length) return;

		const finished = Date.now();
		setCompletedAt(finished);
		void recordBenchmark(exercise, {
			wpm,
			accuracy,
			durationMs: finished - startedAt,
			completedAtMs: finished,
		});
	}, [accuracy, completedAt, exercise, input.length, startedAt, wpm]);

	const bootstrapFromLink = async (payload: DeepLinkPayload): Promise<void> => {
		setStatus("Fetching exercise from link…");
		setError(null);
		setExerciseCid(null);
		try {
			const remote = await fetchExercise(payload);
			const active: ActiveExercise = {
				text: remote.message,
				meta: {
					id: payload.exerciseId,
					spaceId: remote.spaceId ?? payload.host,
					topic: remote.topic,
					difficulty: remote.difficulty,
					length: remote.message.length,
					sourceHost: payload.host,
					sourceLink: payload.raw,
				},
			};
			setExercise(active);
			const staged = await stageExercise(active, remote, payload);
			if (staged?.cid) {
				setExerciseCid(staged.cid);
				setExercise((prev) =>
					prev ? { ...prev, meta: { ...prev.meta, cid: staged.cid } } : prev,
				);
			}
			setStatus("Ready to type");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to load exercise";
			setError(message);
			setStatus("Could not fetch exercise");
		}
	};

	const fetchExercise = async (payload: DeepLinkPayload): Promise<RemoteExercise> => {
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
				const response = await fetch(url, { headers: { Accept: "application/json" } });
				if (!response.ok) throw new Error(`request failed (${response.status})`);
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
			(data as Record<string, unknown>).message ?? (data as Record<string, unknown>).text;
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

	const stageExercise = async (
		active: ActiveExercise,
		remote: RemoteExercise,
		payload: DeepLinkPayload,
	): Promise<BlobUpload | null> => {
		try {
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
		} catch (err) {
			console.warn("failed to stage exercise blob", err);
			return null;
		}
	};

	const recordBenchmark = async (
		active: ActiveExercise,
		metrics: {
			wpm: number;
			accuracy: number;
			durationMs: number;
			completedAtMs: number;
		},
	): Promise<void> => {
		try {
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
			setExerciseCid(upload.cid);
			setStatus("Benchmark saved to daemon");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save benchmark");
			setStatus("Benchmark save failed");
		}
	};

	const reset = (): void => {
		setInput("");
		setStartedAt(null);
		setCompletedAt(null);
		setStatus("Ready to type");
	};

	return (
		<main className="app-shell">
			<header className="panel panel--header">
				<div>
					<p className="eyebrow">tapia:// deep link</p>
					<h1>Typing exercise intake</h1>
					<p className="muted">
						Click a <code>tapia://&lt;host&gt;/&lt;cuid&gt;</code> link to fetch and start an
						exercise. Benchmarks are saved to the daemon as blobs so they can be dispatched
						in the active space.
					</p>
				</div>
				<div className="status">
					<span className="status__label">Status</span>
					<span className="status__value">{status}</span>
				</div>
			</header>

			<section className="panel">
				{incoming ? (
					<div className="pill-row">
						<span className="pill">
							host: <strong>{incoming.host}</strong>
						</span>
						<span className="pill">
							exercise: <strong>{incoming.exerciseId}</strong>
						</span>
					</div>
				) : (
					<p className="muted">Waiting for the OS to hand over a tapia:// link.</p>
				)}

				{error ? <p className="error">{error}</p> : null}

				{exercise ? (
					<div className="exercise">
						<div className="exercise__meta">
							<div>
								<p className="eyebrow">Space</p>
								<p>{exercise.meta.spaceId}</p>
							</div>
							<div>
								<p className="eyebrow">Length</p>
								<p>{exercise.meta.length} chars</p>
							</div>
							{exerciseCid ? (
								<div>
									<p className="eyebrow">Blob CID</p>
									<p className="muted cid">{exerciseCid}</p>
								</div>
							) : null}
						</div>

						<div className="prompt">
							<p>{exercise.text}</p>
						</div>

						<label className="input-block">
							<span className="eyebrow">Type the prompt</span>
							<textarea
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder={exercise.text.slice(0, 64)}
								rows={5}
							/>
						</label>

						<div className="stats">
							<div>
								<p className="eyebrow">WPM</p>
								<p className="stat">{wpm.toFixed(2)}</p>
							</div>
							<div>
								<p className="eyebrow">Accuracy</p>
								<p className="stat">{accuracy.toFixed(1)}%</p>
							</div>
							<div>
								<p className="eyebrow">Progress</p>
								<p className="stat">
									{exercise.meta.length > 0
										? Math.round((input.length / exercise.meta.length) * 100)
										: 0}
									%
								</p>
							</div>
							<div>
								<p className="eyebrow">Elapsed</p>
								<p className="stat">{Math.round(elapsedMs / 1000)}s</p>
							</div>
						</div>

						<div className="actions">
							<button className="ghost" onClick={reset} type="button">
								Reset
							</button>
						</div>
					</div>
				) : null}
			</section>
		</main>
	);
}

export default App;

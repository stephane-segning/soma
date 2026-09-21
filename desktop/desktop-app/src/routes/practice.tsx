/**
 * PracticePage — `/spaces/:spaceId/practice`.
 *
 * A real (if intentionally narrow) typing drill, built on the ported
 * Tapia backend (`PracticeService` / `desktop-api::practice` /
 * `backend.practice.*`) and the surviving `CharDisplay` component. See
 * this file's own inline comments for what's scoped out.
 *
 * Flow:
 *  1. Load the space's exercises (`backend.practice.listExercises`).
 *     Most-recent-first (the service prepends on save) — reuse the
 *     first one. Empty (the common case: the service is process-local,
 *     in-memory, and only seeds the hardcoded "practice"/"focus" space
 *     ids — see `desktop-services::practice`'s doc comment) generates
 *     one (`generateExercise`, purely local phrase-bank selection, no
 *     LLM/agent dependency) and saves it so it has a stable id to
 *     attach attempts to.
 *  2. `TypingSession` renders `CharDisplay` (target vs. typed
 *     graphemes) driven by a plain text input, and calls back once the
 *     typed length reaches the target's.
 *  3. On completion, `backend.practice.recordSession` persists the
 *     attempt and returns the space's leaderboard. Success fires the
 *     one `notify.success` toast in this codebase (ADR-0005 §6 reserves
 *     toasts for cross-cutting transient notifications, and §10 names
 *     exactly this "task complete" moment as the sanctioned pattern —
 *     applied here to the in-app result screen rather than a popup
 *     window, see the "Scoped out" note below). A save failure still
 *     shows the locally-computed result (wpm/accuracy don't need the
 *     round-trip) with an inline note instead — no toast for the
 *     failure path, per the same ADR section.
 *
 * Scoped out (full Tapia parity would be a much larger change):
 *  - The `PopupShell` multi-window focus-task chrome (ADR-0005 §10).
 *    Practice runs as a normal in-app route today, not its own
 *    `BrowserWindow` — there is no second-window mechanism anywhere in
 *    this Tauri app yet, and building one is its own project.
 *  - `simple-keyboard` on-screen keyboard and Motion-choreographed
 *    cursor/feedback beyond what `CharDisplay` already animates itself.
 *    A plain, accessible text input drives typing (same mechanism the
 *    component's own Storybook `LiveTyping` story uses).
 *  - XState. AGENTS.md calls out an XState typing state machine, but
 *    there is no XState dependency anywhere in this repo (confirmed:
 *    zero occurrences) — this uses plain `useState`.
 *  - Topic/difficulty pickers, a "browse past exercises" list, and
 *    manual exercise authoring. Every session uses the most recent (or
 *    a freshly generated) exercise; "Practice again" always generates
 *    a fresh one.
 *  - Per-user leaderboard identity: `desktop-services::practice`
 *    hardcodes `peer_id`/`display_name` to `None` on every entry today
 *    (not something this change can fix — that crate is out of scope
 *    here), so every row renders as anonymous. See `leaderboard.anonymous`.
 */
import type { Exercise, ExerciseDifficulty, LeaderboardEntry } from "@soma/sdk";
import { DenseRow } from "@soma/ui/components/lists/dense-row";
import { notify } from "@soma/ui/components/overlays/toast";
import { Empty } from "@soma/ui/components/primitives/empty";
import { Pill, type PillTone } from "@soma/ui/components/primitives/pill";
import { CharDisplay } from "@soma/ui/components/tapia/char-display";
import { useGraphemes } from "@soma/ui/hooks/use-graphemes";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { backend } from "../lib/backend";
import { computeAccuracy, computeWpm, isPracticeComplete } from "../lib/practice-scoring";

type CompleteResult = { wpm: number; accuracy: number; durationMs: number };

type PageState =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "typing"; exercise: Exercise }
	| {
			kind: "result";
			exercise: Exercise;
			wpm: number;
			accuracy: number;
			leaderboard: LeaderboardEntry[];
			saveError: string | null;
	  };

const DIFFICULTY_TONE: Record<ExerciseDifficulty, PillTone> = {
	beginner: "success",
	intermediate: "info",
	advanced: "warning",
};

/** Reuse the most recent saved exercise for the space, or mint one. */
async function loadOrCreateExercise(spaceId: string): Promise<Exercise> {
	const existing = await backend.practice.listExercises(spaceId);
	if (existing.length > 0) return existing[0];
	const draft = await backend.practice.generateExercise({ spaceId });
	return backend.practice.saveExercise(draft);
}

async function createFreshExercise(spaceId: string): Promise<Exercise> {
	const draft = await backend.practice.generateExercise({ spaceId });
	return backend.practice.saveExercise(draft);
}

export function PracticePage() {
	const { t } = useTranslation();
	const { spaceId } = useParams<{ spaceId: string }>();
	const [state, setState] = useState<PageState>({ kind: "loading" });
	const [reloadToken, setReloadToken] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `reloadToken` is a deliberate re-run trigger for "Try again", not read in the effect body.
	useEffect(() => {
		if (!spaceId) return;
		let cancelled = false;
		setState({ kind: "loading" });
		(async () => {
			try {
				const exercise = await loadOrCreateExercise(spaceId);
				if (!cancelled) setState({ kind: "typing", exercise });
			} catch (err) {
				if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spaceId, reloadToken]);

	const handleComplete = useCallback(
		(exercise: Exercise, result: CompleteResult) => {
			if (!spaceId) return;
			void (async () => {
				try {
					const response = await backend.practice.recordSession({
						accuracy: result.accuracy,
						completedAtMs: Date.now(),
						durationMs: result.durationMs,
						exerciseId: exercise.meta.id,
						spaceId,
						wpm: result.wpm,
					});
					setState({
						accuracy: result.accuracy,
						exercise,
						kind: "result",
						leaderboard: response.leaderboard,
						saveError: null,
						wpm: result.wpm,
					});
					notify.success(
						t("pages.practice.result.toast", {
							accuracy: `${Math.round(result.accuracy * 100)}%`,
							wpm: Math.round(result.wpm),
						}),
					);
				} catch (err) {
					setState({
						accuracy: result.accuracy,
						exercise,
						kind: "result",
						leaderboard: [],
						saveError: err instanceof Error ? err.message : String(err),
						wpm: result.wpm,
					});
				}
			})();
		},
		[spaceId, t],
	);

	const practiceAgain = useCallback(() => {
		if (!spaceId) return;
		setState({ kind: "loading" });
		void (async () => {
			try {
				const exercise = await createFreshExercise(spaceId);
				setState({ kind: "typing", exercise });
			} catch (err) {
				setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
			}
		})();
	}, [spaceId]);

	const retryLoad = useCallback(() => setReloadToken((n) => n + 1), []);

	const root = "mx-auto w-full max-w-4xl px-8 py-10";

	if (!spaceId || state.kind === "error") {
		return (
			<main className={root}>
				<Empty
					cta={
						<button className="btn btn-primary btn-sm" onClick={retryLoad} type="button">
							{t("pages.practice.retry")}
						</button>
					}
					headline={t("pages.practice.error", { message: state.kind === "error" ? state.message : "" })}
				/>
			</main>
		);
	}

	if (state.kind === "loading") {
		return (
			<main className={root}>
				<Empty headline={t("pages.practice.loading")} />
			</main>
		);
	}

	return (
		<main className={root}>
			<header className="mb-6 flex flex-wrap items-center justify-between gap-2">
				<h1 className="font-semibold text-2xl">{t("pages.practice.title")}</h1>
				<Pill tone={DIFFICULTY_TONE[state.exercise.meta.difficulty]}>
					{t(`pages.practice.difficulty.${state.exercise.meta.difficulty}`)}
				</Pill>
			</header>

			{state.kind === "typing" ? (
				<TypingSession exercise={state.exercise} onComplete={handleComplete} />
			) : (
				<ResultView onPracticeAgain={practiceAgain} state={state} />
			)}
		</main>
	);
}

function TypingSession({
	exercise,
	onComplete,
}: {
	exercise: Exercise;
	onComplete: (exercise: Exercise, result: CompleteResult) => void;
}) {
	const { t } = useTranslation();
	const [input, setInput] = useState("");
	const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
	const finishedRef = useRef(false);

	const should = useGraphemes(exercise.message);
	const is = useGraphemes(input);

	const finishNow = useCallback(() => {
		if (finishedRef.current) return;
		finishedRef.current = true;
		const elapsedMs = startedAtMs !== null ? Date.now() - startedAtMs : 0;
		onComplete(exercise, {
			accuracy: computeAccuracy(should, is),
			durationMs: elapsedMs,
			wpm: computeWpm(is.length, elapsedMs),
		});
	}, [exercise, is, onComplete, should, startedAtMs]);

	// Auto-finish the instant the typed length reaches the target's —
	// standard typing-test UX. `finishNow` itself is idempotent
	// (guarded by `finishedRef`), so re-running this on every keystroke
	// is safe.
	useEffect(() => {
		if (isPracticeComplete(should, is)) finishNow();
	}, [should, is, finishNow]);

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (finishedRef.current) return;
		const value = event.target.value;
		if (startedAtMs === null && value.length > 0) setStartedAtMs(Date.now());
		setInput(value);
	};

	const handleRestart = () => {
		finishedRef.current = false;
		setInput("");
		setStartedAtMs(null);
	};

	return (
		<div className="flex flex-col gap-4">
			<CharDisplay isGraphemes={is} shouldGraphemes={should} />
			<div className="flex items-center gap-2">
				<input
					aria-label={t("pages.practice.input_label")}
					// biome-ignore lint/a11y/noAutofocus: the whole point of navigating to a typing drill is to start typing — same justification already accepted for the command palette's search input.
					autoFocus
					className="input input-bordered flex-1 font-mono"
					onChange={handleChange}
					placeholder={t("pages.practice.input_placeholder")}
					spellCheck={false}
					type="text"
					value={input}
				/>
				<button className="btn btn-ghost btn-sm" onClick={handleRestart} type="button">
					{t("pages.practice.restart")}
				</button>
				<button className="btn btn-primary btn-sm" disabled={input.length === 0} onClick={finishNow} type="button">
					{t("pages.practice.finish")}
				</button>
			</div>
		</div>
	);
}

function ResultView({
	state,
	onPracticeAgain,
}: {
	state: Extract<PageState, { kind: "result" }>;
	onPracticeAgain: () => void;
}) {
	const { t } = useTranslation();

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-3 rounded-md border border-base-300 p-6 text-center">
				<h2 className="font-medium text-base-content/80 text-sm">{t("pages.practice.result.headline")}</h2>
				<div className="flex items-center justify-center gap-8">
					<Stat label={t("pages.practice.result.wpm")} value={Math.round(state.wpm).toString()} />
					<Stat label={t("pages.practice.result.accuracy")} value={`${Math.round(state.accuracy * 100)}%`} />
				</div>
				{state.saveError ? (
					<p className="text-error text-xs">{t("pages.practice.result.save_error", { message: state.saveError })}</p>
				) : null}
				<div>
					<button className="btn btn-primary btn-sm" onClick={onPracticeAgain} type="button">
						{t("pages.practice.result.again")}
					</button>
				</div>
			</div>

			<section>
				<h3 className="mb-2 text-base-content/55 text-xs uppercase tracking-wider">
					{t("pages.practice.leaderboard.title")}
				</h3>
				{state.leaderboard.length === 0 ? (
					<Empty headline={t("pages.practice.leaderboard.empty")} variant="compact" />
				) : (
					<ul className="list list-dense bg-base-100">
						{state.leaderboard.map((entry, index) => (
							<DenseRow
								key={`${entry.exerciseId}-${entry.completedAtMs}-${index}`}
								leading={<span className="w-4 text-center text-xs">{index + 1}</span>}
								meta={new Date(entry.completedAtMs).toLocaleTimeString()}
								primary={entry.displayName ?? t("pages.practice.leaderboard.anonymous")}
								status={`${Math.round(entry.wpm ?? 0)} wpm · ${Math.round((entry.accuracy ?? 0) * 100)}%`}
							/>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col items-center">
			<span className="font-semibold text-3xl">{value}</span>
			<span className="text-base-content/55 text-xs uppercase tracking-wider">{label}</span>
		</div>
	);
}

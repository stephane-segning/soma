import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Exercise, ExerciseAttempt, LeaderboardEntry } from "../../../shared/exercise";
import { cn } from "../lib/cn";
import { Keyboard } from "./keyboard";

type ExercisePlayerProps = {
	exercise: Exercise;
	leaderboard?: LeaderboardEntry[];
	onComplete?: (attempt: ExerciseAttempt) => Promise<LeaderboardEntry[] | void> | LeaderboardEntry[] | void;
};

function firstMismatchIndex(expected: string, actual: string): number {
	const limit = Math.min(expected.length, actual.length);
	for (let index = 0; index < limit; index += 1) {
		if (expected[index] !== actual[index]) return index;
	}
	return actual.length;
}

function ExercisePlayer({
	exercise,
	leaderboard = [],
	onComplete,
}: ExercisePlayerProps): React.JSX.Element {
	const { t } = useTranslation();
	const [input, setInput] = useState("");
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [completedAt, setCompletedAt] = useState<number | null>(null);
	const [lastKey, setLastKey] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	const totalLength = exercise.message.length;
	const mismatchIndex = useMemo(
		() => firstMismatchIndex(exercise.message, input),
		[exercise.message, input],
	);
	const currentIndex = Math.min(mismatchIndex, totalLength);

	const correctCharacters = useMemo(() => {
		let correct = 0;
		for (let index = 0; index < input.length; index += 1) {
			if (exercise.message[index] === input[index]) correct += 1;
		}
		return correct;
	}, [exercise.message, input]);

	const accuracy =
		input.length === 0
			? 100
			: Math.max(0, Math.round((correctCharacters / input.length) * 100));
	const elapsedMs = startedAt ? (completedAt ?? Date.now()) - startedAt : 0;
	const wpm =
		elapsedMs > 0 && startedAt
			? Math.round((correctCharacters / 5 / (elapsedMs / 1000)) * 60 * 100) /
				100
			: 0;

	useEffect(() => {
		if (!startedAt && input.length > 0) {
			setStartedAt(Date.now());
		}
	}, [input.length, startedAt]);

	useEffect(() => {
		if (input.length === totalLength && startedAt && !completedAt && mismatchIndex === totalLength) {
			const finished = Date.now();
			setCompletedAt(finished);
			setIsSaving(true);
			setSaveError(null);
			void Promise.resolve(
				onComplete?.({
					exerciseId: exercise.meta.id,
					spaceId: exercise.meta.spaceId,
					wpm,
					accuracy,
					durationMs: finished - startedAt,
					completedAtMs: finished,
				}),
			)
				.catch((error) => {
					setSaveError(error instanceof Error ? error.message : String(error));
				})
				.finally(() => {
					setIsSaving(false);
				});
		}
	}, [
		accuracy,
		completedAt,
		exercise.meta.id,
		exercise.meta.spaceId,
		input.length,
		mismatchIndex,
		onComplete,
		startedAt,
		totalLength,
		wpm,
	]);

	const progress = Math.min(1, currentIndex / totalLength);
	const nextChar = exercise.message[currentIndex];
	const promptSegments = useMemo(
		() => ({
			completed: exercise.message.slice(0, currentIndex),
			current: exercise.message[currentIndex] ?? "",
			remaining: exercise.message.slice(currentIndex + 1),
		}),
		[currentIndex, exercise.message],
	);
	const topResults = leaderboard.slice(0, 3);

	const onReset = (): void => {
		setInput("");
		setCompletedAt(null);
		setStartedAt(null);
		setLastKey(null);
		setIsSaving(false);
		setSaveError(null);
	};

	return (
		<div className="player">
			<div className="player__bar">
				<div className="progress" style={{ width: `${progress * 100}%` }} />
			</div>
			<div className="player__stats">
				<div>
					<span className="stat-label">{t("wpm")}</span>
					<span className="stat-value">{wpm.toFixed(2)}</span>
				</div>
				<div>
					<span className="stat-label">{t("accuracy")}</span>
					<span className="stat-value">{accuracy.toFixed(0)}%</span>
				</div>
				<div>
					<span className="stat-label">{t("progress")}</span>
					<span className="stat-value">{Math.round(progress * 100)}%</span>
				</div>
			</div>
			<div className="player__prompt">
				<p className="player__message">
					<span className="player__done">{promptSegments.completed}</span>
					{promptSegments.current ? <span className="player__current">{promptSegments.current}</span> : null}
					<span className="player__remaining">{promptSegments.remaining}</span>
				</p>
			</div>
			<label className="player__input">
				<span className="stat-label">{t("typeHere")}</span>
				<textarea
					onChange={(event) => {
						setInput(event.target.value);
						setLastKey(event.target.value.at(-1) ?? null);
					}}
					onFocus={() => {
						if (!startedAt) setStartedAt(Date.now());
					}}
					placeholder={exercise.message.slice(0, 64)}
					rows={4}
					value={input}
				/>
			</label>
			{input.length > 0 && mismatchIndex < input.length ? (
				<div className="player__hint">Fix the highlighted character, then keep going.</div>
			) : null}
			<div className="player__actions">
				<div className="expected-key">
					<span className="stat-label">{t("expectedKey")}</span>
					<span className={cn("pill", "pill--ghost")}>
						{nextChar ? nextChar : "done"}
					</span>
				</div>
				<button className="ghost-button" onClick={onReset} type="button">
					{t("reset")}
				</button>
			</div>
			{completedAt ? (
				<div className="player__results">
					<div className="player__results-head">
						<div>
							<div className="eyebrow">{t("sessionComplete")}</div>
							<h2>{t("currentRun")}</h2>
						</div>
						<button className="ghost-button" onClick={onReset} type="button">
							{t("retryPassage")}
						</button>
					</div>
					<div className="player__results-grid">
						<div>
							<span className="stat-label">{t("wpm")}</span>
							<span className="stat-value">{wpm.toFixed(2)}</span>
						</div>
						<div>
							<span className="stat-label">{t("accuracy")}</span>
							<span className="stat-value">{accuracy.toFixed(0)}%</span>
						</div>
						<div>
							<span className="stat-label">{t("duration")}</span>
							<span className="stat-value">{Math.round(elapsedMs / 1000)}s</span>
						</div>
					</div>
					<div className="player__save-state muted">
						{isSaving ? t("saving") : saveError ? `${t("saveFailed")}: ${saveError}` : t("saved")}
					</div>
					{topResults.length > 0 ? (
						<div className="player__leaderboard">
							<div className="stat-label">{t("topResults")}</div>
							<div className="player__leaderboard-list">
								{topResults.map((entry, index) => (
									<div className="player__leaderboard-row" key={`${entry.completedAtMs}-${index}`}>
										<span>#{index + 1}</span>
										<span>{entry.wpm.toFixed(2)} WPM</span>
										<span>{Math.round(entry.accuracy)}%</span>
									</div>
								))}
							</div>
						</div>
					) : null}
				</div>
			) : null}
			<Keyboard expectedKey={nextChar} lastKey={lastKey} />
		</div>
	);
}

export { ExercisePlayer, firstMismatchIndex };

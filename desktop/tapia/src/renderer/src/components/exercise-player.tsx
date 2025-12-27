import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Exercise, ExerciseAttempt } from "../../../shared/exercise";
import { cn } from "../lib/cn";
import { Keyboard } from "./keyboard";

type ExercisePlayerProps = {
	exercise: Exercise;
	onComplete?: (attempt: ExerciseAttempt) => void;
};

function ExercisePlayer({
	exercise,
	onComplete,
}: ExercisePlayerProps): React.JSX.Element {
	const { t } = useTranslation();
	const [input, setInput] = useState("");
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [completedAt, setCompletedAt] = useState<number | null>(null);
	const [lastKey, setLastKey] = useState<string | null>(null);

	const totalLength = exercise.message.length;

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
		if (input.length === totalLength && startedAt && !completedAt) {
			const finished = Date.now();
			setCompletedAt(finished);
			onComplete?.({
				exerciseId: exercise.meta.id,
				spaceId: exercise.meta.spaceId,
				wpm,
				accuracy,
				durationMs: finished - startedAt,
				completedAtMs: finished,
			});
		}
	}, [
		accuracy,
		completedAt,
		exercise.meta.id,
		exercise.meta.spaceId,
		input.length,
		onComplete,
		startedAt,
		totalLength,
		wpm,
	]);

	const progress = Math.min(1, input.length / totalLength);
	const nextChar = exercise.message[input.length];

	const onReset = (): void => {
		setInput("");
		setCompletedAt(null);
		setStartedAt(null);
		setLastKey(null);
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
					<span className="stat-label">{t("characters")}</span>
					<span className="stat-value">{totalLength} chars</span>
				</div>
			</div>
			<div className="player__prompt">
				<p className="player__message">{exercise.message}</p>
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
			<Keyboard expectedKey={nextChar} lastKey={lastKey} />
		</div>
	);
}

export { ExercisePlayer };

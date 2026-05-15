import { useEffect, useMemo, useState } from "react";
import type { Exercise, ExerciseAttempt, LeaderboardEntry } from "../../../../shared/exercise";

type UseExerciseRunInput = {
	exercise: Exercise;
	onComplete?: (attempt: ExerciseAttempt) => Promise<LeaderboardEntry[] | void> | LeaderboardEntry[] | void;
};

export function firstMismatchIndex(expected: string, actual: string): number {
	const limit = Math.min(expected.length, actual.length);
	for (let index = 0; index < limit; index += 1) {
		if (expected[index] !== actual[index]) return index;
	}
	return actual.length;
}

export function useExerciseRun({ exercise, onComplete }: UseExerciseRunInput) {
	const [input, setInput] = useState("");
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [completedAt, setCompletedAt] = useState<number | null>(null);
	const [lastKey, setLastKey] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	const totalLength = exercise.message.length;
	const mismatchIndex = useMemo(() => firstMismatchIndex(exercise.message, input), [exercise.message, input]);
	const currentIndex = Math.min(mismatchIndex, totalLength);
	const correctCharacters = useMemo(
		() => countCorrectCharacters(exercise.message, input),
		[exercise.message, input],
	);
	const accuracy = input.length === 0 ? 100 : Math.max(0, Math.round((correctCharacters / input.length) * 100));
	const elapsedMs = startedAt ? (completedAt ?? Date.now()) - startedAt : 0;
	const wpm = elapsedMs > 0 && startedAt ? Math.round((correctCharacters / 5 / (elapsedMs / 1000)) * 60 * 100) / 100 : 0;

	useEffect(() => {
		if (!startedAt && input.length > 0) setStartedAt(Date.now());
	}, [input.length, startedAt]);

	useEffect(() => {
		if (input.length !== totalLength || !startedAt || completedAt || mismatchIndex !== totalLength) return;
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
			.catch((error) => setSaveError(error instanceof Error ? error.message : String(error)))
			.finally(() => setIsSaving(false));
	}, [accuracy, completedAt, exercise.meta.id, exercise.meta.spaceId, input.length, mismatchIndex, onComplete, startedAt, totalLength, wpm]);

	const reset = (): void => {
		setInput("");
		setCompletedAt(null);
		setStartedAt(null);
		setLastKey(null);
		setIsSaving(false);
		setSaveError(null);
	};

	return {
		input,
		completedAt,
		elapsedMs,
		isSaving,
		lastKey,
		saveError,
		wpm,
		accuracy,
		progress: Math.min(1, currentIndex / totalLength),
		nextChar: exercise.message[currentIndex],
		hasMismatch: input.length > 0 && mismatchIndex < input.length,
		promptSegments: {
			completed: exercise.message.slice(0, currentIndex),
			current: exercise.message[currentIndex] ?? "",
			remaining: exercise.message.slice(currentIndex + 1),
		},
		markStarted: () => {
			if (!startedAt) setStartedAt(Date.now());
		},
		reset,
		updateInput: (value: string) => {
			setInput(value);
			setLastKey(value.at(-1) ?? null);
		},
	};
}

function countCorrectCharacters(expected: string, actual: string): number {
	let correct = 0;
	for (let index = 0; index < actual.length; index += 1) {
		if (expected[index] === actual[index]) correct += 1;
	}
	return correct;
}

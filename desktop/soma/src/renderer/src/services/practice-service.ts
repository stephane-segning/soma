/**
 * Renderer-side practice service. Thin adapter over `@soma/sdk`; channel
 * naming + envelope shape both live in the SDK module now.
 *
 * `@shared/practice` types are kept as the renderer-facing surface — they
 * structurally match `@soma/sdk`'s practice types, which is enforced by
 * the type assertions on each function signature.
 */

import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	GenerateExerciseInput,
	LeaderboardEntry,
} from "@shared/practice";
import { backend } from "../lib/ipc";

export function listExercises(spaceId: string): Promise<Exercise[]> {
	return backend.practice.listExercises(spaceId) as Promise<Exercise[]>;
}

export function saveExercise(draft: ExerciseDraft): Promise<Exercise> {
	return backend.practice.saveExercise(draft) as Promise<Exercise>;
}

export async function recordSession(attempt: ExerciseAttempt): Promise<LeaderboardEntry[]> {
	const response = await backend.practice.recordSession(attempt);
	return response.leaderboard as LeaderboardEntry[];
}

export function generateExercise(input: GenerateExerciseInput): Promise<ExerciseDraft> {
	return backend.practice.generateExercise(input) as Promise<ExerciseDraft>;
}

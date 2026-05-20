/**
 * Practice-mode (typing-drill) API surface.
 *
 * The Tauri presenter for practice doesn't exist yet — these types are
 * mirrored from the renderer's `@shared/practice` so the SDK can be the
 * single call-site contract for both shells. When the Tauri side lands,
 * the generator-emitted equivalents move into `src/bindings/index.ts`
 * and this file flips its imports.
 *
 * Channel names follow the snake_case convention established by #109.
 * Struct args use the `{ args }` envelope; scalar args (a single
 * `spaceId`) ride flat — matching the convention in
 * `documents.ts` / `spaces.ts`.
 */

import type { Transport } from "../transport";

export type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";

export type ExerciseSource = "agent" | "manual" | "imported";

export interface ExerciseDraft {
	message: string;
	meta: {
		spaceId: string;
		topic?: string;
		difficulty?: ExerciseDifficulty;
		source?: ExerciseSource;
		tags?: string[];
	};
}

export interface ExerciseMetadata {
	id: string;
	spaceId: string;
	createdAtMs: number;
	difficulty: ExerciseDifficulty;
	source: ExerciseSource;
	topic?: string;
	length: number;
	tags?: string[];
}

export interface Exercise {
	cid: string;
	message: string;
	meta: ExerciseMetadata;
}

export interface ExerciseAttempt {
	exerciseId: string;
	spaceId: string;
	wpm: number;
	accuracy: number;
	durationMs: number;
	completedAtMs: number;
}

export interface LeaderboardEntry {
	spaceId: string;
	exerciseId: string;
	peerId?: string;
	displayName?: string;
	wpm: number;
	accuracy: number;
	completedAtMs: number;
}

export interface GenerateExerciseInput {
	spaceId: string;
	topic?: string;
	difficulty?: ExerciseDifficulty;
	length?: number;
}

export interface RecordSessionResponse {
	ok: true;
	leaderboard: LeaderboardEntry[];
}

export function practice(t: Transport) {
	return {
		listExercises: (spaceId: string) => t.invoke<Exercise[]>("practice_list_exercises", { spaceId }),
		saveExercise: (draft: ExerciseDraft) => t.invoke<Exercise>("practice_save_exercise", { args: draft }),
		recordSession: (attempt: ExerciseAttempt) =>
			t.invoke<RecordSessionResponse>("practice_record_session", { args: attempt }),
		generateExercise: (input: GenerateExerciseInput) =>
			t.invoke<ExerciseDraft>("practice_generate_exercise", { args: input }),
	};
}

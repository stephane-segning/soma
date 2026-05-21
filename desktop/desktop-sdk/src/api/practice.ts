/**
 * Practice-mode (typing-drill) API surface.
 *
 * Backed by the in-process `PracticeService` on the Tauri side — every
 * type below is re-exported from the specta-generated bindings so the
 * renderer's `@shared/practice` shape and the Rust DTO shape stay
 * locked in step.
 *
 * Channel names follow the snake_case convention established by #109.
 * Struct args use the `{ args }` envelope; scalar args (a single
 * `spaceId`) ride flat — matching the convention in
 * `documents.ts` / `spaces.ts`.
 */

import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	GenerateExerciseInput,
	RecordSessionResponse,
} from "../bindings";
import type { Transport } from "../transport";

export type {
	Exercise,
	ExerciseAttempt,
	ExerciseDifficulty,
	ExerciseDraft,
	ExerciseDraftMetadata,
	ExerciseMetadata,
	ExerciseSource,
	GenerateExerciseInput,
	LeaderboardEntry,
	RecordSessionResponse,
} from "../bindings";

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

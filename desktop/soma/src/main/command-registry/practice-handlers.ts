import type { ExerciseAttempt, ExerciseDraft, GenerateExerciseInput } from "@shared/practice";
import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerPracticeHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("practice_list_exercises", (_event, params: { spaceId?: string } | undefined) =>
		context.practice.listExercises(params?.spaceId ?? ""),
	);
	ipc.handle("practice_save_exercise", (_event, draft: ExerciseDraft) => context.practice.saveExercise(draft));
	ipc.handle("practice_record_session", (_event, attempt: ExerciseAttempt) => context.practice.recordSession(attempt));
	ipc.handle("practice_generate_exercise", (_event, input: GenerateExerciseInput) =>
		context.practice.generateExercise(input),
	);
}

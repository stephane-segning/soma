import type { ExerciseAttempt, ExerciseDraft, GenerateExerciseInput } from "@shared/practice";
import type { IpcMain } from "electron";
import type { CommandRegistryContext } from "./types";

export function registerPracticeHandlers(ipc: IpcMain, context: CommandRegistryContext): void {
	ipc.handle("practice:list-exercises", (_event, spaceId: string) => context.practice.listExercises(spaceId));
	ipc.handle("practice:save-exercise", (_event, draft: ExerciseDraft) => context.practice.saveExercise(draft));
	ipc.handle("practice:record-session", (_event, attempt: ExerciseAttempt) => context.practice.recordSession(attempt));
	ipc.handle("practice:generate-exercise", (_event, input: GenerateExerciseInput) =>
		context.practice.generateExercise(input),
	);
}

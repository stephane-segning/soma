import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	GenerateExerciseInput,
	LeaderboardEntry,
	RecordSessionResponse,
} from "@shared/practice";
import { invoke } from "../lib/ipc";

export function listExercises(spaceId: string): Promise<Exercise[]> {
	return invoke<Exercise[]>("practice:list-exercises", spaceId);
}

export function saveExercise(draft: ExerciseDraft): Promise<Exercise> {
	return invoke<Exercise>("practice:save-exercise", draft);
}

export async function recordSession(attempt: ExerciseAttempt): Promise<LeaderboardEntry[]> {
	const response = await invoke<RecordSessionResponse>("practice:record-session", attempt);
	return response.leaderboard;
}

export function generateExercise(input: GenerateExerciseInput): Promise<ExerciseDraft> {
	return invoke<ExerciseDraft>("practice:generate-exercise", input);
}

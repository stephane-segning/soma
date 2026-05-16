import { ElectronAPI } from "@electron-toolkit/preload";
import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	LeaderboardEntry,
} from "../shared/exercise";

declare global {
	interface Window {
		electron: ElectronAPI;
		api: {
			invoke: <T = unknown>(channel: string, args?: unknown) => Promise<T>;
			dbStorage: {
				getItem: (key: string) => string | null;
				setItem: (key: string, value: string) => void;
				removeItem: (key: string) => void;
				clear: () => void;
				keys: () => string[];
			};
			daemon: {
				listExercises: (spaceId: string) => Promise<Exercise[]>;
				saveExercise: (draft: ExerciseDraft) => Promise<Exercise>;
				recordSession: (
					attempt: ExerciseAttempt,
				) => Promise<{ ok: true; leaderboard: LeaderboardEntry[] }>;
			};
			agent: {
				generateExercise: (input: {
					spaceId: string;
					topic?: string;
					difficulty?: ExerciseDraft["meta"]["difficulty"];
				}) => Promise<ExerciseDraft>;
			};
		};
	}
}

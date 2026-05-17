import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	GenerateExerciseInput,
	LeaderboardEntry,
} from "@shared/practice";
import * as practiceService from "../../services/practice-service";
import { api as agentApi } from "./agent-api";

export const practiceApi = agentApi.injectEndpoints({
	endpoints: (builder) => ({
		listPracticeExercises: builder.query<Exercise[], string>({
			queryFn: async (spaceId) => {
				try {
					const data = await practiceService.listExercises(spaceId);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, spaceId) => [
				{
					type: "PracticeExercises",
					id: spaceId,
				},
			],
		}),
		generatePracticeExercise: builder.mutation<Exercise, GenerateExerciseInput>({
			queryFn: async (input) => {
				try {
					const draft = await practiceService.generateExercise(input);
					const saved = await practiceService.saveExercise(draft);
					return { data: saved };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, { spaceId }) => [
				{
					type: "PracticeExercises",
					id: spaceId,
				},
			],
		}),
		savePracticeExercise: builder.mutation<Exercise, ExerciseDraft>({
			queryFn: async (draft) => {
				try {
					const data = await practiceService.saveExercise(draft);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, draft) => [
				{
					type: "PracticeExercises",
					id: draft.meta.spaceId,
				},
			],
		}),
		recordPracticeSession: builder.mutation<LeaderboardEntry[], ExerciseAttempt>({
			queryFn: async (attempt) => {
				try {
					const data = await practiceService.recordSession(attempt);
					return { data };
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, attempt) => [
				{
					type: "PracticeLeaderboard",
					id: attempt.spaceId,
				},
			],
		}),
	}),
});

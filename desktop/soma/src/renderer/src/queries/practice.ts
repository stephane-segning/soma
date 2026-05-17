import { practiceApi } from "@app/store/api/practice-api";
import type { ExerciseAttempt, ExerciseDraft, GenerateExerciseInput } from "@shared/practice";

const usePracticeExercisesQuery = (spaceId: string | undefined) =>
	practiceApi.useListPracticeExercisesQuery(spaceId as string, {
		skip: !spaceId,
	});

function useGeneratePracticeExerciseMutation() {
	const [mutate, state] = practiceApi.useGeneratePracticeExerciseMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: GenerateExerciseInput) => mutate(input).unwrap(),
	};
}

function useSavePracticeExerciseMutation() {
	const [mutate, state] = practiceApi.useSavePracticeExerciseMutation();
	return {
		...state,
		mutate,
		mutateAsync: (draft: ExerciseDraft) => mutate(draft).unwrap(),
	};
}

function useRecordPracticeSessionMutation() {
	const [mutate, state] = practiceApi.useRecordPracticeSessionMutation();
	return {
		...state,
		mutate,
		mutateAsync: (attempt: ExerciseAttempt) => mutate(attempt).unwrap(),
	};
}

export {
	useGeneratePracticeExerciseMutation,
	usePracticeExercisesQuery,
	useRecordPracticeSessionMutation,
	useSavePracticeExerciseMutation,
};

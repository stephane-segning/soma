export type ExerciseDifficulty = "beginner" | "intermediate" | "advanced";

export type ExerciseDraft = {
	message: string;
	meta: {
		spaceId: string;
		topic?: string;
		difficulty?: ExerciseDifficulty;
		source?: "agent" | "manual" | "imported";
		tags?: string[];
	};
};

export type ExerciseMetadata = {
	id: string;
	spaceId: string;
	createdAtMs: number;
	difficulty: ExerciseDifficulty;
	source: "agent" | "manual" | "imported";
	topic?: string;
	length: number;
	tags?: string[];
};

export type Exercise = {
	cid: string;
	message: string;
	meta: ExerciseMetadata;
};

export type ExerciseAttempt = {
	exerciseId: string;
	spaceId: string;
	wpm: number;
	accuracy: number;
	durationMs: number;
	completedAtMs: number;
};

export type LeaderboardEntry = {
	spaceId: string;
	exerciseId: string;
	peerId?: string;
	displayName?: string;
	wpm: number;
	accuracy: number;
	completedAtMs: number;
};

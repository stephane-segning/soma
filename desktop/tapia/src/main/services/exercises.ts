import crypto from "node:crypto";
import { ipcMain } from "electron";
import type { Exercise, ExerciseAttempt, ExerciseDraft, LeaderboardEntry } from "../../shared/exercise";

type SpaceStub = { id: string; name: string; description: string };

const spaces: SpaceStub[] = [
	{ id: "practice", name: "Practice Space", description: "Local drafts and demos" },
	{ id: "focus", name: "Focus Lab", description: "LLM-generated drills" },
];
const exercisesBySpace = new Map<string, Exercise[]>();
const attemptsBySpace = new Map<string, ExerciseAttempt[]>();

export function registerExerciseIpc(): void {
	ipcMain.handle("daemon:list-exercises", (_event, spaceId: string) => exercisesBySpace.get(spaceId) ?? []);
	ipcMain.handle("daemon:save-exercise", (_event, draft: ExerciseDraft) => storeExercise(draft));
	ipcMain.handle("daemon:record-session", (_event, attempt: ExerciseAttempt) => ({ ok: true, leaderboard: recordAttempt(attempt) }));
	ipcMain.handle("agent:generate-exercise", (_event, input: { spaceId: string; topic?: string; difficulty?: ExerciseDraft["meta"]["difficulty"] }) => generateExerciseDraft(input));
}

export function seedExercises(): void {
	if (exercisesBySpace.size > 0) return;
	for (const space of spaces) {
		storeExercise({ message: "type with intention and listen to every key you press", meta: { spaceId: space.id, difficulty: "beginner", source: "manual", topic: "warmup" } });
		storeExercise({ message: "collaborative typing drills keep your identity synced through the soma-daemon while agentd mixes in new phrases", meta: { spaceId: space.id, difficulty: "intermediate", source: "agent", topic: "collaboration" } });
	}
}

function storeExercise(draft: ExerciseDraft): Exercise {
	const meta = {
		id: crypto.randomUUID(),
		spaceId: draft.meta.spaceId,
		topic: draft.meta.topic,
		difficulty: draft.meta.difficulty ?? "intermediate",
		source: draft.meta.source ?? "agent",
		createdAtMs: Date.now(),
		length: draft.message.length,
		tags: draft.meta.tags,
	};
	const payload = { message: draft.message, meta };
	const exercise = { cid: cidFromPayload(payload), ...payload };
	exercisesBySpace.set(meta.spaceId, [exercise, ...(exercisesBySpace.get(meta.spaceId) ?? [])]);
	return exercise;
}

function recordAttempt(attempt: ExerciseAttempt): LeaderboardEntry[] {
	attemptsBySpace.set(attempt.spaceId, [...(attemptsBySpace.get(attempt.spaceId) ?? []), attempt]);
	return buildLeaderboard(attempt.spaceId);
}

function buildLeaderboard(spaceId: string): LeaderboardEntry[] {
	return [...(attemptsBySpace.get(spaceId) ?? [])]
		.sort((a, b) => (b.wpm === a.wpm ? b.accuracy - a.accuracy : b.wpm - a.wpm))
		.map((attempt) => ({ spaceId: attempt.spaceId, exerciseId: attempt.exerciseId, wpm: attempt.wpm, accuracy: attempt.accuracy, completedAtMs: attempt.completedAtMs }))
		.slice(0, 10);
}

function cidFromPayload(payload: unknown): string {
	return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function generateExerciseDraft(input: { spaceId: string; topic?: string; difficulty?: ExerciseDraft["meta"]["difficulty"]; length?: number }): ExerciseDraft {
	const bank = [
		"flowing keystrokes build reliable muscle memory",
		"pace yourself and trust the rhythm of the keyboard",
		"tiny habits create durable accuracy for every session",
		"sustain focus, relax shoulders, breathe, and continue",
		"libp2p peers sync practice stats quietly in the background",
	];
	const chosen = input.topic ?? bank[Math.floor(Math.random() * bank.length)] ?? "practice steadily with short bursts of typing";
	const desiredLength = input.length ?? 140;
	let message = chosen;
	while (message.length < desiredLength) message = `${message}. ${bank[Math.floor(Math.random() * bank.length)]}`;
	return { message: message.slice(0, desiredLength + 20), meta: { spaceId: input.spaceId, topic: input.topic, difficulty: input.difficulty ?? "intermediate", source: "agent" } };
}

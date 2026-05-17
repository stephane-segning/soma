import crypto from "node:crypto";
import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	GenerateExerciseInput,
	LeaderboardEntry,
	RecordSessionResponse,
} from "@shared/practice";

type SpaceStub = { id: string; name: string; description: string };

const spaces: SpaceStub[] = [
	{
		id: "practice",
		name: "Practice Space",
		description: "Local drafts and demos",
	},
	{ id: "focus", name: "Focus Lab", description: "LLM-generated drills" },
];

const exerciseBank = [
	"flowing keystrokes build reliable muscle memory",
	"pace yourself and trust the rhythm of the keyboard",
	"tiny habits create durable accuracy for every session",
	"sustain focus, relax shoulders, breathe, and continue",
	"libp2p peers sync practice stats quietly in the background",
];

export class PracticeController {
	private readonly exercisesBySpace = new Map<string, Exercise[]>();
	private readonly attemptsBySpace = new Map<string, ExerciseAttempt[]>();
	private seeded = false;

	constructor() {
		this.seed();
	}

	private seed(): void {
		if (this.seeded) return;
		this.seeded = true;
		for (const space of spaces) {
			this.storeExercise({
				message: "type with intention and listen to every key you press",
				meta: {
					spaceId: space.id,
					difficulty: "beginner",
					source: "manual",
					topic: "warmup",
				},
			});
			this.storeExercise({
				message:
					"collaborative typing drills keep your identity synced through the soma-daemon while agentd mixes in new phrases",
				meta: {
					spaceId: space.id,
					difficulty: "intermediate",
					source: "agent",
					topic: "collaboration",
				},
			});
		}
	}

	listExercises(spaceId: string): Exercise[] {
		return this.exercisesBySpace.get(spaceId) ?? [];
	}

	saveExercise(draft: ExerciseDraft): Exercise {
		return this.storeExercise(draft);
	}

	recordSession(attempt: ExerciseAttempt): RecordSessionResponse {
		this.attemptsBySpace.set(attempt.spaceId, [...(this.attemptsBySpace.get(attempt.spaceId) ?? []), attempt]);
		return { ok: true, leaderboard: this.buildLeaderboard(attempt.spaceId) };
	}

	generateExercise(input: GenerateExerciseInput): ExerciseDraft {
		const chosen =
			input.topic ??
			exerciseBank[Math.floor(Math.random() * exerciseBank.length)] ??
			"practice steadily with short bursts of typing";
		const desiredLength = input.length ?? 140;
		let message = chosen;
		while (message.length < desiredLength) {
			message = `${message}. ${exerciseBank[Math.floor(Math.random() * exerciseBank.length)]}`;
		}
		return {
			message: message.slice(0, desiredLength + 20),
			meta: {
				spaceId: input.spaceId,
				topic: input.topic,
				difficulty: input.difficulty ?? "intermediate",
				source: "agent",
			},
		};
	}

	private storeExercise(draft: ExerciseDraft): Exercise {
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
		const exercise: Exercise = { cid: cidFromPayload(payload), ...payload };
		this.exercisesBySpace.set(meta.spaceId, [exercise, ...(this.exercisesBySpace.get(meta.spaceId) ?? [])]);
		return exercise;
	}

	private buildLeaderboard(spaceId: string): LeaderboardEntry[] {
		return [...(this.attemptsBySpace.get(spaceId) ?? [])]
			.sort((a, b) => (b.wpm === a.wpm ? b.accuracy - a.accuracy : b.wpm - a.wpm))
			.map((attempt) => ({
				spaceId: attempt.spaceId,
				exerciseId: attempt.exerciseId,
				wpm: attempt.wpm,
				accuracy: attempt.accuracy,
				completedAtMs: attempt.completedAtMs,
			}))
			.slice(0, 10);
	}
}

function cidFromPayload(payload: unknown): string {
	return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

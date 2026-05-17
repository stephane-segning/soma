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
		const difficulty = draft.meta.difficulty ?? "intermediate";
		const source = draft.meta.source ?? "agent";

		// CID hashes only the *content*: the message + the intrinsic metadata
		// that identifies this exercise. Volatile/derived fields (id,
		// createdAtMs, length) are excluded — otherwise two identical
		// exercises would always get different CIDs, which defeats
		// content-addressing.
		const cid = cidFromContent({
			message: draft.message,
			spaceId: draft.meta.spaceId,
			topic: draft.meta.topic,
			difficulty,
			source,
			tags: draft.meta.tags,
		});

		const meta = {
			id: crypto.randomUUID(),
			spaceId: draft.meta.spaceId,
			topic: draft.meta.topic,
			difficulty,
			source,
			createdAtMs: Date.now(),
			length: draft.message.length,
			tags: draft.meta.tags,
		};
		const exercise: Exercise = { cid, message: draft.message, meta };
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

function cidFromContent(content: Record<string, unknown>): string {
	return crypto.createHash("sha256").update(canonicalJson(content)).digest("hex");
}

/**
 * Canonical JSON serialization for content addressing: object keys sorted
 * alphabetically at every level, arrays preserve insertion order. Matches
 * RFC 8785-style intent without pulling in a dependency. Required because
 * `JSON.stringify` emits keys in insertion order, which makes the same
 * logical object hash differently when constructed via different paths.
 */
function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	const keys = Object.keys(value as Record<string, unknown>)
		.filter((k) => (value as Record<string, unknown>)[k] !== undefined)
		.sort();
	const entries = keys.map(
		(k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`,
	);
	return `{${entries.join(",")}}`;
}

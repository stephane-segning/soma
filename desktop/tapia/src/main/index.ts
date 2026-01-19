import crypto from "node:crypto";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { StageConfigService } from "@soma/desktop-config";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import icon from "../../resources/icon.png?asset";
import type {
	Exercise,
	ExerciseAttempt,
	ExerciseDraft,
	LeaderboardEntry,
} from "../shared/exercise";

new StageConfigService({
	appPrefix: "tapia",
	isDev: is.dev,
	stageEnvKeys: ["TAPIA_STAGE", "SOMA_STAGE", "SOMA_CHANNEL"],
}).apply();

type SpaceStub = {
	id: string;
	name: string;
	description: string;
};

const spaces: SpaceStub[] = [
	{
		id: "practice",
		name: "Practice Space",
		description: "Local drafts and demos",
	},
	{ id: "focus", name: "Focus Lab", description: "LLM-generated drills" },
];

const exercisesBySpace = new Map<string, Exercise[]>();
const attemptsBySpace = new Map<string, ExerciseAttempt[]>();

function cidFromPayload(payload: unknown): string {
	return crypto
		.createHash("sha256")
		.update(JSON.stringify(payload))
		.digest("hex");
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
	const exercise: Exercise = {
		cid: cidFromPayload(payload),
		...payload,
	};

	const list = exercisesBySpace.get(meta.spaceId) ?? [];
	exercisesBySpace.set(meta.spaceId, [exercise, ...list]);
	return exercise;
}

function seedExercises(): void {
	if (exercisesBySpace.size > 0) return;
	spaces.forEach((space) => {
		storeExercise({
			message: "type with intention and listen to every key you press",
			meta: {
				spaceId: space.id,
				difficulty: "beginner",
				source: "manual",
				topic: "warmup",
			},
		});
		storeExercise({
			message:
				"collaborative typing drills keep your identity synced through the soma-daemon while agentd mixes in new phrases",
			meta: {
				spaceId: space.id,
				difficulty: "intermediate",
				source: "agent",
				topic: "collaboration",
			},
		});
	});
}

function buildLeaderboard(spaceId: string): LeaderboardEntry[] {
	const attempts = attemptsBySpace.get(spaceId) ?? [];
	return [...attempts]
		.sort((a, b) => {
			if (b.wpm === a.wpm) return b.accuracy - a.accuracy;
			return b.wpm - a.wpm;
		})
		.map((attempt) => ({
			spaceId: attempt.spaceId,
			exerciseId: attempt.exerciseId,
			wpm: attempt.wpm,
			accuracy: attempt.accuracy,
			completedAtMs: attempt.completedAtMs,
		}))
		.slice(0, 10);
}

function recordAttempt(attempt: ExerciseAttempt): LeaderboardEntry[] {
	const list = attemptsBySpace.get(attempt.spaceId) ?? [];
	attemptsBySpace.set(attempt.spaceId, [...list, attempt]);
	return buildLeaderboard(attempt.spaceId);
}

function generateExerciseDraft(input: {
	spaceId: string;
	topic?: string;
	difficulty?: ExerciseDraft["meta"]["difficulty"];
	length?: number;
}): ExerciseDraft {
	const bank = [
		"flowing keystrokes build reliable muscle memory",
		"pace yourself and trust the rhythm of the keyboard",
		"tiny habits create durable accuracy for every session",
		"sustain focus, relax shoulders, breathe, and continue",
		"libp2p peers sync practice stats quietly in the background",
	];
	const chosen =
		input.topic ??
		bank[Math.floor(Math.random() * bank.length)] ??
		"practice steadily with short bursts of typing";

	const desiredLength = input.length ?? 140;
	let message = chosen;
	while (message.length < desiredLength) {
		message = `${message}. ${bank[Math.floor(Math.random() * bank.length)]}`;
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

function createWindow(): void {
	// Create the browser window.
	const mainWindow = new BrowserWindow({
		width: 900,
		height: 670,
		show: false,
		titleBarStyle: "hidden",
		autoHideMenuBar: true,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
		},
	});

	mainWindow.on("ready-to-show", () => {
		mainWindow.show();
	});

	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url);
		return { action: "deny" };
	});

	// HMR for renderer base on electron-vite cli.
	// Load the remote URL for development or the local html file for production.
	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	} else {
		mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	// Set app user model id for windows
	electronApp.setAppUserModelId("com.electron");

	seedExercises();

	// Default open or close DevTools by F12 in development
	// and ignore CommandOrControl + R in production.
	// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	ipcMain.handle("daemon:list-exercises", (_event, spaceId: string) => {
		return exercisesBySpace.get(spaceId) ?? [];
	});

	ipcMain.handle("daemon:save-exercise", (_event, draft: ExerciseDraft) => {
		return storeExercise(draft);
	});

	ipcMain.handle(
		"daemon:record-session",
		(_event, attempt: ExerciseAttempt) => {
			return { ok: true, leaderboard: recordAttempt(attempt) };
		},
	);

	ipcMain.handle(
		"agent:generate-exercise",
		(
			_event,
			input: {
				spaceId: string;
				topic?: string;
				difficulty?: ExerciseDraft["meta"]["difficulty"];
			},
		) => {
			return generateExerciseDraft(input);
		},
	);

	createWindow();

	app.on("activate", () => {
		// On macOS it's common to re-create a window in the app when the
		// dock icon is clicked and there are no other windows open.
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

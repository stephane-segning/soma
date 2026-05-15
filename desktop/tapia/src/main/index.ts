import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import { runtimeConfig } from "./runtime-config";
import { registerDbStorageIpc } from "./ipc/db-storage";
import { registerExerciseIpc, seedExercises } from "./services/exercises";
import { createSplashWindow, createWindow } from "./windows";
import { waitForDaemonSocket } from "./daemon-ready";

registerDbStorageIpc();

app.whenReady().then(async () => {
	electronApp.setAppUserModelId("com.electron");
	seedExercises();
	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});
	registerExerciseIpc();

	const splash = createSplashWindow();
	await waitForDaemonSocket(runtimeConfig.daemonSocketPath);
	createWindow();
	if (!splash.isDestroyed()) splash.close();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

import { electronApp, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow } from "electron";
import { waitForDaemonSocket } from "./daemon-ready";
import { registerDbStorageIpc } from "./ipc/db-storage";
import { runtimeConfig } from "./runtime-config";
import { registerExerciseIpc, seedExercises } from "./services/exercises";
import { createSplashWindow, createWindow } from "./windows";

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

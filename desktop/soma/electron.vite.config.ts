import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	main: {},
	preload: {},
	renderer: {
		resolve: {
			alias: [{ find: "@app", replacement: resolve("src/renderer/src") }],
		},
		plugins: [react(), tsconfigPaths()],
	},
});

import { consoleForwardPlugin } from "@0xbigboss/vite-console-forward-plugin";
import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import VitePluginCssMediaSplitter from "css-media-splitter/vite-plugin";
import TurboConsole from "unplugin-turbo-console/vite";
import { defineConfig } from "vite";
import biomePlugin from "vite-plugin-biome";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { qrcode } from "vite-plugin-qrcode";
import topLevelAwait from "vite-plugin-top-level-await";
import { vitePluginVersionMark } from "vite-plugin-version-mark";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

const host = process.env.TAURI_DEV_HOST as string;

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [
		TurboConsole({
			/* options here */
		}),
		qrcode(),
		VitePluginCssMediaSplitter(),
		vitePluginVersionMark({
			// name: 'test-app',
			// version: '0.0.1',
			// command: 'git describe --tags',
			// outputFile: true,
			// ifGitSHA: true,
			ifShortSHA: true,
			ifMeta: true,
			ifLog: true,
			ifGlobal: true,
		}),
		biomePlugin({
			mode: "check",
			files: ".",
			applyFixes: true,
		}),
		legacy({
			targets: ["defaults", "not IE 11"],
		}),
		ViteImageOptimizer({
			/* pass your config */
		}),
		react(),
		tsconfigPaths(),
		ViteMinifyPlugin({}),
		consoleForwardPlugin({}),
		wasm(),
		topLevelAwait(),
	],

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent Vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell Vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},
	build: {
		chunkSizeWarningLimit: 5_000, // 5KB
	},
}));

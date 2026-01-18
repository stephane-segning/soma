import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { PreRenderedAsset } from "rollup";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import topLevelAwait from "vite-plugin-top-level-await";
import { vitePluginVersionMark } from "vite-plugin-version-mark";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig((configEnv) => ({
	main: {
		build: {
			externalizeDeps: true,
		},
	},
	preload: {
		build: {
			externalizeDeps: true,
		},
	},
	renderer: {
		resolve: {
			alias: [
				{
					find: "@app",
					replacement: resolve("src/renderer/src"),
				},
			],
		},
		plugins: [
			react(),
			tsconfigPaths(),
			configEnv.command === "build" &&
				ViteImageOptimizer({
					/* pass your config */
				}),
			configEnv.command === "build" &&
				vitePluginVersionMark({
					ifShortSHA: true,
					ifMeta: true,
					ifLog: true,
					ifGlobal: true,
				}),
			configEnv.command === "build" && ViteMinifyPlugin({}),
			wasm(),
			topLevelAwait(),
		],
		build: {
			chunkSizeWarningLimit: 5_000, // 5KB
			rollupOptions: {
				output: {
					entryFileNames: "assets/js/[name]-[hash].js",
					chunkFileNames: "assets/js/chunks/[name]-[hash].js",
					assetFileNames: (assetInfo: PreRenderedAsset) => {
						if (assetInfo.names?.some((name) => name?.endsWith(".css")) ?? assetInfo.name?.endsWith(".css")) {
							return "assets/css/[name]-[hash][extname]";
						}

						return "assets/[name]-[hash][extname]";
					},
				},
			},
		},
	},
}));

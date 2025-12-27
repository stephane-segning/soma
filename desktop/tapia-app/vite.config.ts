import { consoleForwardPlugin } from "@0xbigboss/vite-console-forward-plugin";
import react from "@vitejs/plugin-react";
import basex from "base-x";
import { defineConfig } from "vite";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

const host = process.env.TAURI_DEV_HOST as string;

const baseEncode = (plaintext: string): string => {
	const base =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-'._~!$&()*+,;=:@";
	const converter = basex(base);
	return converter.encode(Buffer.from(plaintext));
};

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [
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
}));

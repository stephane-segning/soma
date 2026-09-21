import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
	// `vite --mode web` / `vite build --mode web` (see package.json's
	// `dev:web` / `build:web` / `preview:web`) produce the plain-browser
	// bundle for `desktop-bff`. This file stays additive — every
	// Tauri-only setting below is unchanged from before, and only branches
	// where the two targets genuinely differ.
	const isWeb = mode === "web";

	return {
		plugins: [react()],

		// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
		//
		// 1. prevent Vite from obscuring rust errors
		clearScreen: false,
		// 2. tauri expects a fixed port, fail if that port is not available.
		//    The web target has no Tauri process waiting on a specific
		//    port, so it just takes Vite's own defaults.
		server: isWeb
			? undefined
			: {
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

		// `src-tauri/tauri.conf.json`'s `frontendDist: "../dist"` hardcodes
		// the Tauri build's output directory (out of scope for this SDK/web
		// work) — it must stay exactly `dist`. The web build writes to a
		// sibling directory instead, so `pnpm build` and
		// `pnpm run build:web` can never clobber each other's output.
		build: isWeb ? { outDir: "dist-web" } : undefined,
	};
});

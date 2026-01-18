import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/components/**/*.{ts,tsx}",
		"src/hooks/**/*.{ts,tsx}",
		"src/types.ts",
		"src/yoopta/index.ts",
	],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	target: "es2020",
	clean: false,
	minify: false,
	treeshake: true,
	external: [
		"react",
		"react-dom",
		"react-router",
		"@yoopta/editor",
		"@floating-ui/react",
		"@tauri-apps/api",
		"@tauri-apps/plugin-dialog",
		"slate",
		"slate-react",
		"react-feather",
	],
});

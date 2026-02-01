import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/components/**/*.{ts,tsx}",
		"src/hooks/**/*.{ts,tsx}",
		"src/types.ts",
	],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	target: "es2020",
	clean: true,
	minify: false,
	treeshake: true,
	external: [
		"react",
		"react-dom",
		"react-router",
		"@floating-ui/react",
		"slate",
		"slate-react",
		"react-feather",
	],
});

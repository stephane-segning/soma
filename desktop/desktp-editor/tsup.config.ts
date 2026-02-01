import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/components/**/*.{ts,tsx}",
		"src/extensions/**/*.{ts,tsx}",
		"src/menus/**/*.{ts,tsx}",
		"src/commands/**/*.ts",
	],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	target: "es2020",
	clean: true,
	bundle: false,
	platform: "browser",
});

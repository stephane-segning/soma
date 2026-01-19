import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/stage-config.ts"],
	format: ["esm", "cjs"],
	dts: true,
	outDir: "dist",
	clean: true,
	splitting: false,
	bundle: false,
	platform: "node",
	target: "node18",
	external: ["electron"],
	tsconfig: "tsconfig.json"
});

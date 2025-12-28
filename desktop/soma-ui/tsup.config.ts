import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	target: "es2020",
	clean: false,
	minify: false,
	treeshake: true,
	external: ["react", "react-dom", "react-router"],
});

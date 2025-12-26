import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

console.log = (...args: string[]) =>
	info(`[ui] ${args.map((o) => String(o)).join(",")}`);

console.trace = (...args: string[]) =>
	trace(`[ui] ${args.map((o) => String(o)).join(",")}`);

console.info = (...args: string[]) =>
	info(`[ui] ${args.map((o) => String(o)).join(",")}`);

console.debug = (...args: string[]) =>
	debug(`[ui] ${args.map((o) => String(o)).join(",")}`);

console.error = (...args: string[]) =>
	error(`[ui] ${args.map((o) => String(o)).join(",")}`);

console.warn = (...args: string[]) =>
	warn(`[ui] ${args.map((o) => String(o)).join(",")}`);

import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

function forwardConsole(
	fnName: "log" | "debug" | "info" | "warn" | "error",
	logger: (message: string) => Promise<void>,
) {
	const original = console[fnName];
	console[fnName] = (...messages: unknown[]) => {
		original(...messages);
		logger(
			messages
				.map((i) =>
					typeof i === "string" || typeof i === "undefined"
						? i
						: JSON.stringify(i),
				)
				.join(" "),
		);
	};
}

forwardConsole("log", trace);
forwardConsole("debug", debug);
forwardConsole("info", info);
forwardConsole("warn", warn);
forwardConsole("error", error);

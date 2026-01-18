const isDev = import.meta.env.DEV;
const forwardEnabled = isDev || import.meta.env.VITE_FORWARD_CONSOLE === "true";

const MAX_QUEUE = 200;
const MAX_MESSAGE_LEN = 20_000;

type ConsoleFnName = "log" | "debug" | "info" | "warn" | "error";

function formatValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (value instanceof Error) return value.stack ?? value.message;

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function formatMessage(messages: unknown[]): string {
	const combined = messages.map(formatValue).join(" ");
	if (combined.length <= MAX_MESSAGE_LEN) return combined;
	return `${combined.slice(0, MAX_MESSAGE_LEN)}…(truncated)`;
}

function createBufferedLogger(logger: (message: string) => Promise<void>) {
	const queue: string[] = [];
	let flushing = false;

	const flush = async () => {
		if (flushing) return;
		flushing = true;
		try {
			while (queue.length > 0) {
				const next = queue.shift();
				if (!next) continue;
				try {
					await logger(next);
				} catch {
					// ignore logging failures
				}
			}
		} finally {
			flushing = false;
		}
	};

	return (message: string) => {
		if (queue.length >= MAX_QUEUE) return;
		queue.push(message);
		void flush();
	};
}

function forwardConsole(fnName: ConsoleFnName, logger: (message: string) => Promise<void>) {
	const original = console[fnName].bind(console) as (...messages: unknown[]) => void;
	const buffered = createBufferedLogger(logger);
	console[fnName] = (...messages: unknown[]) => {
		original(...messages);
		buffered(formatMessage(messages));
	};
}

if (forwardEnabled) {
	// Forward console output to the main process for centralized logging.
	const send = async (payload: { level: string; message: string }) => {
		try {
			const { invoke } = await import("./ipc");
			await invoke("log:message", payload);
		} catch {
			// ignore
		}
	};

	forwardConsole("log", (message) =>
		send({
			level: "log",
			message,
		}),
	);
	forwardConsole("debug", (message) =>
		send({
			level: "debug",
			message,
		}),
	);
	forwardConsole("info", (message) =>
		send({
			level: "info",
			message,
		}),
	);
	forwardConsole("warn", (message) =>
		send({
			level: "warn",
			message,
		}),
	);
	forwardConsole("error", (message) =>
		send({
			level: "error",
			message,
		}),
	);
}

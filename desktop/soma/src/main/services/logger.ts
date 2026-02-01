import { mkdirSync } from "fs-extra";
import { join } from "path";
import winston from "winston";
import "winston-daily-rotate-file";

export type LogLevel = "error" | "warn" | "info" | "debug";

export type AppLoggerOptions = {
	logDir: string;
	isDev: boolean;
};

export class AppLogger {
	private readonly logger: winston.Logger;

	constructor(options: AppLoggerOptions) {
		mkdirSync(options.logDir, {
			recursive: true,
		});

		const timeFormat = winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" });

		const fileFormat = winston.format.combine(
			timeFormat,
			winston.format.errors({ stack: true }),
			winston.format.splat(),
		);

		const transports: winston.transport[] = [
			new winston.transports.File({
				filename: join(options.logDir, "main.log"),
				level: "info",
				maxsize: 1_000_000,
				maxFiles: 5,
			}),
			new winston.transports.DailyRotateFile({
				level: options.isDev ? "debug" : "info",
				filename: join(options.logDir, "daily-%DATE%.log"),
				datePattern: "YYYY-MM-DD",
				zippedArchive: true,
				maxSize: "20m",
				maxFiles: "14d",
				format: fileFormat,
			}),
		];

		const formats: winston.Logform.Format[] = [
			timeFormat,
			winston.format.errors({
				stack: true,
			}),
		];

		if (options.isDev) {
			const consoleFormat = winston.format.combine(
				winston.format.colorize({ all: true }),
				timeFormat,
				winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
			);

			transports.push(
				new winston.transports.Console({
					level: "debug",
					format: consoleFormat,
				}),
			);
		} else {
			formats.push(winston.format.json());
		}

		this.logger = winston.createLogger({
			level: "debug",
			format: winston.format.combine(...formats),
			transports,
		});
	}

	log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
		this.logger.log(level, message, meta);
	}
}

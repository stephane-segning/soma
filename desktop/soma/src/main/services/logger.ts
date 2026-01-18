import { mkdirSync } from "fs-extra";
import { join } from "path";
import winston from "winston";

export type LogLevel =
	| "error"
	| "warn"
	| "info"
	| "debug";

export type AppLoggerOptions =
	{
		logDir: string;
		isDev: boolean;
	};

export class AppLogger {
	private readonly logger: winston.Logger;

	constructor(
		options: AppLoggerOptions,
	) {
		mkdirSync(
			options.logDir,
			{
				recursive: true,
			},
		);

		const transports: winston.transport[] =
			[
				new winston.transports.File(
					{
						filename:
							join(
								options.logDir,
								"main.log",
							),
						level:
							"info",
						maxsize: 5_000_000,
						maxFiles: 5,
					},
				),
			];
		const formats: winston.format[] =
			[
				winston.format.timestamp(),
				winston.format.errors(
					{
						stack: true,
					},
				),
			];

		if (
			options.isDev
		) {
			transports.push(
				new winston.transports.Console(
					{
						level:
							"debug",
					},
				),
			);
		} else {
			formats.push(
				winston.format.json(),
			);
		}

		this.logger =
			winston.createLogger(
				{
					level:
						"debug",
					format:
						winston.format.combine(
							...formats,
						),
					transports,
				},
			);
	}

	log(
		level: LogLevel,
		message: string,
		meta?: Record<
			string,
			unknown
		>,
	): void {
		this.logger.log(
			level,
			message,
			meta,
		);
	}
}

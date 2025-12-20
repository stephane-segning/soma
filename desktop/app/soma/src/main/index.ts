import "reflect-metadata";
import { protocol } from "electron";
import { resolve } from "./container";
import { TYPES } from "./tokens";

protocol.registerSchemesAsPrivileged([
	{
		scheme: "soma-blob",
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
			stream: true,
		},
	},
]);

const somaApp = resolve(TYPES.somaElectronApp);
somaApp.start();

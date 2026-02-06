import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ChainedBackend, {
	type ChainedBackendOptions,
} from "i18next-chained-backend";
import HttpBackend from "i18next-http-backend";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { uiPreferencesCollection } from "./db";
import {
	UI_PREFERENCES_RECORD_ID,
	createUiPreferencesRecord,
	isUiPreferencesRecord,
} from "@soma/desktop-db";

const isDev = import.meta.env.DEV;

const resourcesBackend = resourcesToBackend(
	(lng: string, ns: string) => import(`../locales/${lng}/${ns}.json`),
);

const backendOptions: ChainedBackendOptions = {
	backends: isDev ? [HttpBackend, resourcesBackend] : [resourcesBackend],
	backendOptions: isDev
		? [
				{
					loadPath:
						import.meta.env.VITE_I18N_LOAD_PATH ??
						"/locales/{{lng}}/{{ns}}.json",
				},
				{},
			]
		: [{}],
};

const dbLanguageDetector = {
	name: "dbStorage",
	lookup: () => {
		const record = uiPreferencesCollection.state.get(UI_PREFERENCES_RECORD_ID);
		if (record && isUiPreferencesRecord(record) && record.language) {
			return record.language;
		}
		return undefined;
	},
	cacheUserLanguage: (lng: string) => {
		const existing = uiPreferencesCollection.state.get(UI_PREFERENCES_RECORD_ID);
		if (existing && isUiPreferencesRecord(existing) && existing.language === lng) return;
		const record = createUiPreferencesRecord({ language: lng }, Date.now());
		if (existing) {
			uiPreferencesCollection.update(UI_PREFERENCES_RECORD_ID, (draft) => {
				draft.version = record.version;
				draft.updatedAtMs = record.updatedAtMs;
				draft.language = record.language;
			});
			return;
		}
		uiPreferencesCollection.insert(record);
	},
};

const languageDetector = new LanguageDetector();
languageDetector.addDetector(dbLanguageDetector);

void i18n
	.use(initReactI18next)
	.use(languageDetector)
	.use(ChainedBackend)
	.init({
		fallbackLng: "en",
		supportedLngs: ["en"],
		ns: ["common"],
		defaultNS: "common",
		detection: {
			order: ["querystring", "dbStorage", "navigator"],
			caches: ["dbStorage"],
		},
		interpolation: {
			escapeValue: false,
		},
		backend: backendOptions,
	});

export { i18n };

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ChainedBackend, { type ChainedBackendOptions } from "i18next-chained-backend";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

const resourcesBackend = resourcesToBackend((lng: string, ns: string) => import(`../locales/${lng}/${ns}.json`));

const backendOptions: ChainedBackendOptions = {
	backends: [resourcesBackend],
	backendOptions: [{}],
};

void i18n
	.use(initReactI18next)
	.use(LanguageDetector)
	.use(ChainedBackend)
	.init({
		fallbackLng: "en",
		supportedLngs: ["en", "fr"],
		ns: ["common"],
		defaultNS: "common",
		detection: {
			order: ["querystring", "localStorage", "navigator"],
			caches: ["localStorage"],
		},
		interpolation: { escapeValue: false },
		backend: backendOptions,
	});

export { i18n };

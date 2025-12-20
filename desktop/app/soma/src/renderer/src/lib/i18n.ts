import i18n from "i18next";
import ChainedBackend, {
	type ChainedBackendOptions,
} from "i18next-chained-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

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

void i18n
	.use(initReactI18next)
	.use(LanguageDetector)
	.use(ChainedBackend)
	.init({
		fallbackLng: "en",
		supportedLngs: ["en"],
		ns: ["common"],
		defaultNS: "common",
		detection: {
			order: ["querystring", "localStorage", "navigator"],
			caches: ["localStorage"],
		},
		interpolation: {
			escapeValue: false,
		},
		backend: backendOptions,
	});

export { i18n };

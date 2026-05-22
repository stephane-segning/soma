import { useTranslation } from "react-i18next";
import { BackendStatusPanel } from "../components/BackendStatusPanel";

export function SpacesIndex() {
	const { t } = useTranslation();
	return (
		<main className="mx-auto w-full max-w-4xl px-8 py-10">
			<header className="mb-6">
				<h1 className="font-semibold text-2xl">{t("nav.spaces")}</h1>
				<p className="text-sm opacity-70">{t("pages.spaces_index.empty")}</p>
			</header>
			<BackendStatusPanel />
		</main>
	);
}

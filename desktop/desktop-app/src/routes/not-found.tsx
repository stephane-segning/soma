import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function NotFound() {
	const { t } = useTranslation();
	return (
		<main className="mx-auto w-full max-w-2xl px-8 py-16 text-center">
			<h1 className="font-semibold text-3xl">{t("pages.not_found.title")}</h1>
			<p className="mt-2 text-sm opacity-70">{t("pages.not_found.body")}</p>
			<Link className="btn btn-sm mt-6" to="/spaces">
				{t("pages.not_found.cta")}
			</Link>
		</main>
	);
}

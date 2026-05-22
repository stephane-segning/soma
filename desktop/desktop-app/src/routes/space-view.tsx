import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

export function SpaceView() {
	const { t } = useTranslation();
	const { spaceId } = useParams<{ spaceId: string }>();
	return (
		<main className="mx-auto w-full max-w-4xl px-8 py-10">
			<header className="mb-6">
				<h1 className="font-semibold text-2xl">
					{t("nav.spaces")} · <span className="font-mono text-base">{spaceId}</span>
				</h1>
				<p className="text-sm opacity-70">{t("pages.space_view.placeholder")}</p>
			</header>
		</main>
	);
}

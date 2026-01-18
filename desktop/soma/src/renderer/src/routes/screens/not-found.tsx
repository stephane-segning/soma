import { useTranslation } from "react-i18next";
import { Link } from "react-router";

function Component(): React.JSX.Element {
	const {
		t,
	} =
		useTranslation(
			"common",
		);

	return (
		<div className="flex flex-col items-center justify-center gap-4 py-16">
			<h1 className="font-semibold text-2xl">
				{t(
					"notFound.title",
					"Not found",
				)}
			</h1>
			<p className="text-base-content/70">
				{t(
					"notFound.subtitle",
					"That page does not exist.",
				)}
			</p>
			<Link
				className="btn btn-primary"
				to="/"
			>
				{t(
					"notFound.home",
					"Go home",
				)}
			</Link>
		</div>
	);
}

export {
	Component,
};

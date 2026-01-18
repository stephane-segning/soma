import { useTranslation } from "react-i18next";

function Component(): React.JSX.Element {
	const {
		t,
	} =
		useTranslation(
			"common",
		);

	return (
		<div>
			{t(
				"join-space",
				"Join space",
			)}
		</div>
	);
}

export {
	Component,
};

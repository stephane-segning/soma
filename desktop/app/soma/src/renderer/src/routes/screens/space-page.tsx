import { useTranslation } from "react-i18next";
import { YooptaEditorWithTools } from "@renderer/components/yoopta/yoopta-editor-with-tools";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");

	return (
		<div className="flex">
			<YooptaEditorWithTools
				className="!w-full px-12"
				placeholder={t("space.pages.editorPlaceholder", "Start writing…")}
			/>
		</div>
	);
}

export { Component };

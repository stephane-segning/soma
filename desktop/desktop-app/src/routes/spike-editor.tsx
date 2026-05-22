/**
 * SpikeEditor — verbatim port of the original Tauri V2 smoke-test
 * `App.tsx` body. Kept reachable at `/spike/editor` so the
 * Tauri-on-WKWebView Enter/focus probe (originally broken under Yoopta,
 * verified working under TipTap) survives the router refactor.
 */
import { DocumentEditor, type JSONContent } from "@soma/editor";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackendStatusPanel } from "../components/backend-status-panel";
import { backend } from "../lib/backend";

const STARTER_CONTENT: JSONContent = {
	type: "doc",
	content: [
		{
			type: "heading",
			attrs: { level: 1 },
			content: [{ type: "text", text: "Soma desktop" }],
		},
		{
			type: "paragraph",
			content: [
				{ type: "text", text: "This is the smoke-test page. Place the caret here, press " },
				{ type: "text", marks: [{ type: "code" }], text: "Enter" },
				{
					type: "text",
					text: " a few times. With Yoopta on WKWebView the caret would jump out of the editor — TipTap should keep focus.",
				},
			],
		},
		{
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "Type / to open the slash menu." }],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "Hover a line to see the drag handle." }],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "Switch language to verify i18next is live." }],
						},
					],
				},
			],
		},
	],
};

export function SpikeEditor() {
	const { t } = useTranslation();
	const [doc, setDoc] = useState<JSONContent>(STARTER_CONTENT);

	useEffect(() => {
		// One-time hydrate of the dbStorage cache so synchronous reads land
		// the persisted values from the previous launch.
		void backend.dbStorage.hydrate();
	}, []);

	return (
		<main className="mx-auto min-h-screen w-full max-w-4xl px-8 py-10">
			<header className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl">{t("app.title")}</h1>
					<p className="text-sm opacity-70">{t("app.subtitle")}</p>
				</div>
			</header>

			<BackendStatusPanel />

			<p className="mt-8 mb-4 text-sm opacity-70">{t("editor.hint")}</p>

			<div className="rounded-lg border border-base-300 bg-base-200/40 p-6">
				<DocumentEditor initialContent={doc} onChange={setDoc} placeholder={t("editor.placeholder")} />
			</div>

			<div className="mt-4 flex gap-2">
				<button className="btn btn-sm" onClick={() => setDoc({ ...STARTER_CONTENT })} type="button">
					{t("actions.reset")}
				</button>
				<button className="btn btn-ghost btn-sm" onClick={() => console.log("[editor] doc =", doc)} type="button">
					{t("actions.log_json")}
				</button>
			</div>

			<p className="mt-6 text-xs opacity-50">{t("editor.focus_probe")}</p>
		</main>
	);
}

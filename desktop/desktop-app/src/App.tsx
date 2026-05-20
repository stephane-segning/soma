import { DocumentEditor, type JSONContent } from "@soma/editor";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const STARTER_CONTENT: JSONContent = {
	type: "doc",
	content: [
		{
			type: "heading",
			attrs: { level: 1 },
			content: [{ type: "text", text: "Soma · Tauri V2 spike" }],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "This is the smoke-test page. Place the caret here, press ",
				},
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

type AppInfo = { name: string; version: string; tauri: string };

function App() {
	const { t, i18n } = useTranslation();
	const [doc, setDoc] = useState<JSONContent>(STARTER_CONTENT);
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

	useEffect(() => {
		invoke<AppInfo>("app_info")
			.then(setAppInfo)
			.catch((err) => console.warn("app_info failed", err));
	}, []);

	return (
		<main className="mx-auto min-h-screen w-full max-w-4xl px-8 py-10">
			<header className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl">{t("app.title")}</h1>
					<p className="text-sm opacity-70">{t("app.subtitle")}</p>
					{appInfo && (
						<p className="mt-1 text-xs opacity-50">
							{t("app.runtime", {
								name: appInfo.name,
								version: appInfo.version,
								tauri: appInfo.tauri,
							})}
						</p>
					)}
				</div>
				<label className="flex items-center gap-2 text-xs">
					<span className="opacity-70">{t("editor.language_switch")}</span>
					<select
						className="select select-bordered select-xs"
						onChange={(e) => void i18n.changeLanguage(e.target.value)}
						value={i18n.resolvedLanguage}
					>
						<option value="en">EN</option>
						<option value="fr">FR</option>
					</select>
				</label>
			</header>

			<p className="mb-4 text-sm opacity-70">{t("editor.hint")}</p>

			<div className="rounded-lg border border-base-300 bg-base-200/40 p-6">
				<DocumentEditor initialContent={doc} onChange={setDoc} placeholder={t("editor.placeholder")} />
			</div>

			<div className="mt-4 flex gap-2">
				<button className="btn btn-sm" onClick={() => setDoc({ ...STARTER_CONTENT })} type="button">
					{t("actions.reset")}
				</button>
				<button className="btn btn-sm btn-ghost" onClick={() => console.log("[editor] doc =", doc)} type="button">
					{t("actions.log_json")}
				</button>
			</div>

			<p className="mt-6 text-xs opacity-50">{t("editor.focus_probe")}</p>
		</main>
	);
}

export default App;

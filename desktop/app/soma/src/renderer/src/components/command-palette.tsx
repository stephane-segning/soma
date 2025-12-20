import { useSearchQuery } from "@renderer/queries/search";
import { useEffect, useMemo, useState } from "react";
import CommandPalette, {
	filterItems,
	type JsonStructure,
	renderJsonStructure,
	useHandleOpenCommandPalette,
} from "react-cmdk";
import { useNavigate } from "react-router";
import { useUiStore } from "../store/ui";

function CommandPaletteShell(): React.JSX.Element {
	const [selected, setSelected] = useState<number>(0);
	const [search, setSearch] = useState<string>("");
	const [page, setPage] = useState<"root" | "positions">("root");
	const { isCommandPaletteOpen, toggleCommandPalette } = useUiStore();
	const navigate = useNavigate();
	const searchResults = useSearchQuery(search);

	const handleOpenChange = (
		next: boolean | ((open: boolean) => boolean),
	): void => {
		const resolved =
			typeof next === "function"
				? next(useUiStore.getState().isCommandPaletteOpen)
				: next;
		toggleCommandPalette(resolved);
	};

	useHandleOpenCommandPalette(handleOpenChange);

	useEffect(() => {
		if (!isCommandPaletteOpen) {
			setPage("root");
			setSearch("");
			setSelected(0);
		}
	}, [isCommandPaletteOpen]);

	const items: JsonStructure = useMemo(
		() => [
			{
				id: "welcome",
				items: [
					{
						id: "welcome-card",
						children: (
							<div className="w-full rounded-lg border-indigo-500 border-indigo-500 border-t border-b bg-gradient-to-br from-primary via-warning to-success p-4">
								<h2 className="font-semibold text-lg text-white leading-tight">
									Welcome 👋
								</h2>
								<p className="mt-1 max-w-xs font-medium text-sm text-white/80">
									Quickly jump to actions or pages in Soma.
								</p>
							</div>
						),
						showType: false,
						keywords: ["welcome"],
						onClick: () => toggleCommandPalette(false),
					},
				],
			},
			{
				heading: "Navigate",
				id: "navigate",
				items: [
					{
						children: "Spaces",
						id: "route:spaces",
						keywords: ["route", "spaces", "home"],
						onClick: () => {
							navigate("/spaces");
							toggleCommandPalette(false);
						},
					},
					{
						children: "Join Space",
						id: "route:join-space",
						keywords: ["route", "spaces", "join"],
						onClick: () => {
							navigate("/spaces/join");
							toggleCommandPalette(false);
						},
					},
					{
						children: "Settings",
						id: "route:settings",
						keywords: ["route", "settings", "preferences"],
						onClick: () => {
							navigate("/settings");
							toggleCommandPalette(false);
						},
					},
				],
			},
			{
				heading: "Home",
				id: "home",
				items: [
					{
						children: "Open developer tools",
						icon: "CogIcon",
						id: "devtools",
						onClick: () => window.electron.ipcRenderer.send("open-devtools"),
					},
					{
						children: "Positions",
						icon: "BriefcaseIcon",
						closeOnSelect: false,
						keywords: ["jobs"],
						id: "positions",
						onClick: () => {
							setPage("positions");
							setSearch("");
						},
					},
					{
						children: "Documentation",
						icon: "BookOpenIcon",
						id: "docs",
						href: "https://electron-vite.org/",
						target: "_blank",
						rel: "noreferrer",
					},
				],
			},
			{
				heading: "External",
				id: "external",
				items: [
					{
						href: "https://soma.camer.digital",
						children: "Project site",
						icon: "GlobeAltIcon",
						id: "project-site",
						target: "_blank",
						rel: "noopener noreferrer",
					},
				],
			},
			...(search.trim().length >= 2
				? [
						{
							heading: "Search",
							id: "search",
							items: (searchResults.data ?? []).map((result) => ({
								children: (
									<div className="flex flex-col">
										<div className="truncate">{result.title}</div>
										{result.subtitle ? (
											<div className="truncate text-base-content/60 text-xs">
												{result.subtitle}
											</div>
										) : null}
									</div>
								),
								id: `search:${result.id}`,
								keywords: [result.title, result.subtitle].filter(
									(v): v is string => typeof v === "string",
								),
								onClick: () => toggleCommandPalette(false),
							})),
						},
					]
				: []),
		],
		[navigate, search, searchResults.data, toggleCommandPalette],
	);

	const rootItems = useMemo(() => filterItems(items, search), [items, search]);

	return (
		<CommandPalette
			footer={
				<div className="px-4 py-3 text-neutral-500 text-sm">
					Press{" "}
					<kbd className="rounded border border-neutral-400 px-1 py-0.5">
						⌘K
					</kbd>{" "}
					to toggle
				</div>
			}
			isOpen={isCommandPaletteOpen}
			onChangeOpen={handleOpenChange}
			onChangeSearch={setSearch}
			onChangeSelected={setSelected}
			page={page}
			search={search}
			selected={selected}
		>
			<CommandPalette.Page id="root" searchPrefix={["General"]}>
				{rootItems.length ? (
					renderJsonStructure(rootItems)
				) : (
					<CommandPalette.FreeSearchAction
						closeOnSelect={false}
						href={`https://google.com/?q=${search}`}
						rel="noopener noreferrer"
						target="_blank"
					/>
				)}
			</CommandPalette.Page>

			<CommandPalette.Page
				id="positions"
				onEscape={() => {
					setPage("root");
				}}
				searchPrefix={["General", "Positions"]}
			>
				<CommandPalette.List heading="Positions">
					<CommandPalette.ListItem index={0}>
						Nothing here
					</CommandPalette.ListItem>
				</CommandPalette.List>
			</CommandPalette.Page>
		</CommandPalette>
	);
}

export { CommandPaletteShell };

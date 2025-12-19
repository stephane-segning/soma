import { useEffect, useMemo, useState } from "react";
import CommandPalette, {
	JsonStructure,
	filterItems,
	renderJsonStructure,
	useHandleOpenCommandPalette,
} from "react-cmdk";
import { useUiStore } from "../store/ui";

type Props = {
	onSendIpc: () => void;
};

function CommandPaletteShell({ onSendIpc }: Props): React.JSX.Element {
	const [selected, setSelected] = useState<number>(0);
	const [search, setSearch] = useState<string>("");
	const [page, setPage] = useState<"root" | "positions">("root");
	const { isCommandPaletteOpen, toggleCommandPalette } = useUiStore();

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
							<div className="w-full rounded-lg bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-400 p-4 border-t border-indigo-500 border-b border-indigo-500">
								<h2 className="text-lg font-semibold leading-tight text-white">
									Welcome 👋
								</h2>
								<p className="text-sm text-white/80 font-medium max-w-xs mt-1">
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
						children: "Send IPC ping",
						icon: "BoltIcon",
						id: "ipc-ping",
						onClick: onSendIpc,
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
		],
		[onSendIpc, toggleCommandPalette],
	);

	const rootItems = useMemo(() => filterItems(items, search), [items, search]);

	return (
		<CommandPalette
			onChangeSelected={setSelected}
			onChangeSearch={setSearch}
			onChangeOpen={handleOpenChange}
			selected={selected}
			search={search}
			isOpen={isCommandPaletteOpen}
			page={page}
			footer={
				<div className="px-4 py-3 text-sm text-neutral-500">
					Press{" "}
					<kbd className="px-1 py-0.5 rounded border border-neutral-400">
						⌘K
					</kbd>{" "}
					to toggle
				</div>
			}
		>
			<CommandPalette.Page id="root" searchPrefix={["General"]}>
				{rootItems.length ? (
					renderJsonStructure(rootItems)
				) : (
					<CommandPalette.FreeSearchAction
						href={`https://google.com/?q=${search}`}
						rel="noopener noreferrer"
						closeOnSelect={false}
						target="_blank"
					/>
				)}
			</CommandPalette.Page>

			<CommandPalette.Page
				searchPrefix={["General", "Positions"]}
				id="positions"
				onEscape={() => {
					setPage("root");
				}}
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

import { TabsBar } from "@soma/components/tabs-bar.tsx";
import { WindowControls } from "@soma/components/window-controls.tsx";
import { TabbedApp } from "@soma/routes/tabbed-app.tsx";

function App() {
	return (
		<main className="flex flex-col bg-base-200 text-base-content">
			<div className="grid-max-content relative grid h-[2.5] select-none">
				<div className="fixed inset-0" data-tauri-drag-region />
				<div className="flex h-10 items-center gap-4 px-4" id="app-title">
					<WindowControls />
					<div className="font-semibold text-base-content/70 text-sm uppercase">
						Soma
					</div>

					<TabsBar />
				</div>
			</div>

			<div className="no-scrollbar max-h-[calc(100vh-2.5rem)] overflow-auto px-2 pb-2">
				<div className="h-full">
					<TabbedApp />
				</div>
			</div>
		</main>
	);
}

export { App };

import { TabsBar } from "@soma/components/tabs-bar.tsx";
import { WindowControls } from "@soma/components/window-controls.tsx";
import { TabbedApp } from "@soma/routes/tabbed-app.tsx";

function App() {
	return (
		<main className="flex min-h-screen flex-col bg-base-100 text-base-content">
			<header
				className="grid-max-content relative grid h-10 select-none border-b border-base-300 bg-base-100/90 backdrop-blur"
				data-tauri-drag-region
			>
				<div className="flex h-full items-center gap-4 px-4" id="app-title">
					<div data-no-drag>
						<WindowControls />
					</div>
					<div className="font-semibold text-base-content/70 text-sm uppercase tracking-[0.08em]">
						Soma
					</div>

					<div className="flex-1" data-no-drag>
						<TabsBar />
					</div>
				</div>
			</header>

			<div className="no-scrollbar flex-1 overflow-hidden">
				<TabbedApp />
			</div>
		</main>
	);
}

export { App };

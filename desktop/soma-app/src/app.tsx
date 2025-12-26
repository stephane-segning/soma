import { TabsBar } from "@soma/components/tabs-bar.tsx";
import { WindowControls } from "@soma/components/window-controls.tsx";
import { TabbedApp } from "@soma/routes/tabbed-app.tsx";

function App() {
	return (
		<main className="flex min-h-screen flex-col bg-base-100 text-base-content">
			<header
				className="grid-max-content sticky top-0 z-40 grid h-12 select-none border-b border-base-300 bg-base-100/95 backdrop-blur"
				data-tauri-drag-region
			>
				<div className="flex h-full items-center gap-3 px-3" id="app-title">
					<div data-no-drag>
						<WindowControls />
					</div>
					<div className="font-semibold text-base-content/70 text-xs uppercase tracking-[0.12em]">
						Soma
					</div>

					<div className="flex-1 min-w-0" data-no-drag>
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

import { TabsBar } from "@soma/components/tabs-bar.tsx";
import { WindowControls } from "@soma/components/window-controls.tsx";
import { ChatSidebar } from "@soma/routes/chat-sidebar";
import { TabbedApp } from "@soma/routes/tabbed-app.tsx";

function App() {
	return (
		<main className="flex min-h-screen flex-col bg-base-100 text-base-content">
			<header
				className="grid-max-content sticky top-0 z-40 grid h-12 select-none border-base-300 border-b bg-base-100/95 backdrop-blur"
				data-tauri-drag-region
			>
				<div className="flex h-full items-center gap-3 px-3" id="app-title">
					<div data-no-drag>
						<WindowControls />
					</div>
					<div className="font-semibold text-base-content/70 text-xs uppercase tracking-[0.12em]">
						Soma
					</div>

					<div className="min-w-0 flex-1" data-no-drag>
						<TabsBar />
					</div>
				</div>
			</header>

			<div className="no-scrollbar flex-1 overflow-hidden">
				<div className="flex h-full w-full">
					<div className="flex min-w-0 flex-1 overflow-hidden bg-base-100">
						<TabbedApp />
					</div>
					<aside className="w-96 shrink-0 border-base-300 border-l bg-base-100">
						<div className="h-full overflow-y-auto">
							<ChatSidebar />
						</div>
					</aside>
				</div>
			</div>
		</main>
	);
}

export { App };

import { RouterListener } from "@app/components/router-listener";
import { SideMenu } from "@app/components/side/side-menu.tsx";
import { TabsBar } from "@app/components/tabs-bar.tsx";
import { WindowControls } from "@app/components/window-controls.tsx";
import { DesktopShell } from "@soma/ui/components/layout/desktop-shell";
import { lazy, Suspense } from "react";
import { Outlet } from "react-router";

const ChatSidebar = lazy(() =>
	import("@app/routes/chat-sidebar").then((m) => ({
		default: m.ChatSidebar,
	})),
);

const CommandPaletteShell = lazy(() =>
	import("@app/components/command-palette").then((m) => ({
		default: m.CommandPaletteShell,
	})),
);

function Component(): React.JSX.Element {
	return (
		<>
			<DesktopShell
				defaultRightOpen={false}
				header={(props) => (
					<>
						<header
							className="grid-max-content sticky top-0 z-40 grid h-12 select-none border-base-300 border-b bg-base-100/95 backdrop-blur"
							data-drag-region
						>
							<div className="flex h-full items-center gap-3 px-3" data-drag-region id="app-title">
								<div data-no-drag>
									<WindowControls />
								</div>
								<div
									className="font-semibold text-base-content/70 text-xs uppercase tracking-[0.12em]"
									data-drag-region
								>
									Soma
								</div>

								<div className="min-w-0 flex-1">
									<TabsBar {...props} />
								</div>
							</div>
						</header>
					</>
				)}
				leftColumn={<SideMenu />}
				mainClassName="bg-base-200/60 min-h-screen"
				rightColumn={
					<Suspense fallback={<div className="p-4 text-base-content/70 text-sm">Loading chat…</div>}>
						<div className="h-full min-h-full">
							<ChatSidebar />
						</div>
					</Suspense>
				}
				storageKey="soma.app-layout"
			>
				<Outlet />
			</DesktopShell>

			<Suspense fallback={null}>
				<CommandPaletteShell />
			</Suspense>

			<RouterListener />
		</>
	);
}

export { Component };

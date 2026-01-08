import { SideMenu } from "@soma/components/side/side-menu.tsx";
import { TabsBar } from "@soma/components/tabs-bar.tsx";
import { WindowControls } from "@soma/components/window-controls.tsx";
import { lazy, Suspense } from "react";
import { Outlet } from "react-router";
import { DesktopShell } from "soma-ui/components/layout/desktop-shell";

const ChatSidebar = lazy(() =>
	import("@soma/routes/chat-sidebar").then((m) => ({
		default: m.ChatSidebar,
	})),
);

const CommandPaletteShell = lazy(() =>
	import("@soma/components/command-palette").then((m) => ({
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
							data-tauri-drag-region
						>
							<div
								className="flex h-full items-center gap-3 px-3"
								id="app-title"
							>
								<div data-no-drag>
									<WindowControls />
								</div>
								<div
									className="font-semibold text-base-content/70 text-xs uppercase tracking-[0.12em]"
									data-tauri-drag-region
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
				rightColumn={
					<Suspense
						fallback={
							<div className="p-4 text-base-content/70 text-sm">
								Loading chat…
							</div>
						}
					>
						<div className="border-base-300 border-l p-3">
							<ChatSidebar />
						</div>
					</Suspense>
				}
				variant="flat"
			>
				<div className="min-h-full bg-base-100">
					<Outlet />
				</div>
			</DesktopShell>

			<Suspense fallback={null}>
				<CommandPaletteShell />
			</Suspense>
		</>
	);
}

export { Component };

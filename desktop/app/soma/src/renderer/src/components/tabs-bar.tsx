import { useTabsStore } from "@renderer/store/tabs";
import { cn } from "@renderer/lib/cn";
import { Plus, X } from "react-feather";

function TabsBar(): React.JSX.Element {
	const tabs = useTabsStore((s) => s.tabs);
	const activeId = useTabsStore((s) => s.activeId);
	const selectTab = useTabsStore((s) => s.selectTab);
	const openTab = useTabsStore((s) => s.openTab);
	const closeTab = useTabsStore((s) => s.closeTab);
	const atMaxTabs = tabs.length >= 10;

	return (
		<div className="flex min-w-0 flex-1 gap-4 items-center gap-2 [-webkit-app-region:no-drag] overflow-x-auto min-w-full no-scrollbar">
			<div className="tabs tabs-sm tabs-box gap-1 min-w-max">
				{tabs.map((tab) => {
					const isActive = tab.id === activeId;
					return (
						<div
							aria-selected={isActive}
							className={cn("tab shadow-none", isActive && "tab-active")}
							key={tab.id}
							onClick={() => selectTab(tab.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") selectTab(tab.id);
							}}
							role="tab"
							tabIndex={0}
						>
							<span className="min-w-0 flex-1 truncate pl-2">
								{tab.title}
							</span>
							<button
								aria-label="Close tab"
								className="btn btn-xs btn-circle ml-4 btn-soft"
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
								}}
								type="button"
							>
								<X className="size-3/4" />
							</button>
						</div>
					);
				})}
			</div>

			<button
				className="btn btn-soft btn-xs btn-circle btn-primary"
				disabled={atMaxTabs}
				onClick={() => openTab()}
				type="button"
			>
				<Plus className="size-4" />
			</button>
		</div>
	);
}

export { TabsBar };

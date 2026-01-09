import { cn } from "@soma/lib/cn";
import { useTabsStore } from "@soma/store/tabs";
import { List, MessageCircle, Plus, X } from "react-feather";
import { PolymorphButton } from "soma-ui/components/actions/polymorph-button";

type TabsBarProps = {
	leftOpen: boolean;
	rightOpen: boolean;
	toggleLeft: () => void;
	toggleRight: () => void;
	hasLeft: boolean;
	hasRight: boolean;
};

function TabsBar({
	hasLeft,
	hasRight,
	toggleLeft,
	toggleRight,
}: TabsBarProps): React.JSX.Element {
	const tabs = useTabsStore((s) => s.tabs);
	const activeId = useTabsStore((s) => s.activeId);
	const selectTab = useTabsStore((s) => s.selectTab);
	const openTab = useTabsStore((s) => s.openTab);
	const closeTab = useTabsStore((s) => s.closeTab);
	const atMaxTabs = tabs.length >= 10;

	return (
		<div className="flex min-w-0 items-center gap-2">
			<div className="flex items-center gap-1">
				{hasLeft && (
					<PolymorphButton
						className="btn-soft"
						onClick={toggleLeft}
						size="sm"
						type="button"
					>
						<List className="size-4" />
					</PolymorphButton>
				)}
			</div>

			<div
				className="no-scrollbar flex flex-1 items-center gap-2 overflow-x-auto"
				data-tauri-drag-region
			>
				{tabs.map((tab) => {
					const isActive = tab.id === activeId;
					return (
						<div
							aria-selected={isActive}
							className={cn(
								"flex min-w-[8rem] items-center gap-2 rounded-lg px-3 py-2 text-sm transition [-webkit-app-region:no-drag]",
								isActive
									? "bg-primary/10 text-primary"
									: "bg-base-200/60 text-base-content/70 hover:bg-base-200",
							)}
							key={tab.id}
							onClick={() => selectTab(tab.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") selectTab(tab.id);
							}}
							role="tab"
							tabIndex={0}
						>
							<span className="min-w-0 flex-1 truncate">{tab.title}</span>
							<button
								aria-label="Close tab"
								className="btn btn-ghost btn-xs btn-circle [-webkit-app-region:no-drag]"
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
								}}
								type="button"
							>
								<X className="size-4" />
							</button>
						</div>
					);
				})}
			</div>

			<div className="flex items-center gap-1">
				<PolymorphButton
					className="btn-soft"
					disabled={atMaxTabs}
					onClick={() => openTab()}
					size="sm"
					type="button"
				>
					<Plus className="size-4" />
				</PolymorphButton>

				{hasRight && (
					<PolymorphButton
						className="btn-soft"
						onClick={toggleRight}
						size="sm"
						type="button"
					>
						<MessageCircle className="size-4" />
					</PolymorphButton>
				)}
			</div>
		</div>
	);
}

export { TabsBar };

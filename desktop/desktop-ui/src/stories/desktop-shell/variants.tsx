import { useEffect, useState } from "react";
import { CheckCircle, Info, Sliders } from "react-feather";
import { DesktopShell } from "../../components/layout/desktop-shell";
import { Pill } from "../../components/primitives/pill";
import { StatusBadge } from "../../components/presence/status-badge";
import { InfoPanel, NavigationPanel, ShellHeader } from "./common";

export function SidebarRender() {
	return (
		<DesktopShell
			header={({ toggleLeft, toggleRight }) => (
				<ShellHeader
					title="Desktop Shell"
					toggleLeft={toggleLeft}
					toggleRight={toggleRight}
				/>
			)}
			leftColumn={<NavigationPanel />}
			rightColumn={
				<div className="space-y-3 p-3 text-sm">
					<p className="font-semibold text-base-content/80 text-xs uppercase tracking-wide">
						Status
					</p>
					<StatusBadge label="Online" tone="success" />
					<StatusBadge label="Syncing" tone="info" />
					<Pill dot tone="success">
						Connected
					</Pill>
					<div className="flex items-start gap-2 rounded-md bg-base-200 p-3 text-base-content/70 text-xs">
						<Info className="text-base-content/60" size={14} />
						<span>Use this shell as a structured layout for desktop views.</span>
					</div>
				</div>
			}
		>
			<ContentCard
				body="Use sidebars for navigation and status. Main content stays in the center column."
				title="Primary content"
			/>
		</DesktopShell>
	);
}

export function HeaderFooterRender() {
	return (
		<DesktopShell
			footer={
				<div className="flex items-center gap-3 border-base-300 border-t bg-base-100 px-3 py-2 text-base-content/80 text-sm">
					<CheckCircle className="text-success" size={16} />
					<span>All systems nominal. Last updated moments ago.</span>
				</div>
			}
			header={({ toggleLeft, toggleRight }) => (
				<ShellHeader
					title="Dashboard"
					toggleLeft={toggleLeft}
					toggleRight={toggleRight}
				/>
			)}
			leftColumn={<NavigationPanel />}
			rightColumn={
				<div className="m-2 flex items-center gap-2 rounded-md border border-base-300 bg-base-100 p-2 text-base-content/70 text-sm">
					<Sliders size={14} />
					<span>Resize with drag handle</span>
				</div>
			}
		>
			<ContentCard body="This variant shows how to add a header and footer while keeping the content area simple." />
		</DesktopShell>
	);
}

export function ScrollableRender() {
	const items = Array.from({ length: 30 }, (_, idx) => `Row ${idx + 1}`);
	return (
		<DesktopShell
			header={({ toggleLeft, toggleRight }) => (
				<ShellHeader
					title="Scrollable Main Area"
					toggleLeft={toggleLeft}
					toggleRight={toggleRight}
				/>
			)}
			leftColumn={<NavigationPanel count={100} />}
			rightColumn={<InfoPanel count={50} />}
		>
			<div className="space-y-2">
				{items.map((item) => (
					<ContentCard
						body={`${item} - filler content to demonstrate scrolling.`}
						key={item}
					/>
				))}
			</div>
		</DesktopShell>
	);
}

export function PersistentWidthsRender() {
	const [leftWidth, setLeftWidth] = usePersistedWidth(
		"desktop-shell-left",
		220,
	);
	const [rightWidth, setRightWidth] = usePersistedWidth(
		"desktop-shell-right",
		240,
	);
	return (
		<DesktopShell
			header={({ toggleLeft, toggleRight }) => (
				<ShellHeader
					title="Persistent widths"
					toggleLeft={toggleLeft}
					toggleRight={toggleRight}
				/>
			)}
			initialLeftWidth={leftWidth}
			initialRightWidth={rightWidth}
			leftColumn={<NavigationPanel />}
			onLeftResizeStop={setLeftWidth}
			onRightResizeStop={setRightWidth}
			rightColumn={<InfoPanel />}
		>
			<div className="space-y-2">
				{Array.from({ length: 12 }, (_, idx) => (
					<ContentCard
						body={`Content block ${idx + 1}`}
						key={`content-${idx}`}
					/>
				))}
			</div>
		</DesktopShell>
	);
}

function ContentCard({ body, title }: { body: string; title?: string }) {
	return (
		<div className="rounded-md border border-base-300 bg-base-100 p-4">
			{title ? <h2 className="font-semibold text-lg">{title}</h2> : null}
			<p className="text-base-content/70 text-sm">{body}</p>
		</div>
	);
}

function usePersistedWidth(key: string, fallback: number) {
	const [width, setWidth] = useState(() => {
		if (typeof window === "undefined") return fallback;
		const stored = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
		return Number.isFinite(stored) ? stored : fallback;
	});
	useEffect(() => {
		if (typeof window !== "undefined")
			window.localStorage.setItem(key, String(width));
	}, [key, width]);
	return [width, setWidth] as const;
}

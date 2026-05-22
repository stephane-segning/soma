/**
 * Flagship DesktopShell example — what the real Soma renderer looks
 * like once every primitive in @soma/ui is composed together.
 *
 * Demonstrates the **chip-bar + rail** model:
 *   - Two floating `PanelChipBar`s sit in main's top-left and
 *     top-right corners. They show icons for **collapsed** panels.
 *   - When a chip is clicked, the corresponding panel expands into
 *     its rail (left or right) and disappears from the chip bar.
 *   - When a panel's `−` button is clicked, the panel collapses
 *     back into the chip bar.
 *   - If every panel is collapsed, the rail unmounts entirely and
 *     main reclaims that width.
 *
 * Moving a panel from the left rail to the right rail (or vice-
 * versa) is a one-line shift between `LEFT_PANELS` and `RIGHT_PANELS`
 * at build time. There is no runtime drag-and-drop.
 *
 * Treat this story as the visual-regression canary for the whole
 * shell — if something looks off here, it's almost always off in the
 * actual renderer too.
 */
import { useCallback, useState } from "react";
import {
	Calendar,
	Clock,
	Cpu,
	FileText,
	Hash,
	List,
	MessageSquare,
	Plus,
	Search,
} from "react-feather";
import { BackendSwitcher } from "../../components/chat/backend-switcher";
import { DesktopShell } from "../../components/layout/desktop-shell";
import { type Bot, BotList } from "../../components/lists/bot-list";
import { PanelChipBar } from "../../components/panels/panel-chip-bar";
import {
	PanelContainer,
	type PanelDescriptor,
} from "../../components/panels/panel-container";
import { Kbd } from "../../components/primitives/kbd";
import { Pill } from "../../components/primitives/pill";

const PAGES: Array<{ id: string; title: string; emoji: string }> = [
	{ id: "p1", title: "Wave 3 cutover", emoji: "📦" },
	{ id: "p2", title: "Editor polish", emoji: "✍️" },
	{ id: "p3", title: "Membership semantics", emoji: "👥" },
	{ id: "p4", title: "Inline AI rollout", emoji: "✨" },
	{ id: "p5", title: "Tapia exam loop", emoji: "🎯" },
];

const BOTS: Bot[] = [
	{
		id: "b1",
		alias: "fetcher",
		peerId: "12D3KooWUvWxBh2VfRsK1Z9NwJaQYTbHnpGyzVxFq8sBQ",
		status: "active",
		lastAcked: "just now",
	},
	{
		id: "b2",
		alias: "indexer",
		peerId: "12D3KooWEfGhJk7QrSXyTmAo4n6PdZcXyqB1WjHfKL5Sr",
		status: "pending",
		lastAcked: "30s ago",
	},
	{
		id: "b3",
		alias: "keeper",
		peerId: "12D3KooWAbCdQpZ8jTvHrYsKqLmN9R3sXwYvB2hG7Kj1P",
		status: "failed",
		errorReason: "Signature rejected: capability expired",
		lastAcked: "5m ago",
	},
];

const BACKENDS = [
	{
		id: "ollama-llama3",
		name: "Ollama · llama3.3",
		meta: "http://127.0.0.1:11434",
		isDefault: true,
	},
	{
		id: "lmstudio-qwen",
		name: "LM Studio · qwen2.5",
		meta: "http://127.0.0.1:1234",
	},
	{
		id: "openai-gpt4o",
		name: "OpenAI · gpt-4o",
		meta: "https://api.openai.com",
	},
];

export function SomaAppRender() {
	const [activePage, setActivePage] = useState("p2");
	const [activeBackend, setActiveBackend] = useState(BACKENDS[0].id);

	// Build-time inventories — moving a panel between sides is just a
	// shift between these two arrays.
	const LEFT_PANELS: PanelDescriptor[] = [
		{
			id: "pages",
			title: "Pages",
			icon: <Hash className="size-3.5" />,
			actions: (
				<button
					aria-label="New page"
					className="grid size-5 place-items-center rounded text-base-content/55 hover:bg-base-200 hover:text-base-content"
					type="button"
				>
					<Plus className="size-3" />
				</button>
			),
			content: <PagesPanel activeId={activePage} onSelect={setActivePage} />,
		},
		{
			id: "outline",
			title: "Outline",
			icon: <List className="size-3.5" />,
			content: <OutlinePanel />,
		},
	];

	const RIGHT_PANELS: PanelDescriptor[] = [
		{
			id: "chat",
			title: "Chat",
			icon: <MessageSquare className="size-3.5" />,
			content: <ChatPanel />,
		},
		{
			id: "bots",
			title: "Bots",
			icon: <Cpu className="size-3.5" />,
			content: <BotList bots={BOTS} />,
		},
		{
			id: "history",
			title: "Page history",
			icon: <Clock className="size-3.5" />,
			content: <HistoryPanel />,
		},
		{
			id: "agenda",
			title: "Agenda",
			icon: <Calendar className="size-3.5" />,
			content: <AgendaPanel />,
		},
	];

	// Default-expanded state matches what a returning user would see:
	// Pages on the left, Chat on the right.
	const [leftExpanded, setLeftExpanded] = useState<Set<string>>(
		() => new Set(["pages"]),
	);
	const [rightExpanded, setRightExpanded] = useState<Set<string>>(
		() => new Set(["chat"]),
	);

	const toggleLeft = useCallback(
		(id: string) =>
			setLeftExpanded((prev) => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			}),
		[],
	);
	const collapseLeft = useCallback(
		(id: string) =>
			setLeftExpanded((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			}),
		[],
	);
	const toggleRight = useCallback(
		(id: string) =>
			setRightExpanded((prev) => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id);
				else next.add(id);
				return next;
			}),
		[],
	);
	const collapseRight = useCallback(
		(id: string) =>
			setRightExpanded((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			}),
		[],
	);

	const leftHasExpanded = leftExpanded.size > 0;
	const rightHasExpanded = rightExpanded.size > 0;

	return (
		<DesktopShell
			// Shell frame is tinted base-200 so the bg-base-100 cards float.
			className="bg-base-200"
			header={() => (
				<AppHeader
					activeBackend={activeBackend}
					onChangeBackend={setActiveBackend}
				/>
			)}
			initialLeftWidth={240}
			initialRightWidth={320}
			leftColumn={
				leftHasExpanded ? (
					<PanelContainer
						expandedIds={leftExpanded}
						onCollapse={collapseLeft}
						panels={LEFT_PANELS}
					/>
				) : null
			}
			mainClassName="bg-base-100"
			mainTopLeft={
				<PanelChipBar
					expandedIds={leftExpanded}
					onToggle={toggleLeft}
					panels={LEFT_PANELS}
					placement="top-left"
				/>
			}
			mainTopRight={
				<PanelChipBar
					expandedIds={rightExpanded}
					onToggle={toggleRight}
					panels={RIGHT_PANELS}
					placement="top-right"
				/>
			}
			rightColumn={
				rightHasExpanded ? (
					<PanelContainer
						expandedIds={rightExpanded}
						onCollapse={collapseRight}
						panels={RIGHT_PANELS}
					/>
				) : null
			}
		>
			<EditorMock
				title={PAGES.find((p) => p.id === activePage)?.title ?? "Untitled"}
			/>
		</DesktopShell>
	);
}

function AppHeader({
	activeBackend,
	onChangeBackend,
}: {
	activeBackend: string;
	onChangeBackend: (id: string) => void;
}) {
	return (
		<div className="flex items-center justify-between px-2 py-1">
			<div className="flex items-center gap-2">
				<span className="font-semibold text-sm">Soma</span>
				<span className="text-base-content/30 text-xs">·</span>
				<span className="text-base-content/70 text-xs">Workspace</span>
				<Pill dot tone="success">
					Local
				</Pill>
			</div>
			<div className="flex items-center gap-1">
				<button className="btn btn-ghost btn-xs gap-1" type="button">
					<Search size={12} />
					<span className="text-xs">Quick open</span>
					<Kbd size="xs">⌘+K</Kbd>
				</button>
				<BackendSwitcher
					activeId={activeBackend}
					backends={BACKENDS}
					onChange={onChangeBackend}
				/>
			</div>
		</div>
	);
}

function PagesPanel({
	activeId,
	onSelect,
}: {
	activeId: string;
	onSelect: (id: string) => void;
}) {
	return (
		<ul className="list list-dense bg-base-100">
			{PAGES.map((page) => (
				<li
					aria-selected={page.id === activeId}
					className={`cursor-pointer list-row hover:bg-base-200 ${
						page.id === activeId
							? "bg-base-200 font-medium text-base-content"
							: ""
					}`}
					key={page.id}
					onClick={() => onSelect(page.id)}
				>
					<span aria-hidden>{page.emoji}</span>
					<span className="list-col-grow truncate">{page.title}</span>
				</li>
			))}
		</ul>
	);
}

function OutlinePanel() {
	const headings = [
		{ level: 1, text: "Wave 3 cutover" },
		{ level: 2, text: "Capability ladder" },
		{ level: 2, text: "Rollback rehearsal" },
		{ level: 2, text: "Comms plan" },
	];
	return (
		<ul className="list list-dense bg-base-100">
			{headings.map((h, idx) => (
				<li className="list-row hover:bg-base-200" key={`${h.level}-${idx}`}>
					<span
						className="text-base-content/40 text-[10px]"
						style={{ paddingInlineStart: (h.level - 1) * 12 }}
					>
						H{h.level}
					</span>
					<span className="list-col-grow truncate">{h.text}</span>
				</li>
			))}
		</ul>
	);
}

function EditorMock({ title }: { title: string }) {
	return (
		<div className="mx-auto max-w-3xl px-8 py-10">
			<h1 className="mb-2 font-semibold text-3xl">{title}</h1>
			<p className="mb-6 text-base-content/60 text-xs">
				Last edited 3 min ago by you · saved locally
			</p>
			<p className="mb-4 text-sm leading-relaxed">
				This is a styled mock of the document surface. The real renderer drops
				<span className="mx-1 rounded bg-base-200 px-1.5 py-0.5 font-mono text-xs">
					@soma/editor
				</span>
				here, with the full Tiptap stack: slash menu, drag handle, format
				bubble, and language-aware code blocks. Visit the{" "}
				<span className="text-primary">Editor → DocumentEditor</span> story for
				the live version.
			</p>
			<p className="mb-6 text-sm leading-relaxed">
				The floating chip bars at the top-left and top-right of this column
				control the side rails. Click an icon to expand a panel into its rail
				(the rail will appear with its persisted width); click the{" "}
				<Kbd size="xs">−</Kbd> on a panel header to collapse it back into the
				chip bar.
			</p>

			<h2 className="mb-3 font-semibold text-lg">Tasks</h2>
			<ul className="mb-6 space-y-2 text-sm">
				<li className="flex items-start gap-2">
					<input
						checked
						className="checkbox checkbox-xs mt-0.5"
						readOnly
						type="checkbox"
					/>
					<span className="text-base-content/60 line-through">
						Pin slash menu to the `/` trigger
					</span>
				</li>
				<li className="flex items-start gap-2">
					<input
						checked
						className="checkbox checkbox-xs mt-0.5"
						readOnly
						type="checkbox"
					/>
					<span className="text-base-content/60 line-through">
						Wire UndoRedo so ⌘Z works
					</span>
				</li>
				<li className="flex items-start gap-2">
					<input className="checkbox checkbox-xs mt-0.5" readOnly type="checkbox" />
					<span>Add a kbd primitive everyone can use</span>
				</li>
			</ul>

			<pre className="not-prose overflow-x-auto rounded-md bg-neutral p-4 text-neutral-content text-xs">
				<code>{`<DesktopShell
  mainTopLeft={<PanelChipBar panels={leftPanels} expandedIds={…} />}
  mainTopRight={<PanelChipBar panels={rightPanels} expandedIds={…} />}
  leftColumn={left.size > 0 ? <PanelContainer …/> : null}
  rightColumn={right.size > 0 ? <PanelContainer …/> : null}
/>`}</code>
			</pre>
		</div>
	);
}

function ChatPanel() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 space-y-2 overflow-auto p-2 text-[13px]">
				<div className="space-y-0.5">
					<span className="font-medium text-[11px] text-base-content/60">
						You · 2m ago
					</span>
					<p className="text-base-content/80">
						Summarize this page in three bullets.
					</p>
				</div>
				<div className="space-y-0.5">
					<span className="font-medium text-[11px] text-primary">
						Assistant
					</span>
					<p className="text-base-content/80">
						Editor polish PR ships Cmd+K link insertion, the bright drop
						cursor, and a unified MenuShell primitive across slash / context /
						AI bar.
					</p>
				</div>
			</div>
			<div className="border-base-300 border-t p-2">
				<input
					className="input input-sm w-full"
					placeholder="Ask anything…"
					type="text"
				/>
			</div>
		</div>
	);
}

function HistoryPanel() {
	const entries = [
		{ label: "Edited heading", when: "3m ago" },
		{ label: "Inserted code block", when: "12m ago" },
		{ label: "Renamed page", when: "1h ago" },
		{ label: "Created page", when: "yesterday" },
	];
	return (
		<ul className="list list-dense bg-base-100">
			{entries.map((entry) => (
				<li className="list-row hover:bg-base-200" key={entry.label}>
					<FileText aria-hidden className="size-3.5 text-base-content/50" />
					<div className="list-col-grow leading-tight">
						<div>{entry.label}</div>
						<div className="text-[11px] text-base-content/55">{entry.when}</div>
					</div>
				</li>
			))}
		</ul>
	);
}

function AgendaPanel() {
	return (
		<ul className="list list-dense bg-base-100">
			{["Review Wave 3 PRs", "Plan Cutover 1", "Daily standup at 14:00"].map(
				(item) => (
					<li className="list-row hover:bg-base-200" key={item}>
						<span className="list-col-grow">{item}</span>
					</li>
				),
			)}
		</ul>
	);
}

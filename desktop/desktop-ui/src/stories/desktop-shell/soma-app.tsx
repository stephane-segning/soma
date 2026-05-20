/**
 * Flagship DesktopShell example — what the actual Soma renderer looks
 * like when every primitive in @soma/ui is composed together.
 *
 * The point of this story isn't to test DesktopShell in isolation
 * (the other variants do that with abstract content). It's to show
 * how the *real* app screen is assembled: pages list in the left
 * column, an editor-style document in the centre, a PanelContainer
 * with bots + history in the right column, daisy components carrying
 * the chrome.
 *
 * If something in this preview looks wrong it's almost always wrong
 * in the renderer too — treat this as the visual-regression canary
 * for the whole shell.
 */
import { useState } from "react";
import { Calendar, Clock, Cpu, FileText, MessageSquare, Search } from "react-feather";
import { DesktopShell } from "../../components/layout/desktop-shell";
import { BackendSwitcher } from "../../components/chat/backend-switcher";
import { BotList, type Bot } from "../../components/lists/bot-list";
import { PanelContainer, type PanelDescriptor } from "../../components/panels/panel-container";
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
	{ id: "ollama-llama3", name: "Ollama · llama3.3", meta: "http://127.0.0.1:11434", isDefault: true },
	{ id: "lmstudio-qwen", name: "LM Studio · qwen2.5", meta: "http://127.0.0.1:1234" },
	{ id: "openai-gpt4o", name: "OpenAI · gpt-4o", meta: "https://api.openai.com" },
];

export function SomaAppRender() {
	const [activePage, setActivePage] = useState("p2");
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["panel-agenda"]));
	const [activeBackend, setActiveBackend] = useState(BACKENDS[0].id);

	const panels: PanelDescriptor[] = [
		{
			id: "panel-chat",
			title: "Chat",
			icon: <MessageSquare className="size-3.5" />,
			content: <ChatPanel />,
		},
		{
			id: "panel-bots",
			title: "Bots",
			icon: <Cpu className="size-3.5" />,
			content: <BotList bots={BOTS} />,
		},
		{
			id: "panel-history",
			title: "Page history",
			icon: <Clock className="size-3.5" />,
			content: <HistoryPanel />,
		},
		{
			id: "panel-agenda",
			title: "Agenda",
			icon: <Calendar className="size-3.5" />,
			content: <AgendaPanel />,
		},
	];

	return (
		<DesktopShell
			header={() => <AppHeader activeBackend={activeBackend} onChangeBackend={setActiveBackend} />}
			rightColumn={
				<PanelContainer
					className="h-full"
					collapsedIds={collapsed}
					onToggleCollapse={(id) =>
						setCollapsed((prev) => {
							const next = new Set(prev);
							if (next.has(id)) next.delete(id);
							else next.add(id);
							return next;
						})
					}
					panels={panels}
				/>
			}
			initialLeftWidth={240}
			initialRightWidth={720}
			leftColumn={<Sidebar activePage={activePage} onSelect={setActivePage} />}
		>
			<EditorMock title={PAGES.find((p) => p.id === activePage)?.title ?? "Untitled"} />
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
		<div className="flex items-center justify-between border-base-300 border-b bg-base-100 px-3 py-2">
			<div className="flex items-center gap-3">
				<span className="font-semibold text-sm">Soma</span>
				<span className="text-base-content/40 text-xs">·</span>
				<span className="text-base-content/70 text-sm">Workspace</span>
				<Pill tone="success" dot>
					Local
				</Pill>
			</div>
			<div className="flex items-center gap-2">
				<button className="btn btn-ghost btn-sm gap-1" type="button">
					<Search size={14} />
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

function Sidebar({
	activePage,
	onSelect,
}: {
	activePage: string;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="flex h-full flex-col bg-base-100">
			<div className="flex items-center justify-between border-base-300 border-b px-3 py-2">
				<span className="font-semibold text-xs uppercase tracking-wide">Pages</span>
				<button className="btn btn-ghost btn-square btn-xs" type="button">
					+
				</button>
			</div>
			<ul className="list flex-1 bg-base-100">
				{PAGES.map((page) => (
					<li
						aria-selected={page.id === activePage}
						className={`list-row cursor-pointer hover:bg-base-200 ${
							page.id === activePage ? "bg-base-200" : ""
						}`}
						key={page.id}
						onClick={() => onSelect(page.id)}
					>
						<span aria-hidden>{page.emoji}</span>
						<span className="list-col-grow truncate text-sm">{page.title}</span>
					</li>
				))}
			</ul>
		</div>
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
				Keyboard shortcuts in @soma/ui render through the{" "}
				<Kbd size="xs">Kbd</Kbd> primitive, so chords like{" "}
				<Kbd size="xs">⌘+B</Kbd> for bold and <Kbd size="xs">⌘+⇧+K</Kbd> for
				the link prompt look identical wherever they appear.
			</p>

			<h2 className="mb-3 font-semibold text-lg">Tasks</h2>
			<ul className="mb-6 space-y-2 text-sm">
				<li className="flex items-start gap-2">
					<input checked className="checkbox checkbox-xs mt-0.5" readOnly type="checkbox" />
					<span className="text-base-content/60 line-through">
						Pin slash menu to the `/` trigger
					</span>
				</li>
				<li className="flex items-start gap-2">
					<input checked className="checkbox checkbox-xs mt-0.5" readOnly type="checkbox" />
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
				<code>{`// daisyUI list-row in DenseRow
<ul class="list bg-base-100">
  <li class="list-row">
    <span>📦</span>
    <span class="list-col-grow">Wave 3 cutover</span>
    <kbd class="kbd kbd-xs">⌘</kbd>
  </li>
</ul>`}</code>
			</pre>
		</div>
	);
}

function ChatPanel() {
	return (
		<div className="space-y-3 p-3 text-sm">
			<div>
				<span className="font-medium text-xs">You · 2m ago</span>
				<p className="text-base-content/80">Summarize this page in three bullets.</p>
			</div>
			<div>
				<span className="font-medium text-primary text-xs">Assistant</span>
				<p className="text-base-content/80">
					Editor polish PR ships Cmd+K link insertion, the bright drop cursor,
					and a unified MenuShell primitive across slash / context / AI bar.
				</p>
			</div>
			<input
				className="input input-sm w-full"
				placeholder="Ask anything…"
				type="text"
			/>
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
		<ul className="list bg-base-100">
			{entries.map((entry) => (
				<li className="list-row" key={entry.label}>
					<span aria-hidden>
						<FileText className="size-4 text-base-content/50" />
					</span>
					<div className="list-col-grow">
						<div className="text-sm">{entry.label}</div>
						<div className="text-base-content/60 text-xs">{entry.when}</div>
					</div>
				</li>
			))}
		</ul>
	);
}

function AgendaPanel() {
	return (
		<ul className="list bg-base-100">
			{["Review Wave 3 PRs", "Plan Cutover 1", "Daily standup at 14:00"].map((item) => (
				<li className="list-row" key={item}>
					<span className="list-col-grow text-sm">{item}</span>
				</li>
			))}
		</ul>
	);
}

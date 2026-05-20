import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";

import { CharDisplay } from "../components/tapia/char-display";
import { PopupShell } from "../components/popup/popup-shell";

const meta = {
	title: "Popup/PopupShell",
	parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const EXPECTED = "I love keyboards";

function TypingPopupDemo() {
	const [pinned, setPinned] = useState(false);
	const [typed, setTyped] = useState("I love k");
	const [log, setLog] = useState<string[]>([]);

	function record(action: string) {
		setLog((prev) => [action, ...prev].slice(0, 4));
	}

	const progress = Math.round((typed.length / EXPECTED.length) * 100);

	return (
		<div className="flex flex-col gap-2 text-xs">
			<div
				className="h-[360px] w-[520px] overflow-hidden rounded-md border border-base-300 shadow-elevated"
				style={{ minWidth: 480 }}
			>
				<PopupShell
					onClose={() => record("close")}
					onRestart={() => {
						setTyped("");
						record("restart");
					}}
					onReturnToMain={() => record("return-to-main")}
					onTogglePin={() => {
						setPinned((p) => !p);
						record(pinned ? "unpin" : "pin");
					}}
					pinned={pinned}
					progress={progress}
					title="Typing — bigram drill #5"
				>
					<div className="flex h-full flex-col items-center justify-center gap-6 p-6">
						<CharDisplay
							isGraphemes={Array.from(typed)}
							shouldGraphemes={Array.from(EXPECTED)}
						/>
						<label className="flex w-full max-w-xs flex-col gap-1 text-base-content/60 text-xs">
							<span>Type the phrase above to advance the bar.</span>
							<input
								autoFocus
								className="rounded-md border border-base-300 bg-base-100 px-2 py-1 font-mono text-sm outline-none focus-visible:border-primary"
								onChange={(event) => setTyped(event.target.value)}
								type="text"
								value={typed}
							/>
						</label>
					</div>
				</PopupShell>
			</div>
			<div className="rounded-md border border-base-300 bg-base-100 p-2 font-mono text-base-content/60">
				{log.length === 0 ? "No chrome actions yet." : log.join(" · ")}
				{" — pinned: "}
				<span className="text-base-content">{String(pinned)}</span>
			</div>
		</div>
	);
}

function MinimalDemo() {
	const [progress, setProgress] = useState(0);
	useEffect(() => {
		const t = setInterval(
			() => setProgress((p) => (p >= 100 ? 0 : p + 5)),
			280,
		);
		return () => clearInterval(t);
	}, []);
	return (
		<div
			className="h-[360px] w-[520px] overflow-hidden rounded-md border border-base-300 shadow-elevated"
			style={{ minWidth: 480 }}
		>
			<PopupShell
				onClose={() => undefined}
				progress={progress}
				title="Survey — onboarding feedback"
			>
				<div className="flex h-full flex-col items-center justify-center text-base-content/60 text-sm">
					Single-task popup with only the close button + progress.
				</div>
			</PopupShell>
		</div>
	);
}

export const TypingDrill: Story = {
	render: () => <TypingPopupDemo />,
};

export const MinimalNoOptionalGlyphs: Story = {
	render: () => <MinimalDemo />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => <TypingPopupDemo />,
};

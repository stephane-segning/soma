import { useEffect, useMemo, useState } from "react";

type FocusSnapshot = {
	atMs: number;
	reason: string;
	hasFocus: boolean;
	activeElement: string;
	selection: string;
	headlessUiFocusVisible: boolean;
};

function describeElement(el: Element | null): string {
	if (!el) return "<null>";

	const tag = el.tagName.toLowerCase();
	const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
	const className =
		(el as HTMLElement).className &&
		typeof (el as HTMLElement).className === "string"
			? `.${(el as HTMLElement).className
					.split(/\s+/)
					.filter(Boolean)
					.slice(0, 4)
					.join(".")}`
			: "";

	const role = el.getAttribute("role");
	const rolePart = role ? ` role=${role}` : "";
	const ce = el.getAttribute("contenteditable");
	const cePart = ce === null ? "" : ` contenteditable=${JSON.stringify(ce)}`;
	const tabIndex =
		(el as HTMLElement).tabIndex !== undefined
			? ` tabIndex=${(el as HTMLElement).tabIndex}`
			: "";

	return `${tag}${id}${className}${rolePart}${cePart}${tabIndex}`;
}

function describeSelection(): string {
	const sel = window.getSelection();
	if (!sel) return "none";
	return `rangeCount=${sel.rangeCount} isCollapsed=${sel.isCollapsed}`;
}

function takeSnapshot(reason: string): FocusSnapshot {
	return {
		atMs: Date.now(),
		reason,
		hasFocus: document.hasFocus(),
		activeElement: describeElement(document.activeElement),
		selection: describeSelection(),
		headlessUiFocusVisible: document.documentElement.hasAttribute(
			"data-headlessui-focus-visible",
		),
	};
}

function useDebugFocusEnabled(): boolean {
	return useMemo(() => {
		if (!import.meta.env.DEV) return false;
		try {
			return window.localStorage.getItem("soma:debugFocus") === "1";
		} catch {
			return false;
		}
	}, []);
}

function FocusDebugOverlay(): React.JSX.Element | null {
	const enabled = useDebugFocusEnabled();
	const [snapshots, setSnapshots] = useState<FocusSnapshot[]>([]);
	const [lastKey, setLastKey] = useState<string>("");

	useEffect(() => {
		if (!enabled) return;

		const push = (snapshot: FocusSnapshot) => {
			setSnapshots((prev) => [snapshot, ...prev].slice(0, 10));
		};

		const onFocusIn = () => push(takeSnapshot("focusin"));
		const onFocusOut = () => push(takeSnapshot("focusout"));
		const onSelectionChange = () => push(takeSnapshot("selectionchange"));

		const onKeyDownCapture = (event: KeyboardEvent) => {
			if (event.key !== "Enter") return;
			setLastKey(
				`capture key=${event.key} defaultPrevented=${event.defaultPrevented} target=${describeElement(
					event.target as Element | null,
				)}`,
			);
			push(takeSnapshot("keydown(capture) before"));
			queueMicrotask(() => push(takeSnapshot("keydown(capture) microtask")));
			requestAnimationFrame(() => push(takeSnapshot("keydown(capture) raf")));
		};

		const onKeyDownBubble = (event: KeyboardEvent) => {
			if (event.key !== "Enter") return;
			setLastKey(
				`bubble key=${event.key} defaultPrevented=${event.defaultPrevented} target=${describeElement(
					event.target as Element | null,
				)}`,
			);
			push(takeSnapshot("keydown(bubble) after"));
		};

		document.addEventListener("focusin", onFocusIn, true);
		document.addEventListener("focusout", onFocusOut, true);
		document.addEventListener("selectionchange", onSelectionChange);
		window.addEventListener("keydown", onKeyDownCapture, true);
		window.addEventListener("keydown", onKeyDownBubble, false);

		push(takeSnapshot("mounted"));

		return () => {
			document.removeEventListener("focusin", onFocusIn, true);
			document.removeEventListener("focusout", onFocusOut, true);
			document.removeEventListener("selectionchange", onSelectionChange);
			window.removeEventListener("keydown", onKeyDownCapture, true);
			window.removeEventListener("keydown", onKeyDownBubble, false);
		};
	}, [enabled]);

	if (!enabled) return null;

	const top = snapshots[0];
	return (
		<div className="pointer-events-none fixed right-3 bottom-3 z-[9999] w-[28rem] rounded-lg border border-base-300 bg-base-100/95 p-3 font-mono text-[11px] text-base-content shadow-lg">
			<div className="flex items-center justify-between">
				<div className="font-semibold">Focus debug</div>
				<div className="text-base-content/70">
					Disable: localStorage.setItem("soma:debugFocus","0") + reload
				</div>
			</div>
			{lastKey ? (
				<div className="mt-2 truncate text-base-content/80">{lastKey}</div>
			) : null}
			{top ? (
				<div className="mt-2 space-y-1">
					<div>
						<span className="text-base-content/70">reason</span>{" "}
						<span>{top.reason}</span>
					</div>
					<div>
						<span className="text-base-content/70">active</span>{" "}
						<span>{top.activeElement}</span>
					</div>
					<div>
						<span className="text-base-content/70">selection</span>{" "}
						<span>{top.selection}</span>
					</div>
					<div>
						<span className="text-base-content/70">doc.hasFocus</span>{" "}
						<span>{String(top.hasFocus)}</span>
					</div>
					<div>
						<span className="text-base-content/70">headlessui</span>{" "}
						<span>{String(top.headlessUiFocusVisible)}</span>
					</div>
				</div>
			) : null}
			{snapshots.length > 1 ? (
				<div className="mt-3 border-base-300 border-t pt-2 text-base-content/70">
					{snapshots.slice(0, 6).map((s) => (
						<div className="truncate" key={`${s.atMs}:${s.reason}`}>
							{new Date(s.atMs).toLocaleTimeString()} {s.reason} →{" "}
							{s.activeElement} ({s.selection})
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

export { FocusDebugOverlay };

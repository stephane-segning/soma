import { cn } from "@soma/ui/utils/cn";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { HelpCircle, Maximize2, Search } from "react-feather";
import type { SelectionSnapshot } from "./selection";
import type { QuickActionType } from "./types";

type QuickActionPanelProps = {
	resultText: string;
	resultTone: "default" | "error";
	runningAction: QuickActionType | null;
	selection: SelectionSnapshot;
	onRun: (action: QuickActionType) => void;
};

export function QuickActionPanel({ resultText, resultTone, runningAction, selection, onRun }: QuickActionPanelProps) {
	return (
		<motion.div
			animate={{ opacity: 1, y: 0, scale: 1 }}
			className="fixed z-50 w-[min(92vw,560px)] rounded-2xl border border-base-300 bg-base-100 p-4 shadow-2xl"
			exit={{ opacity: 0, y: 8, scale: 0.98 }}
			initial={{ opacity: 0, y: 12, scale: 0.98 }}
			style={{
				left: `clamp(16px, ${selection.anchor.x - 280}px, calc(100vw - 576px))`,
				top: `clamp(16px, ${selection.anchor.y}px, calc(100vh - 320px))`,
			}}
			transition={{ duration: 0.16 }}
		>
			<div className="line-clamp-4 rounded-lg bg-base-200 px-3 py-2 font-medium text-sm">{selection.text}</div>
			{!resultText ? <QuickActionList runningAction={runningAction} onRun={onRun} /> : null}
			{resultText ? (
				<div className={cn("mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm", resultTone === "error" ? "border-error/50 bg-error/10 text-error-content" : "border-base-300 bg-base-200")}>
					{resultText}
				</div>
			) : null}
		</motion.div>
	);
}

function QuickActionList({ runningAction, onRun }: { runningAction: QuickActionType | null; onRun: (action: QuickActionType) => void }) {
	return (
		<ul className="mt-3 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300">
			<QuickActionButton action="explain" icon={<HelpCircle className="size-4 text-base-content/70" />} label="Explain selection" runningAction={runningAction} runningLabel="Explaining..." onRun={onRun} />
			<QuickActionButton action="expand" icon={<Maximize2 className="size-4 text-base-content/70" />} label="Expand selection" runningAction={runningAction} runningLabel="Expanding..." onRun={onRun} />
			<QuickActionButton action="research" icon={<Search className="size-4 text-base-content/70" />} label="Research selection" runningAction={runningAction} runningLabel="Researching..." onRun={onRun} />
		</ul>
	);
}

function QuickActionButton({ action, icon, label, runningAction, runningLabel, onRun }: { action: QuickActionType; icon: ReactNode; label: string; runningAction: QuickActionType | null; runningLabel: string; onRun: (action: QuickActionType) => void }) {
	return (
		<li>
			<button type="button" className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-base-200", runningAction !== null && "cursor-not-allowed opacity-60")} disabled={runningAction !== null} onClick={() => onRun(action)}>
				<span>{runningAction === action ? runningLabel : label}</span>
				{icon}
			</button>
		</li>
	);
}

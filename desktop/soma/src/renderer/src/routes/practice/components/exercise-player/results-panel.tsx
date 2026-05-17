import type { ReactNode } from "react";
import { Stat } from "./stats-bar";

type ResultsPanelProps = {
	accuracy: number;
	children?: ReactNode;
	elapsedMs: number;
	isSaving: boolean;
	onReset: () => void;
	saveError: string | null;
	t: (key: string) => string;
	wpm: number;
};

export function ResultsPanel({
	accuracy,
	children,
	elapsedMs,
	isSaving,
	onReset,
	saveError,
	t,
	wpm,
}: ResultsPanelProps) {
	return (
		<div className="practice-player__results">
			<div className="practice-player__results-head">
				<div>
					<div className="practice-eyebrow">{t("practice.sessionComplete")}</div>
					<h2>{t("practice.currentRun")}</h2>
				</div>
				<button className="practice-ghost-button" onClick={onReset} type="button">
					{t("practice.retryPassage")}
				</button>
			</div>
			<div className="practice-player__results-grid">
				<Stat label={t("practice.wpm")} value={wpm.toFixed(2)} />
				<Stat label={t("practice.accuracy")} value={`${accuracy.toFixed(0)}%`} />
				<Stat label={t("practice.duration")} value={`${Math.round(elapsedMs / 1000)}s`} />
			</div>
			<div className="practice-player__save-state practice-muted">
				{isSaving
					? t("practice.saving")
					: saveError
						? `${t("practice.saveFailed")}: ${saveError}`
						: t("practice.saved")}
			</div>
			{children}
		</div>
	);
}

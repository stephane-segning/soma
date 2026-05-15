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
		<div className="player__results">
			<div className="player__results-head">
				<div>
					<div className="eyebrow">{t("sessionComplete")}</div>
					<h2>{t("currentRun")}</h2>
				</div>
				<button className="ghost-button" onClick={onReset} type="button">
					{t("retryPassage")}
				</button>
			</div>
			<div className="player__results-grid">
				<Stat label={t("wpm")} value={wpm.toFixed(2)} />
				<Stat label={t("accuracy")} value={`${accuracy.toFixed(0)}%`} />
				<Stat label={t("duration")} value={`${Math.round(elapsedMs / 1000)}s`} />
			</div>
			<div className="player__save-state muted">
				{isSaving ? t("saving") : saveError ? `${t("saveFailed")}: ${saveError}` : t("saved")}
			</div>
			{children}
		</div>
	);
}

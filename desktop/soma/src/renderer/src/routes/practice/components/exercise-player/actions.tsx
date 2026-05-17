import { cn } from "@app/lib/cn";

type PlayerActionsProps = {
	nextChar?: string;
	onReset: () => void;
	t: (key: string) => string;
};

export function PlayerActions({ nextChar, onReset, t }: PlayerActionsProps) {
	return (
		<div className="practice-player__actions">
			<div className="practice-expected-key">
				<span className="practice-stat-label">{t("practice.expectedKey")}</span>
				<span className={cn("practice-pill", "practice-pill--ghost")}>{nextChar ? nextChar : "done"}</span>
			</div>
			<button className="practice-ghost-button" onClick={onReset} type="button">
				{t("practice.reset")}
			</button>
		</div>
	);
}

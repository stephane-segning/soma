import { cn } from "../../lib/cn";

type PlayerActionsProps = {
	nextChar?: string;
	onReset: () => void;
	t: (key: string) => string;
};

export function PlayerActions({ nextChar, onReset, t }: PlayerActionsProps) {
	return (
		<div className="player__actions">
			<div className="expected-key">
				<span className="stat-label">{t("expectedKey")}</span>
				<span className={cn("pill", "pill--ghost")}>
					{nextChar ? nextChar : "done"}
				</span>
			</div>
			<button className="ghost-button" onClick={onReset} type="button">
				{t("reset")}
			</button>
		</div>
	);
}

import type { LeaderboardEntry } from "../../../../shared/exercise";

type LeaderboardSummaryProps = {
	results: LeaderboardEntry[];
	t: (key: string) => string;
};

export function LeaderboardSummary({ results, t }: LeaderboardSummaryProps) {
	if (results.length === 0) return null;

	return (
		<div className="player__leaderboard">
			<div className="stat-label">{t("topResults")}</div>
			<div className="player__leaderboard-list">
				{results.map((entry, index) => (
					<div
						className="player__leaderboard-row"
						key={`${entry.completedAtMs}-${index}`}
					>
						<span>#{index + 1}</span>
						<span>{entry.wpm.toFixed(2)} WPM</span>
						<span>{Math.round(entry.accuracy)}%</span>
					</div>
				))}
			</div>
		</div>
	);
}

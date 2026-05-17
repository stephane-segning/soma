import type { LeaderboardEntry } from "@shared/practice";

type LeaderboardSummaryProps = {
	results: LeaderboardEntry[];
	t: (key: string) => string;
};

export function LeaderboardSummary({ results, t }: LeaderboardSummaryProps) {
	if (results.length === 0) return null;

	return (
		<div className="practice-player__leaderboard">
			<div className="practice-stat-label">{t("practice.topResults")}</div>
			<div className="practice-player__leaderboard-list">
				{results.map((entry, index) => (
					<div className="practice-player__leaderboard-row" key={`${entry.completedAtMs}-${index}`}>
						<span>#{index + 1}</span>
						<span>{entry.wpm.toFixed(2)} WPM</span>
						<span>{Math.round(entry.accuracy)}%</span>
					</div>
				))}
			</div>
		</div>
	);
}

type StatsBarProps = {
	accuracy: number;
	progress: number;
	t: (key: string) => string;
	wpm: number;
};

export function StatsBar({ accuracy, progress, t, wpm }: StatsBarProps) {
	return (
		<>
			<div className="practice-player__bar">
				<div className="practice-progress" style={{ width: `${progress * 100}%` }} />
			</div>
			<div className="practice-player__stats">
				<Stat label={t("practice.wpm")} value={wpm.toFixed(2)} />
				<Stat label={t("practice.accuracy")} value={`${accuracy.toFixed(0)}%`} />
				<Stat label={t("practice.progress")} value={`${Math.round(progress * 100)}%`} />
			</div>
		</>
	);
}

export function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<span className="practice-stat-label">{label}</span>
			<span className="practice-stat-value">{value}</span>
		</div>
	);
}

type StatsBarProps = {
	accuracy: number;
	progress: number;
	t: (key: string) => string;
	wpm: number;
};

export function StatsBar({ accuracy, progress, t, wpm }: StatsBarProps) {
	return (
		<>
			<div className="player__bar">
				<div className="progress" style={{ width: `${progress * 100}%` }} />
			</div>
			<div className="player__stats">
				<Stat label={t("wpm")} value={wpm.toFixed(2)} />
				<Stat label={t("accuracy")} value={`${accuracy.toFixed(0)}%`} />
				<Stat label={t("progress")} value={`${Math.round(progress * 100)}%`} />
			</div>
		</>
	);
}

export function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<span className="stat-label">{label}</span>
			<span className="stat-value">{value}</span>
		</div>
	);
}

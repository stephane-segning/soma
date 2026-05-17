import type { Exercise, ExerciseAttempt, LeaderboardEntry } from "@shared/practice";
import { useTranslation } from "react-i18next";
import { Keyboard } from "../keyboard";
import { PlayerActions } from "./actions";
import { LeaderboardSummary } from "./leaderboard-summary";
import { PromptView } from "./prompt-view";
import { ResultsPanel } from "./results-panel";
import { StatsBar } from "./stats-bar";
import { firstMismatchIndex, useExerciseRun } from "./use-exercise-run";

type ExercisePlayerProps = {
	exercise: Exercise;
	leaderboard?: LeaderboardEntry[];
	onComplete?: (attempt: ExerciseAttempt) => Promise<LeaderboardEntry[] | void> | LeaderboardEntry[] | void;
};

function ExercisePlayer({ exercise, leaderboard = [], onComplete }: ExercisePlayerProps): React.JSX.Element {
	const { t } = useTranslation("common");
	const run = useExerciseRun({ exercise, onComplete });
	const topResults = leaderboard.slice(0, 3);

	return (
		<div className="practice-player">
			<StatsBar accuracy={run.accuracy} progress={run.progress} t={t} wpm={run.wpm} />
			<PromptView segments={run.promptSegments} />
			<label className="practice-player__input">
				<span className="practice-stat-label">{t("practice.typeHere")}</span>
				<textarea
					onChange={(event) => run.updateInput(event.target.value)}
					onFocus={run.markStarted}
					placeholder={exercise.message.slice(0, 64)}
					rows={4}
					value={run.input}
				/>
			</label>
			{run.hasMismatch ? (
				<div className="practice-player__hint">Fix the highlighted character, then keep going.</div>
			) : null}
			<PlayerActions nextChar={run.nextChar} onReset={run.reset} t={t} />
			{run.completedAt ? (
				<ResultsPanel
					accuracy={run.accuracy}
					elapsedMs={run.elapsedMs}
					isSaving={run.isSaving}
					onReset={run.reset}
					saveError={run.saveError}
					t={t}
					wpm={run.wpm}
				>
					<LeaderboardSummary results={topResults} t={t} />
				</ResultsPanel>
			) : null}
			<Keyboard expectedKey={run.nextChar} lastKey={run.lastKey} />
		</div>
	);
}

export { ExercisePlayer, firstMismatchIndex };

import { useTranslation } from "react-i18next";
import type {
	Exercise,
	ExerciseAttempt,
	LeaderboardEntry,
} from "../../../shared/exercise";
import { PlayerActions } from "./exercise-player/actions";
import { LeaderboardSummary } from "./exercise-player/leaderboard-summary";
import { PromptView } from "./exercise-player/prompt-view";
import { ResultsPanel } from "./exercise-player/results-panel";
import { StatsBar } from "./exercise-player/stats-bar";
import {
	firstMismatchIndex,
	useExerciseRun,
} from "./exercise-player/use-exercise-run";
import { Keyboard } from "./keyboard";

type ExercisePlayerProps = {
	exercise: Exercise;
	leaderboard?: LeaderboardEntry[];
	onComplete?: (
		attempt: ExerciseAttempt,
	) => Promise<LeaderboardEntry[] | void> | LeaderboardEntry[] | void;
};

function ExercisePlayer({
	exercise,
	leaderboard = [],
	onComplete,
}: ExercisePlayerProps): React.JSX.Element {
	const { t } = useTranslation();
	const run = useExerciseRun({ exercise, onComplete });
	const topResults = leaderboard.slice(0, 3);

	return (
		<div className="player">
			<StatsBar
				accuracy={run.accuracy}
				progress={run.progress}
				t={t}
				wpm={run.wpm}
			/>
			<PromptView segments={run.promptSegments} />
			<label className="player__input">
				<span className="stat-label">{t("typeHere")}</span>
				<textarea
					onChange={(event) => run.updateInput(event.target.value)}
					onFocus={run.markStarted}
					placeholder={exercise.message.slice(0, 64)}
					rows={4}
					value={run.input}
				/>
			</label>
			{run.hasMismatch ? (
				<div className="player__hint">
					Fix the highlighted character, then keep going.
				</div>
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

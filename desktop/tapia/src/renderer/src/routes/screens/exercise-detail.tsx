import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import type {
	ExerciseAttempt,
	LeaderboardEntry,
} from "../../../../shared/exercise";
import { useAppLayoutContext } from "../../app";
import { ExercisePlayer } from "../../components/exercise-player";
import { useExercises } from "../../hooks/useExercises";

function ExerciseDetail(): React.JSX.Element {
	const { t } = useTranslation();
	const params = useParams();
	const { activeSpaceId } = useAppLayoutContext();
	const { exercises, status, recordSession, findExercise } =
		useExercises(activeSpaceId);
	const [recentLeaderboard, setRecentLeaderboard] = useState<
		LeaderboardEntry[]
	>([]);

	const exercise = useMemo(
		() =>
			findExercise(params.exerciseId) ??
			exercises.find((item) => item.meta.id === params.exerciseId),
		[exercises, findExercise, params.exerciseId],
	);

	const onComplete = useCallback(
		async (attempt: ExerciseAttempt) => {
			if (!exercise) return;
			const leaderboard = await recordSession({
				exerciseId: exercise.meta.id,
				spaceId: exercise.meta.spaceId,
				wpm: attempt.wpm,
				accuracy: attempt.accuracy,
				durationMs: attempt.durationMs,
				completedAtMs: Date.now(),
			});
			setRecentLeaderboard(leaderboard);
			return leaderboard;
		},
		[exercise, recordSession],
	);

	if (status === "loading") {
		return (
			<section className="panel">
				<p className="muted">{t("loading")}</p>
			</section>
		);
	}

	if (!exercise) {
		return (
			<section className="panel">
				<p className="muted">Missing exercise.</p>
				<Link
					className="ghost-button"
					to={`/spaces/${params.spaceId}/exercises`}
				>
					{t("backToPractice")}
				</Link>
			</section>
		);
	}

	return (
		<section className="panel">
			<div className="panel__head">
				<div>
					<p className="eyebrow">{t("typingSession")}</p>
					<h1>{exercise.meta.topic ?? t("readyToType")}</h1>
					<p className="muted">
						{exercise.meta.length} {t("characters")} ·{" "}
						{exercise.meta.difficulty}
					</p>
					<p className="muted">{t("practiceHint")}</p>
				</div>
				<Link
					className="ghost-button"
					to={`/spaces/${exercise.meta.spaceId}/exercises`}
				>
					{t("backToPractice")}
				</Link>
			</div>

			<ExercisePlayer
				exercise={exercise}
				leaderboard={recentLeaderboard}
				onComplete={onComplete}
			/>
		</section>
	);
}

export default ExerciseDetail;

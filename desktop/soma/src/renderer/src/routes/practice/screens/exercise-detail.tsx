import { usePracticeExercisesQuery, useRecordPracticeSessionMutation } from "@app/queries/practice";
import type { ExerciseAttempt, LeaderboardEntry } from "@shared/practice";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ExercisePlayer } from "../components/exercise-player";
import { usePracticeLayoutContext } from "../layout";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const params = useParams();
	const { activeSpaceId } = usePracticeLayoutContext();
	const exercisesQuery = usePracticeExercisesQuery(activeSpaceId);
	const recordSession = useRecordPracticeSessionMutation();
	const [recentLeaderboard, setRecentLeaderboard] = useState<LeaderboardEntry[]>([]);

	const exercises = exercisesQuery.data ?? [];
	const exercise = useMemo(
		() => exercises.find((item) => item.meta.id === params.exerciseId),
		[exercises, params.exerciseId],
	);

	const onComplete = useCallback(
		async (attempt: ExerciseAttempt) => {
			if (!exercise) return;
			const leaderboard = await recordSession.mutateAsync({
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

	if (exercisesQuery.isLoading) {
		return (
			<section className="practice-panel">
				<p className="practice-muted">{t("practice.loading")}</p>
			</section>
		);
	}

	if (!exercise) {
		return (
			<section className="practice-panel">
				<p className="practice-muted">Missing exercise.</p>
				<Link className="practice-ghost-button" to={`/practice/spaces/${params.spaceId}/exercises`}>
					{t("practice.backToPractice")}
				</Link>
			</section>
		);
	}

	return (
		<section className="practice-panel">
			<div className="practice-panel__head">
				<div>
					<p className="practice-eyebrow">{t("practice.typingSession")}</p>
					<h1>{exercise.meta.topic ?? t("practice.readyToType")}</h1>
					<p className="practice-muted">
						{exercise.meta.length} {t("practice.characters")} · {exercise.meta.difficulty}
					</p>
					<p className="practice-muted">{t("practice.practiceHint")}</p>
				</div>
				<Link className="practice-ghost-button" to={`/practice/spaces/${exercise.meta.spaceId}/exercises`}>
					{t("practice.backToPractice")}
				</Link>
			</div>

			<ExercisePlayer exercise={exercise} leaderboard={recentLeaderboard} onComplete={onComplete} />
		</section>
	);
}

export { Component };

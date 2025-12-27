import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import type { ExerciseAttempt } from "../../../../shared/exercise";
import { useAppLayoutContext } from "../../App";
import { ExercisePlayer } from "../../components/exercise-player";
import { useExercises } from "../../hooks/useExercises";

function ExerciseDetail(): React.JSX.Element {
	const { t } = useTranslation();
	const params = useParams();
	const { activeSpaceId } = useAppLayoutContext();
	const { exercises, status, recordSession, findExercise } =
		useExercises(activeSpaceId);

	const exercise = useMemo(
		() =>
			findExercise(params.exerciseId) ??
			exercises.find((item) => item.meta.id === params.exerciseId),
		[exercises, findExercise, params.exerciseId],
	);

	const onComplete = useCallback(
		async (attempt: ExerciseAttempt) => {
			if (!exercise) return;
			await recordSession({
				exerciseId: exercise.meta.id,
				spaceId: exercise.meta.spaceId,
				wpm: attempt.wpm,
				accuracy: attempt.accuracy,
				durationMs: attempt.durationMs,
				completedAtMs: Date.now(),
			});
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
					{t("exercises")}
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
				</div>
				<Link
					className="ghost-button"
					to={`/spaces/${exercise.meta.spaceId}/exercises`}
				>
					{t("exercises")}
				</Link>
			</div>

			<ExercisePlayer exercise={exercise} onComplete={onComplete} />
		</section>
	);
}

export default ExerciseDetail;

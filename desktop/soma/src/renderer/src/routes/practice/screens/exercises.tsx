import { cn } from "@app/lib/cn";
import { useGeneratePracticeExerciseMutation, usePracticeExercisesQuery } from "@app/queries/practice";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseCard } from "../components/exercise-card";
import { usePracticeLayoutContext } from "../layout";

function Component(): React.JSX.Element {
	const { t } = useTranslation("common");
	const { activeSpaceId } = usePracticeLayoutContext();
	const exercisesQuery = usePracticeExercisesQuery(activeSpaceId);
	const generate = useGeneratePracticeExerciseMutation();

	const exercises = exercisesQuery.data ?? [];
	const sorted = useMemo(() => [...exercises].sort((a, b) => b.meta.createdAtMs - a.meta.createdAtMs), [exercises]);

	const onGenerate = async (): Promise<void> => {
		await generate.mutateAsync({ spaceId: activeSpaceId });
	};

	const isGenerating = generate.isLoading;
	const isLoading = exercisesQuery.isLoading;
	const isError = exercisesQuery.isError;
	const isReady = !isLoading && !isError;

	return (
		<section className="practice-panel">
			<div className="practice-panel__head">
				<div>
					<p className="practice-eyebrow">{t("practice.spaces")}</p>
					<h1>{t("practice.exercises")}</h1>
					<p className="practice-muted">{t("practice.agentHint")}</p>
					<p className="practice-muted">{t("practice.practiceHint")}</p>
				</div>
				<button
					className={cn("practice-primary-button", isGenerating && "is-loading")}
					onClick={() => void onGenerate()}
					type="button"
				>
					{isGenerating ? t("practice.prompting") : t("practice.newExercise")}
				</button>
			</div>

			{isLoading ? <p className="practice-muted">{t("practice.loading")}</p> : null}
			{isError ? <p className="practice-error">{t("practice.errorLoading")}</p> : null}
			{isReady && sorted.length === 0 ? (
				<div className="practice-empty">
					<p className="practice-muted">{t("practice.noExercises")}</p>
					<button className="practice-ghost-button" onClick={() => void onGenerate()} type="button">
						{t("practice.newExercise")}
					</button>
				</div>
			) : null}

			<div className="practice-grid">
				{sorted.map((exercise) => (
					<ExerciseCard
						exercise={exercise}
						href={`/practice/spaces/${exercise.meta.spaceId}/exercises/${exercise.meta.id}`}
						key={exercise.cid}
					/>
				))}
			</div>
		</section>
	);
}

export { Component };

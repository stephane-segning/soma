import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppLayoutContext } from "../../app";
import { ExerciseCard } from "../../components/exercise-card";
import { useExercises } from "../../hooks/useExercises";
import { cn } from "../../lib/cn";

function Exercises(): React.JSX.Element {
	const { t } = useTranslation();
	const { activeSpaceId } = useAppLayoutContext();
	const { exercises, status, createFromAgent } = useExercises(activeSpaceId);
	const [isGenerating, setIsGenerating] = useState(false);

	const sorted = useMemo(
		() =>
			[...exercises].sort((a, b) => b.meta.createdAtMs - a.meta.createdAtMs),
		[exercises],
	);

	const onGenerate = async (): Promise<void> => {
		setIsGenerating(true);
		try {
			await createFromAgent();
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<section className="panel">
			<div className="panel__head">
				<div>
					<p className="eyebrow">{t("spaces")}</p>
					<h1>{t("exercises")}</h1>
					<p className="muted">{t("agentHint")}</p>
				</div>
				<button
					className={cn("primary-button", isGenerating && "is-loading")}
					onClick={() => void onGenerate()}
				>
					{isGenerating ? t("prompting") : t("newExercise")}
				</button>
			</div>

			{status === "loading" ? <p className="muted">{t("loading")}</p> : null}
			{status === "error" ? <p className="error">{t("errorLoading")}</p> : null}
			{status === "ready" && sorted.length === 0 ? (
				<div className="empty">
					<p className="muted">{t("noExercises")}</p>
					<button
						className="ghost-button"
						onClick={() => void onGenerate()}
						type="button"
					>
						{t("newExercise")}
					</button>
				</div>
			) : null}

			<div className="grid">
				{sorted.map((exercise) => (
					<ExerciseCard
						exercise={exercise}
						href={`/spaces/${exercise.meta.spaceId}/exercises/${exercise.meta.id}`}
						key={exercise.cid}
					/>
				))}
			</div>
		</section>
	);
}

export default Exercises;

import { Link } from "react-router";
import type { Exercise } from "../../../shared/exercise";
import { cn } from "../lib/cn";

type ExerciseCardProps = {
	exercise: Exercise;
	href: string;
};

function ExerciseCard({
	exercise,
	href,
}: ExerciseCardProps): React.JSX.Element {
	return (
		<article className="exercise-card">
			<header className="exercise-card__head">
				<div className="pill">{exercise.meta.difficulty}</div>
				{exercise.meta.topic ? (
					<div className="pill pill--ghost">{exercise.meta.topic}</div>
				) : null}
				<div className="pill pill--ghost">{exercise.meta.length} chars</div>
			</header>
			<p className="exercise-card__message">{exercise.message}</p>
			<p className="muted">Type exactly what you see, then review your speed and accuracy.</p>
			<footer className="exercise-card__foot">
				<div className="exercise-card__meta">
					<span className="dot" />
					<span>{new Date(exercise.meta.createdAtMs).toLocaleString()}</span>
				</div>
				<Link className={cn("ghost-button")} to={href}>
					Practice
				</Link>
			</footer>
		</article>
	);
}

export { ExerciseCard };

import { cn } from "@app/lib/cn";
import type { Exercise } from "@shared/practice";
import { Link } from "react-router";

type ExerciseCardProps = {
	exercise: Exercise;
	href: string;
};

function ExerciseCard({ exercise, href }: ExerciseCardProps): React.JSX.Element {
	return (
		<article className="practice-exercise-card">
			<header className="practice-exercise-card__head">
				<div className="practice-pill">{exercise.meta.difficulty}</div>
				{exercise.meta.topic ? <div className="practice-pill practice-pill--ghost">{exercise.meta.topic}</div> : null}
				<div className="practice-pill practice-pill--ghost">{exercise.meta.length} chars</div>
			</header>
			<p className="practice-exercise-card__message">{exercise.message}</p>
			<p className="practice-muted">Type exactly what you see, then review your speed and accuracy.</p>
			<footer className="practice-exercise-card__foot">
				<div className="practice-exercise-card__meta">
					<span className="practice-dot" />
					<span>{new Date(exercise.meta.createdAtMs).toLocaleString()}</span>
				</div>
				<Link className={cn("practice-ghost-button")} to={href}>
					Practice
				</Link>
			</footer>
		</article>
	);
}

export { ExerciseCard };

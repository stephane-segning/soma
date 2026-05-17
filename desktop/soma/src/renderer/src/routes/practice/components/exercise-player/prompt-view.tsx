type PromptSegments = {
	completed: string;
	current: string;
	remaining: string;
};

export function PromptView({ segments }: { segments: PromptSegments }) {
	return (
		<div className="practice-player__prompt">
			<p className="practice-player__message">
				<span className="practice-player__done">{segments.completed}</span>
				{segments.current ? <span className="practice-player__current">{segments.current}</span> : null}
				<span className="practice-player__remaining">{segments.remaining}</span>
			</p>
		</div>
	);
}

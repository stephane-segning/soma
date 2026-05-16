type PromptSegments = {
	completed: string;
	current: string;
	remaining: string;
};

export function PromptView({ segments }: { segments: PromptSegments }) {
	return (
		<div className="player__prompt">
			<p className="player__message">
				<span className="player__done">{segments.completed}</span>
				{segments.current ? (
					<span className="player__current">{segments.current}</span>
				) : null}
				<span className="player__remaining">{segments.remaining}</span>
			</p>
		</div>
	);
}

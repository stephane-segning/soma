type EmptyImageStateProps = {
	error?: string;
	onDelete: () => void;
};

export function EmptyImageState({ error, onDelete }: EmptyImageStateProps) {
	if (error) {
		return (
			<div className="flex items-center justify-between gap-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm">
				<div>
					<div className="font-medium">Couldn't save this image on this device</div>
					<div className="text-base-content/70 text-xs">{error}</div>
				</div>
				<button className="btn btn-ghost btn-xs" onClick={onDelete} type="button">
					Remove
				</button>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content/60">
			Saving image to this device...
		</div>
	);
}

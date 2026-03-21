import { useJoinSpaceMutation } from "@app/queries/spaces";
import { useState } from "react";
import { Link } from "react-router";
import { parseMultiaddrs, validateJoinDraft, type JoinDraft } from "./join-request-utils";

function JoinRequestPanel(): React.JSX.Element {
	const { mutateAsync: joinSpaceAsync, isLoading: isJoiningSpace } = useJoinSpaceMutation();
	const [joinDraft, setJoinDraft] = useState<JoinDraft>({
		spaceId: "",
		targetPeerId: "",
		targetMultiaddrs: "",
		displayName: "",
		deviceName: "",
	});
	const [message, setMessage] = useState<string | null>(null);

	const submitJoinRequest = async () => {
		const validationMessage = validateJoinDraft(joinDraft);
		if (validationMessage) {
			setMessage(validationMessage);
			return;
		}

		try {
			await joinSpaceAsync({
				spaceId: joinDraft.spaceId.trim(),
				targetPeerId: joinDraft.targetPeerId.trim(),
				targetMultiaddrs: parseMultiaddrs(joinDraft.targetMultiaddrs),
				displayName: joinDraft.displayName.trim() || undefined,
				deviceName: joinDraft.deviceName.trim() || undefined,
			});

			setMessage("Access request sent. Soma will unlock the space after the owner or bot approves it.");
			setJoinDraft((prev) => ({
				...prev,
				targetMultiaddrs: "",
			}));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			setMessage(`Failed to submit access request: ${errorMessage}`);
		}
	};

	return (
		<div className="space-y-5">
			<div className="grid gap-3 md:grid-cols-3">
				<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
					<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">What this does</div>
					<div className="mt-1 font-semibold text-base">Submits an access request</div>
					<div className="text-base-content/70 text-xs">A space only appears after the request is approved.</div>
				</div>
				<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
					<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">What you need</div>
					<div className="mt-1 font-semibold text-base">Space ID + connection details</div>
					<div className="text-base-content/70 text-xs">These come from the space owner or a delegated approver bot for that space.</div>
				</div>
				<div className="rounded-xl border border-base-300 bg-base-200/60 px-4 py-3">
					<div className="text-base-content/60 text-xs uppercase tracking-[0.12em]">Need help?</div>
					<div className="mt-2">
						<Link className="btn btn-ghost btn-xs" to="/settings">
							View current memberships
						</Link>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<label className="form-control w-full">
					<span className="label-text">Space ID</span>
					<input
						className="input input-bordered w-full"
						onChange={(event) => setJoinDraft((prev) => ({ ...prev, spaceId: event.target.value }))}
						placeholder="space-123"
						value={joinDraft.spaceId}
					/>
				</label>
				<label className="form-control w-full">
					<span className="label-text">Owner or bot peer ID</span>
					<input
						className="input input-bordered w-full"
						onChange={(event) => setJoinDraft((prev) => ({ ...prev, targetPeerId: event.target.value }))}
						placeholder="12D3KooW..."
						value={joinDraft.targetPeerId}
					/>
				</label>
				<label className="form-control w-full md:col-span-2">
					<span className="label-text">Network addresses (one per line or comma separated)</span>
					<textarea
						className="textarea textarea-bordered min-h-20 w-full"
						onChange={(event) => setJoinDraft((prev) => ({ ...prev, targetMultiaddrs: event.target.value }))}
						placeholder="/ip4/203.0.113.7/tcp/14005/ws/p2p/12D3KooW..."
						value={joinDraft.targetMultiaddrs}
					/>
				</label>
				<label className="form-control w-full">
					<span className="label-text">Display name (optional)</span>
					<input
						className="input input-bordered w-full"
						onChange={(event) => setJoinDraft((prev) => ({ ...prev, displayName: event.target.value }))}
						placeholder="Your name"
						value={joinDraft.displayName}
					/>
				</label>
				<label className="form-control w-full">
					<span className="label-text">Device name (optional)</span>
					<input
						className="input input-bordered w-full"
						onChange={(event) => setJoinDraft((prev) => ({ ...prev, deviceName: event.target.value }))}
						placeholder="MacBook"
						value={joinDraft.deviceName}
					/>
				</label>
			</div>

			{message ? <div className="rounded-lg bg-base-200 px-3 py-2 text-sm">{message}</div> : null}

			<div className="flex justify-end">
				<button className="btn btn-primary btn-sm" disabled={isJoiningSpace} onClick={() => void submitJoinRequest()} type="button">
					{isJoiningSpace ? "Submitting..." : "Request access"}
				</button>
			</div>
		</div>
	);
}

export { JoinRequestPanel };

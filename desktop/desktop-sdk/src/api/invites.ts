import type * as B from "../bindings";
import type { Transport } from "../transport";

export function invites(t: Transport) {
	return {
		/** Owner-only: create and persist a signed invite for a space. */
		create: (args: B.CreateInviteArgs) => t.invoke<B.StoredInvite>("invites_create", { args }),
		/** Every invite ever issued for a space (revoked/expired included), newest first. */
		list: (spaceId: string) => t.invoke<B.StoredInvite[]>("invites_list", { spaceId }),
		/** Owner-only: invalidate a link that's already been shared. */
		revoke: (args: B.RevokeInviteArgs) => t.invoke<boolean>("invites_revoke", { args }),
		/**
		 * Decode + verify a `soma://invite/...` link with zero network
		 * access — call this to render a confirmation screen (space,
		 * role, issuer, expiry) *before* the user chooses to redeem it.
		 * Check `result.validity === "valid"` before offering to redeem;
		 * every other value carries a specific reason
		 * (`"invalidSignature"` | `"expired"` | `"malformed"`).
		 */
		inspect: (link: string) => t.invoke<B.InviteInspection>("invites_inspect", { link }),
		/**
		 * Redeem an already-inspected, valid invite link: dials the
		 * invite's issuer at its bootstrap multiaddrs and submits a join
		 * request carrying a proof over the invite. Returns a
		 * `requestId` to correlate against the eventual `JoinDecision` on
		 * `backend.events` (same shape as `spaces.join`'s result).
		 */
		redeem: (args: B.RedeemInviteArgs) => t.invoke<B.RedeemInviteResult>("invites_redeem", { args }),
	};
}

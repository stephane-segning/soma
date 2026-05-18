import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
	PeerAddressInput,
	type PeerAddressValidation,
} from "../components/forms/peer-address-input";

const meta = {
	title: "Forms/PeerAddressInput",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_VALID = "/ip4/192.0.2.4/tcp/4001/p2p/12D3KooWAbCd1234";
const SAMPLE_INVALID = "not-a-peer-address";

// A throwaway validator that mimics the daemon's format check: anything
// starting with `/ip4/` or `/ip6/` and ending in `/p2p/<id>` is "valid".
function mockValidate(address: string): PeerAddressValidation | null {
	const trimmed = address.trim();
	if (trimmed.length === 0) return null;
	const match = trimmed.match(/^\/(?:ip4|ip6)\/.+\/p2p\/(?<peerId>[\w]+)$/);
	if (match?.groups?.peerId) {
		return { kind: "valid", peerId: match.groups.peerId };
	}
	return {
		kind: "invalid",
		error: "Address must be a multiaddr ending in /p2p/<peer-id>.",
	};
}

function Demo({ initial = "" }: { initial?: string }) {
	const [value, setValue] = useState(initial);
	const [preview, setPreview] = useState<PeerAddressValidation | null>(() =>
		mockValidate(initial),
	);
	return (
		<div className="max-w-xl">
			<PeerAddressInput
				label="Bot peer address"
				onBlur={() => setPreview(mockValidate(value))}
				onChange={(next) => {
					setValue(next);
					// Clear preview while the user is typing; re-validates on blur.
					setPreview(null);
				}}
				preview={preview}
				value={value}
			/>
		</div>
	);
}

export const Empty: Story = {
	render: () => <Demo />,
};

export const ValidPreview: Story = {
	render: () => <Demo initial={SAMPLE_VALID} />,
};

export const InvalidPreview: Story = {
	render: () => <Demo initial={SAMPLE_INVALID} />,
};

export const Disabled: Story = {
	render: () => (
		<div className="max-w-xl">
			<PeerAddressInput
				disabled
				label="Bot peer address"
				onChange={() => undefined}
				value={SAMPLE_VALID}
			/>
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="flex flex-col gap-6 bg-base-100 p-4">
			<Demo />
			<Demo initial={SAMPLE_VALID} />
			<Demo initial={SAMPLE_INVALID} />
		</div>
	),
};

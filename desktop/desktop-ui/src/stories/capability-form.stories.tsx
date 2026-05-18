import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
	type CapabilityFormValue,
	CapabilityForm,
	type ScopeGroup,
} from "../components/forms/capability-form";

const meta = {
	title: "Forms/CapabilityForm",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SCOPE_GROUPS: ScopeGroup[] = [
	{
		id: "documents",
		label: "Documents",
		scopes: [
			{ id: "doc:read", label: "Read documents" },
			{ id: "doc:write", label: "Write documents" },
			{
				id: "doc:delete",
				label: "Delete documents",
				description: "Allow removing pages this bot can read.",
			},
		],
	},
	{
		id: "messages",
		label: "Messages",
		scopes: [
			{ id: "msg:read", label: "Read chat" },
			{ id: "msg:post", label: "Post replies" },
		],
	},
	{
		id: "attachments",
		label: "Attachments",
		scopes: [
			{ id: "blob:read", label: "Read attachments" },
			{ id: "blob:upload", label: "Upload attachments" },
		],
	},
	{
		id: "membership",
		label: "Membership",
		scopes: [
			{
				id: "membership:invite",
				label: "Invite members",
				description: "Bot may issue MembershipCapability for new peers.",
			},
		],
	},
];

const SAMPLE_PEER_ID = "12D3KooWAbCd1234efGhIjKlMnOpQrStUvWx";

function Demo({
	initialValue,
	initialError,
}: {
	initialValue?: Partial<CapabilityFormValue>;
	initialError?: string;
}) {
	const [value, setValue] = useState<CapabilityFormValue>({
		alias: "fetcher",
		grantedScopeIds: ["doc:read", "msg:read"],
		expiryDate: null,
		...initialValue,
	});
	const [issuing, setIssuing] = useState(false);
	const [issueError, setIssueError] = useState<string | undefined>(initialError);

	return (
		<div className="max-w-2xl">
			<CapabilityForm
				issueError={issueError}
				issuing={issuing}
				onCancel={() => alert("cancelled")}
				onChange={setValue}
				onIssue={() => {
					setIssuing(true);
					setIssueError(undefined);
					setTimeout(() => {
						setIssuing(false);
						setIssueError(undefined);
						alert(
							`Would issue capability for ${value.alias} with ${value.grantedScopeIds.length} scope(s).`,
						);
					}, 600);
				}}
				peerId={SAMPLE_PEER_ID}
				scopeGroups={SCOPE_GROUPS}
				value={value}
			/>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const WithExpiry: Story = {
	render: () => {
		const future = new Date();
		future.setDate(future.getDate() + 30);
		return (
			<Demo
				initialValue={{
					grantedScopeIds: [
						"doc:read",
						"doc:write",
						"msg:read",
						"msg:post",
						"blob:read",
					],
					expiryDate: future.toISOString().slice(0, 10),
				}}
			/>
		);
	},
};

export const WithError: Story = {
	render: () => (
		<Demo initialError="Daemon rejected the capability: peer is not reachable from this device. Verify the peer is online and try again." />
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo />
		</div>
	),
};

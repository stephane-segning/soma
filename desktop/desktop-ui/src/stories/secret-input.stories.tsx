import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { SecretInput } from "../components/forms/secret-input";

const meta = {
	title: "Forms/SecretInput",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ initial = "", placeholder }: { initial?: string; placeholder?: string }) {
	const [value, setValue] = useState(initial);
	return (
		<div className="max-w-xl">
			<SecretInput label="API key" onChange={setValue} placeholder={placeholder} value={value} />
		</div>
	);
}

export const Empty: Story = {
	render: () => <Demo />,
};

export const WithTypedValue: Story = {
	render: () => <Demo initial="sk-live-abc123def456" />,
};

export const UnchangedPlaceholder: Story = {
	name: "Key already stored (blank + placeholder)",
	render: () => <Demo placeholder="Unchanged — leave blank to keep the current key" />,
};

export const Disabled: Story = {
	render: () => (
		<div className="max-w-xl">
			<SecretInput disabled label="API key" onChange={() => undefined} value="sk-live-abc123def456" />
		</div>
	),
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="flex flex-col gap-6 bg-base-100 p-4">
			<Demo />
			<Demo initial="sk-live-abc123def456" />
		</div>
	),
};

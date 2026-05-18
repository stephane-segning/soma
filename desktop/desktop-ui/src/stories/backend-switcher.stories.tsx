import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import {
	type BackendOption,
	BackendSwitcher,
} from "../components/chat/backend-switcher";

const meta = {
	title: "Chat/BackendSwitcher",
	parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const OLLAMA_MARK = (
	<span className="grid size-3.5 place-items-center rounded-full bg-info text-info-content text-[8px] font-bold">
		O
	</span>
);
const LMSTUDIO_MARK = (
	<span className="grid size-3.5 place-items-center rounded-full bg-warning text-warning-content text-[8px] font-bold">
		L
	</span>
);
const OPENAI_MARK = (
	<span className="grid size-3.5 place-items-center rounded-full bg-success text-success-content text-[8px] font-bold">
		A
	</span>
);

const BACKENDS: BackendOption[] = [
	{
		id: "ollama-llama3",
		name: "Ollama · llama3.3",
		mark: OLLAMA_MARK,
		meta: "http://127.0.0.1:11434",
		isDefault: true,
	},
	{
		id: "lmstudio-qwen",
		name: "LM Studio · qwen2.5",
		mark: LMSTUDIO_MARK,
		meta: "http://127.0.0.1:1234",
	},
	{
		id: "openai-gpt",
		name: "OpenAI · gpt-4o",
		mark: OPENAI_MARK,
		meta: "https://api.openai.com",
	},
];

function Demo({ withAdd = true }: { withAdd?: boolean }) {
	const [activeId, setActiveId] = useState("ollama-llama3");
	return (
		<div className="flex h-48 items-end">
			<div className="flex w-full max-w-xl items-center justify-between rounded-md border border-base-300 bg-base-100 p-3">
				<span className="text-base-content/40 text-ui-sm">composer …</span>
				<BackendSwitcher
					activeId={activeId}
					backends={BACKENDS}
					onAddBackend={
						withAdd ? () => alert("Would deep-link to settings.") : undefined
					}
					onChange={setActiveId}
				/>
			</div>
		</div>
	);
}

export const Default: Story = {
	render: () => <Demo />,
};

export const NoAddBackend: Story = {
	render: () => <Demo withAdd={false} />,
};

export const DarkTheme: Story = {
	parameters: { theme: "luxury" },
	render: () => (
		<div className="bg-base-100 p-4">
			<Demo />
		</div>
	),
};

import type { Range } from "@tiptap/core";
import { Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { filterCommands } from "./commander/filter";
import { renderCommanderItems } from "./commander/render";
import type { EditorCommand } from "./commander/types";

export type { EditorCommand };

type CommanderOptions = {
	commands: EditorCommand[];
};

export const COMMANDER_SUGGESTION_KEY = new PluginKey("commander-suggestion");

export const CommanderExtension = Extension.create<CommanderOptions>({
	name: "commander",

	addOptions() {
		return { commands: [] };
	},

	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				pluginKey: COMMANDER_SUGGESTION_KEY,
				char: "/",
				items: ({ query }: { query: string }) => filterCommands(query, this.options.commands),
				command: async ({ editor, range, props }: { editor: Editor; range: Range; props: EditorCommand }) => {
					const result = props.handler({ editor, range });
					if (result instanceof Promise) await result;
				},
				render: renderCommanderItems,
			}),
		];
	},
});

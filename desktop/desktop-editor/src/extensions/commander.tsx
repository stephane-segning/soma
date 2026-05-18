import type { Range } from "@tiptap/core";
import { Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
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
				// Return every non-disabled command; the slash menu owns the
				// filter so its filtered view stays in sync with `props.query`.
				items: () => this.options.commands.filter((c) => !c.disabled),
				command: async ({ editor, range, props }: { editor: Editor; range: Range; props: EditorCommand }) => {
					const result = props.handler({ editor, range });
					if (result instanceof Promise) await result;
				},
				render: renderCommanderItems,
			}),
		];
	},
});

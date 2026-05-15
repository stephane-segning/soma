import type { EditorCommand } from "./types";

export function filterCommands(query: string, commands: EditorCommand[]): EditorCommand[] {
	if (query.length === 0) return commands;
	const search = query.toLowerCase();
	return commands.filter((command) => {
		if (command.disabled) return false;
		return (
			command.name.toLowerCase().includes(search) ||
			(command.description?.toLowerCase().includes(search) ?? false) ||
			(command.keywords?.some((keyword) => keyword.toLowerCase().includes(search)) ?? false)
		);
	});
}

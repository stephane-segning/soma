export const DEFAULT_PRACTICE_SPACE_ID = "practice";

export const PRACTICE_SPACE_OPTIONS = [
	{
		id: "practice",
		name: "Basics",
		accent: "#7af5d1",
		description: "Short typing passages",
	},
	{
		id: "focus",
		name: "Prompted Drills",
		accent: "#f8d66d",
		description: "Generated practice prompts",
	},
] as const;

export type PracticeSpace = (typeof PRACTICE_SPACE_OPTIONS)[number];

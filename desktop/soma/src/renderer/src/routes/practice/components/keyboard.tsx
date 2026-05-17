import { cn } from "@app/lib/cn";

type KeyboardProps = {
	expectedKey?: string;
	lastKey?: string | null;
};

const rows = [
	["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
	["A", "S", "D", "F", "G", "H", "J", "K", "L"],
	["Z", "X", "C", "V", "B", "N", "M", ",", ".", "?"],
	["Space", "Enter"],
];

function normalizeKey(char?: string): string | undefined {
	if (!char) return undefined;
	if (char === " ") return "SPACE";
	if (char === "\n") return "ENTER";
	if (char === "\r") return "ENTER";
	return char.toUpperCase();
}

function Keyboard({ expectedKey, lastKey }: KeyboardProps): React.JSX.Element {
	const target = normalizeKey(expectedKey);
	const recent = normalizeKey(lastKey ?? undefined);

	return (
		<div className="practice-keyboard">
			{rows.map((row) => (
				<div className="practice-keyboard-row" key={row.join("")}>
					{row.map((label) => {
						const active = normalizeKey(label) === target;
						const pressed = normalizeKey(label) === recent;
						return (
							<div
								className={cn(
									"practice-keycap",
									active && "practice-keycap--active",
									pressed && "practice-keycap--pressed",
								)}
								key={label}
							>
								{label}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}

export { Keyboard };

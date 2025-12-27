import { cn } from "../lib/cn";

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
		<div className="keyboard">
			{rows.map((row, idx) => (
				<div className="keyboard-row" key={idx}>
					{row.map((label) => {
						const active = normalizeKey(label) === target;
						const pressed = normalizeKey(label) === recent;
						return (
							<div
								className={cn(
									"keycap",
									active && "keycap--active",
									pressed && "keycap--pressed",
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

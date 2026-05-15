import { useState } from "react";
import { cn } from "../../../utils/cn";

export function ResizeHandle() {
	const [hover, setHover] = useState(false);

	return (
		<div
			className={cn(
				"flex h-full w-2.5 cursor-col-resize items-center justify-center rounded-md transition-all duration-150",
				hover ? "bg-slate-400/20" : "bg-transparent",
			)}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			role="none"
		>
			<span className={cn("h-10 rounded-full bg-base-300 transition-all duration-150", hover ? "w-1.5" : "w-px")} />
		</div>
	);
}

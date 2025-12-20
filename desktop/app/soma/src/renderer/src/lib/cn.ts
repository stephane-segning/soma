import { cx, type ClassValue } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

// Merge Tailwind class names while leveraging cva's cx helper.
function cn(...inputs: ClassValue[]): string {
	return twMerge(cx(inputs));
}

export { cn };

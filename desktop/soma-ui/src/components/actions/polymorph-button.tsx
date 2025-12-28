import { motion, type HTMLMotionProps } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

type Variant =
	| "primary"
	| "secondary"
	| "ghost"
	| "outline"
	| "danger"
	| "success";
type Size = "xs" | "sm" | "md" | "lg";

export type PolymorphButtonProps = {
	variant?: Variant;
	size?: Size;
	iconOnly?: boolean;
	leadingIcon?: ReactNode;
	trailingIcon?: ReactNode;
	loading?: boolean;
	glow?: boolean;
	fullWidth?: boolean;
	asChild?: boolean;
} & Omit<HTMLMotionProps<"button">, "whileHover" | "whileTap"> &
	Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
		type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
	};

const variantStyles: Record<Variant, string> = {
	primary: "btn-primary",
	secondary: "btn-secondary",
	ghost: "btn-ghost",
	outline: "btn-outline",
	danger: "btn-error",
	success: "btn-success",
};

const sizeStyles: Record<Size, string> = {
	xs: "btn-xs",
	sm: "btn-sm",
	md: "btn-md",
	lg: "btn-lg",
};

export function PolymorphButton({
	variant = "primary",
	size = "md",
	iconOnly,
	leadingIcon,
	trailingIcon,
	loading,
	glow,
	fullWidth,
	className,
	children,
	type = "button",
	...props
}: PolymorphButtonProps) {
	const base = cn(
		"btn transition",
		variantStyles[variant],
		sizeStyles[size],
		iconOnly ? "btn-square" : "gap-2",
		fullWidth && "w-full",
		glow && "shadow-[0_0_28px_-8px_rgba(59,130,246,0.7)]",
		className,
	);

	return (
		<motion.button
			type={type}
			className={base}
			whileHover={{ y: iconOnly ? -2 : -1, scale: iconOnly ? 1.05 : 1.01 }}
			whileTap={{ scale: 0.98 }}
			{...props}
		>
			{loading ? <span className="loading loading-spinner loading-xs" /> : null}
			{leadingIcon}
			{children ? (
				<span className={cn(iconOnly && "sr-only")}>{children}</span>
			) : null}
			{trailingIcon}
		</motion.button>
	);
}

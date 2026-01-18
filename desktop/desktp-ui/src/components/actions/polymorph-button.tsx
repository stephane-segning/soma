import { type HTMLMotionProps, motion } from "motion/react";
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
type Shape = "circle" | "default";

export type PolymorphButtonProps = {
	variant?: Variant;
	size?: Size;
	shape?: Shape;
	iconOnly?: boolean;
	leadingIcon?: ReactNode;
	trailingIcon?: ReactNode;
	loading?: boolean;
	fullWidth?: boolean;
	asChild?: boolean;
} & Omit<HTMLMotionProps<"button">, "whileTap"> &
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

const shapeStyles: Record<Shape, string> = {
	circle: "btn-circle",
	default: "",
};

export function PolymorphButton({
	variant = "primary",
	size = "md",
	shape = "circle",
	iconOnly,
	leadingIcon,
	trailingIcon,
	loading,
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
		shapeStyles[shape],
		iconOnly ? "btn-square" : "gap-2",
		fullWidth && "w-full",
		className,
	);

	return (
		<motion.button
			className={base}
			type={type}
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

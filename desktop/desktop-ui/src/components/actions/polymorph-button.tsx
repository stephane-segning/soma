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
	shape = "default",
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
			aria-busy={loading || undefined}
			className={base}
			type={type}
			whileTap={{ scale: 0.98 }}
			{...props}
		>
			{/* While `loading`, the spinner takes the place of any leading/
			   trailing icon — rendering both at once made the button feel
			   noisy and led to layout shift the moment loading flipped on.
			   The label stays visible so the user can still read what the
			   button is *trying* to do. */}
			{loading ? (
				<span aria-hidden className="loading loading-spinner loading-xs" />
			) : (
				leadingIcon
			)}
			{children ? (
				<span className={cn(iconOnly && "sr-only")}>{children}</span>
			) : null}
			{loading ? null : trailingIcon}
		</motion.button>
	);
}

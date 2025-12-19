import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import {Button as HuiButton} from '@headlessui/react'

const buttonStyles = cva(
	"btn",
	{
		variants: {
			variant: {
				primary: "btn-primary",
				secondary: "btn-secondary",
				ghost: "btn-ghost",
			},
			size: {
				sm: "btn-sm",
				md: "btn-md",
				lg: "btn-lg",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "md",
		},
	},
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonStyles> & {
		isLoading?: boolean;
		leadingIcon?: ReactNode;
		trailingIcon?: ReactNode;
	};

function Button({
	className,
	children,
	variant,
	size,
	isLoading,
	leadingIcon,
	trailingIcon,
	...rest
}: ButtonProps): React.JSX.Element {
	const { t } = useTranslation("common");
	const ariaLabel =
		rest["aria-label"] ??
		(isLoading
			? t("components.button.loading", "Loading")
			: t("components.button.ariaLabel", "Button action"));

	return (
		<HuiButton
      as={motion.button}
			type="button"
			aria-label={ariaLabel}
			aria-busy={isLoading}
			whileTap={{ scale: 0.98 }}
			className={cn(buttonStyles({ variant, size }), isLoading && "loading", className)}
			{...rest}
		>
			<span className="flex items-center gap-2">
				{leadingIcon}
				<span>{children}</span>
				{trailingIcon}
			</span>
		</HuiButton>
	);
}

export { Button };

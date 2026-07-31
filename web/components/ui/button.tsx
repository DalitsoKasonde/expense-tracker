import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const variants: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

/**
 * The class string every button-shaped control must use.
 *
 * Exported so anchors and `next/link` elements can look identical to a
 * `<Button>` without copying the recipe.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return cn("btn", variants[variant], size === "sm" && "btn-sm", block && "btn-block", className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  // `type` defaults to "button": a bare <button> inside a form submits it, which
  // has caused accidental submissions from secondary actions.
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...rest} />;
}

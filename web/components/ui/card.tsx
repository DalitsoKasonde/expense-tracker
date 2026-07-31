import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardPadding = "md" | "lg" | "none";

const paddings: Record<CardPadding, string | false> = {
  md: false, // `.card` already carries the default padding
  lg: "card-pad-lg",
  none: "card-flush",
};

/** Class string for a card surface, for call sites that cannot render <Card>. */
export function cardClass({
  padding = "md",
  interactive = false,
  className,
}: { padding?: CardPadding; interactive?: boolean; className?: string } = {}) {
  return cn("card", paddings[padding], interactive && "card-interactive", className);
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  padding?: CardPadding;
  interactive?: boolean;
};

export function Card({
  as: Tag = "div",
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag className={cardClass({ padding, interactive, className })} {...rest}>
      {children}
    </Tag>
  );
}

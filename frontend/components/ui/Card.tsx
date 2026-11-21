import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-md transition-[transform,border-color,box-shadow,background-color] duration-150 ease-out",
  {
  variants: {
    variant: {
      flat: "border border-border-default bg-surface-0",
      elevated: "bg-surface-0 shadow-sm ring-1 ring-border-subtle",
      ghost: "bg-surface-1",
      interactive:
        "border border-border-default bg-surface-0 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm",
    },
  },
  defaultVariants: {
    variant: "flat",
  },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

/**
 * Layered card container with flat, elevated, ghost, and interactive variants.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export { cardVariants };

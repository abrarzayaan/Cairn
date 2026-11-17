import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm font-sans font-medium leading-none",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-text-secondary",
        success: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950",
        warning: "bg-amber-600 text-white dark:bg-amber-500 dark:text-zinc-950",
        danger: "bg-red-600 text-white dark:bg-red-500 dark:text-zinc-950",
        info: "bg-accent-light text-accent",
        outline: "border border-border-default bg-transparent text-text-secondary",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[11px]",
        md: "px-2 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Solid semantic status badge without inline opacity hacks.
 */
export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { badgeVariants };

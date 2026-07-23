import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/40 bg-primary/85 text-primary-foreground shadow-sm",
        secondary: "glass-chip text-secondary-foreground",
        outline: "glass-chip text-foreground",
        success:
          "border-white/35 bg-[var(--success)]/15 text-[var(--success)] backdrop-blur-md",
        warning:
          "border-white/35 bg-[var(--warning)]/15 text-[var(--warning)] backdrop-blur-md",
        destructive:
          "border-white/35 bg-destructive/15 text-destructive backdrop-blur-md",
        muted: "glass-chip text-muted-foreground",
        brand: "border-white/45 bg-brand/15 text-brand backdrop-blur-md",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

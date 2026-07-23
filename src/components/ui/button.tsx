import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[1.15rem] text-sm font-semibold tracking-[-0.01em] transition-[transform,box-shadow,filter,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-glass-primary",
        destructive:
          "btn-glass text-white border-white/30 [background:linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.06)),linear-gradient(180deg,#e06a6a,#c24141)]",
        outline: "btn-glass",
        secondary: "btn-glass text-foreground/90",
        ghost:
          "border border-transparent bg-transparent shadow-none hover:border-white/45 hover:bg-white/25",
        link: "border-0 bg-transparent shadow-none text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-[0.95rem] px-3 text-xs",
        lg: "h-12 rounded-[1.25rem] px-7 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

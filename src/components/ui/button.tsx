// src/components/ui/button.tsx - Premium Button System

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 overflow-hidden transform-gpu",
  {
    variants: {
      variant: {
        default: [
          // Glass primary bound to stealth opacity
          "bg-stealth-card text-stealth-primary border border-stealth shadow-[0_1px_3px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.1)),0_1px_2px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.06))] backdrop-blur-sm",
          "hover:shadow-[0_10px_15px_-3px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.1)),0_4px_6px_-2px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.05))]",
          "hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95",
          "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
          "before:-translate-x-full before:transition-transform before:duration-500",
          "hover:before:translate-x-full"
        ],
        secondary: [
          // Stealth glass background bound to --stealth-opacity
          "bg-stealth-card text-stealth-primary border border-stealth shadow-[0_1px_2px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.05))] backdrop-blur-sm",
          "hover:shadow-[0_4px_6px_-1px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.1)),0_2px_4px_-1px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.06))]",
          "hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        outline: [
          // Transparent, with stealth glass hover
          "border border-stealth bg-transparent text-stealth-primary shadow-[0_1px_2px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.05))]",
          "hover:bg-stealth-card hover:shadow-[0_4px_6px_-1px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.1)),0_2px_4px_-1px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.06))] backdrop-blur-sm",
          "hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        ghost: [
          // Transparent, with stealth glass hover
          "bg-transparent text-stealth-primary",
          "hover:bg-stealth-card hover:shadow-[0_1px_2px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.05))] backdrop-blur-sm",
          "hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        destructive: [
          "bg-destructive text-destructive-foreground shadow-[0_1px_3px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.1)),0_1px_2px_0_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.06))]",
          "hover:bg-destructive/90 hover:shadow-[0_10px_15px_-3px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.1)),0_4px_6px_-2px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.05))]",
          "hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        link: [
          "text-primary underline-offset-4 hover:underline",
          "hover:-translate-y-0.5",
          "active:translate-y-0"
        ]
      },
      size: {
        default: "h-10 px-4 py-2 text-sm rounded-xl",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-12 px-6 text-base rounded-xl",
        xl: "h-14 px-8 text-lg rounded-2xl",
        icon: "h-10 w-10 rounded-xl"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

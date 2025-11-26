// src/components/ui/badge.tsx - Premium Badge System

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg text-xs font-semibold transition-all duration-200 ease-out transform-gpu",
  {
    variants: {
      variant: {
        default: [
          "bg-stealth-card text-stealth-primary border border-stealth shadow-sm backdrop-blur-sm",
          "hover:shadow-md hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        secondary: [
          "bg-stealth-bg-secondary text-stealth-text-secondary border border-stealth shadow-sm backdrop-blur-sm",
          "hover:bg-stealth-card hover:text-stealth-primary hover:shadow-md hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        destructive: [
          "bg-destructive text-destructive-foreground shadow-sm",
          "hover:bg-destructive/90 hover:shadow-md hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        outline: [
          "border border-stealth bg-transparent text-stealth-primary shadow-sm",
          "hover:bg-stealth-card hover:shadow-md hover:-translate-y-0.5 backdrop-blur-sm",
          "active:translate-y-0 active:scale-95"
        ],
        success: [
          "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 shadow-sm backdrop-blur-sm",
          "hover:bg-emerald-500/30 hover:shadow-md hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ],
        warning: [
          "bg-amber-500/20 text-amber-200 border border-amber-400/30 shadow-sm backdrop-blur-sm",
          "hover:bg-amber-500/30 hover:shadow-md hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-95"
        ]
      },
      size: {
        sm: "h-5 px-2 text-[10px] rounded-md",
        default: "h-6 px-2.5 text-xs rounded-lg",
        lg: "h-7 px-3 text-sm rounded-lg"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
export default Badge

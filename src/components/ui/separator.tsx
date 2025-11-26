// src/components/ui/separator.tsx - Premium Separator System

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { cn } from "../../lib/utils"

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 transition-all duration-200 ease-out",
        orientation === "horizontal" 
          ? "h-px w-full bg-gradient-to-r from-transparent via-stealth-border to-transparent" 
          : "h-full w-px bg-gradient-to-b from-transparent via-stealth-border to-transparent",
        "opacity-60 hover:opacity-100",
        className
      )}
      {...props}
    />
  )
)
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }

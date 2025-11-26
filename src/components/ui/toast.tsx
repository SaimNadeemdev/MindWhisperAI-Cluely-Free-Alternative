import * as React from "react"
import * as ToastPrimitive from "@radix-ui/react-toast"
import { cn } from "../../lib/utils"
import { X } from "lucide-react"

const ToastProvider = ToastPrimitive.Provider

export type ToastMessage = {
  title: string
  description: string
  variant: ToastVariant
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      // Fixed, unobtrusive viewport that hugs the top-right corner
      "pointer-events-none fixed top-5 left-0 right-0 z-[140] flex flex-col items-end gap-3 px-4 sm:px-6",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitive.Viewport.displayName

type ToastVariant = "neutral" | "success" | "error"

interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: ToastVariant
}

const toastVariants: Record<ToastVariant, string> = {
  neutral: "border-white/20 shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
  success: "border-white/30 shadow-[0_8px_30px_rgba(255,255,255,0.15)] bg-gradient-to-br from-white/5 to-transparent",
  error: "border-white/25 shadow-[0_8px_30px_rgba(255,255,255,0.1)] bg-gradient-to-br from-white/3 to-transparent"
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, variant = "neutral", ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      "group relative z-[150] w-full max-w-[calc(100vw-3rem)] sm:max-w-sm overflow-hidden rounded-xl border px-4 py-3.5",
      "pointer-events-auto backdrop-blur-xl transition-all duration-300 ease-out",
      "hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.15))]",
      "before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-white/8 before:via-transparent before:to-transparent",
      "animate-in slide-in-from-top-2 fade-in-0 duration-300",
      "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top-2 data-[state=closed]:fade-out-0 data-[state=closed]:duration-200",
      toastVariants[variant],
      className
    )}
    style={{
      backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`
    }}
    {...props}
  />
))
Toast.displayName = ToastPrimitive.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn("text-xs font-medium text-white hover:opacity-90", className)}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitive.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute top-2.5 right-2.5 text-white/70 hover:text-white",
      "transition-all duration-200 hover:scale-110 active:scale-95",
      "rounded-md p-1 hover:bg-white/10",
      className
    )}
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitive.Close>
))
ToastClose.displayName = ToastPrimitive.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("font-semibold text-sm text-white pr-8", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitive.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-xs text-white/70 mt-1 pr-8", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitive.Description.displayName

export type { ToastProps, ToastVariant }
export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastAction,
  ToastClose,
  ToastTitle,
  ToastDescription
}

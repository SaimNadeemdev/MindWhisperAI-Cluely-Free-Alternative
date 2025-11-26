// src/components/ScreenshotItem.tsx
import React from "react"
import { X } from "lucide-react"
import { Button } from "../ui/button"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotItemProps {
  screenshot: Screenshot
  onDelete: (index: number) => void
  index: number
  isLoading: boolean
}

const ScreenshotItem: React.FC<ScreenshotItemProps> = ({
  screenshot,
  onDelete,
  index,
  isLoading
}) => {
  const handleDelete = async () => {
    await onDelete(index)
  }

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-lg card-premium border border-stealth ${isLoading ? "" : "group hover:shadow-[var(--stealth-shadow-medium)] hover:-translate-y-0.5 transition-all duration-200 ease-out"}`}
      >
        <div className="w-full h-full relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center /40 backdrop-blur-sm border-b border-white/10" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
              <div className="w-6 h-6 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <img
            src={screenshot.preview}
            alt="Screenshot"
            className={`w-full h-full object-cover transition-all duration-300 ${
              isLoading
                ? "opacity-60"
                : "cursor-pointer group-hover:scale-[1.03] group-hover:brightness-90"
            }`}
          />
        </div>
        {!isLoading && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
            variant="ghost"
            size="icon"
            className="absolute top-2 left-2 p-1 rounded-full /50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 h-8 w-8 border border-white/10" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}
            aria-label="Delete screenshot"
          >
            <X size={16} />
          </Button>
        )}
      </div>
    </>
  )
}

export default ScreenshotItem

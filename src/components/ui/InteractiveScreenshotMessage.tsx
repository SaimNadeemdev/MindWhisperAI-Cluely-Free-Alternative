import React, { useState, useEffect } from 'react'
import { RiDownloadLine, RiImageLine } from 'react-icons/ri'
import { Button } from './button'

interface InteractiveScreenshotMessageProps {
  screenshotData: {
    path: string
    timestamp: string
    size: string
    preview?: string
  }
  className?: string
}

const InteractiveScreenshotMessage: React.FC<InteractiveScreenshotMessageProps> = ({
  screenshotData,
  className = ""
}) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null)

  // Use preview data if available, otherwise try to construct file URL
  const getImageUrl = () => {
    // Prefer base64 preview data if available
    if (screenshotData.preview) {
      return screenshotData.preview
    }
    
    // Fallback to file path (though this likely won't work due to Electron security)
    const path = screenshotData.path
    if (path.startsWith('file://')) {
      return path
    }
    
    // Try the raw path first (sometimes Electron handles this)
    if (path.includes(':\\')) {
      return path
    }
    
    // Convert Windows path to file URL - ensure proper format
    const normalizedPath = path.replace(/\\/g, '/')
    const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath
    return `file:///${cleanPath}`
  }

  const imageUrl = getImageUrl()

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageLoaded(true)
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    })
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const currentSrc = img.src
    
    // If we're using preview data and it fails, there's not much we can do
    if (screenshotData.preview && currentSrc === screenshotData.preview) {
      setImageError(true)
      setImageLoaded(false)
      return
    }
    
    // Try fallback URLs if the first one fails (for file path fallback)
    if (currentSrc === screenshotData.path) {
      // Try with file:// protocol
      const normalizedPath = screenshotData.path.replace(/\\/g, '/')
      const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath
      img.src = `file:///${cleanPath}`
      return
    } else if (!currentSrc.startsWith('file://') && !currentSrc.startsWith('data:')) {
      // Try with file:// protocol
      const normalizedPath = screenshotData.path.replace(/\\/g, '/')
      const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath
      img.src = `file:///${cleanPath}`
      return
    }
    
    // All attempts failed
    setImageError(true)
    setImageLoaded(false)
  }

  const downloadScreenshot = () => {
    try {
      // For now, just copy the file path to clipboard or show a message
      // In a real implementation, you'd copy the file to Downloads folder
      if (navigator.clipboard) {
        navigator.clipboard.writeText(screenshotData.path)
          .then(() => console.log('Screenshot path copied to clipboard'))
          .catch(() => console.log('Could not copy to clipboard'))
      }
      console.log('Screenshot path:', screenshotData.path)
    } catch (error) {
      console.error('Download error:', error)
    }
  }


  // Calculate file size in a readable format
  const formatFileSize = (sizeStr: string) => {
    if (sizeStr === 'Processing...') return sizeStr
    return sizeStr
  }

  return (
    <>
      {/* Main Screenshot Message */}
      <div className={`border border-white/30 rounded-xl p-3 max-w-[320px] shadow-lg backdrop-blur-xl ${className}`} 
           style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shadow-lg">
            <RiImageLine className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm text-white mb-1">Screenshot</div>
            <div className="text-xs text-white/70">Captured at {screenshotData.timestamp}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadScreenshot}
            className="h-10 w-10 p-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 transition-all duration-300 hover:scale-110"
            title="Copy screenshot path"
          >
            <RiDownloadLine className="w-5 h-5 text-white" />
          </Button>
        </div>

        {/* Screenshot Preview */}
        <div className="relative bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          
          {!imageError ? (
            <>
              <img
                src={imageUrl}
                alt="Screenshot preview"
                className="w-full h-auto max-h-48 object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ 
                  filter: imageLoaded ? 'none' : 'blur(4px)',
                  opacity: imageLoaded ? 1 : 0.7
                }}
              />
              

              {/* Loading indicator */}
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="text-center">
                <RiImageLine className="w-8 h-8 text-white/40 mx-auto mb-2" />
                <p className="text-xs text-white/60">Failed to load image</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white/60 rounded-full"></div>
            <span>Sent for analysis</span>
          </div>
          <div className="flex items-center gap-2">
            {imageDimensions && (
              <>
                <span>{imageDimensions.width}×{imageDimensions.height}</span>
                <span>•</span>
              </>
            )}
            <span>{formatFileSize(screenshotData.size)}</span>
          </div>
        </div>
      </div>

    </>
  )
}

export default InteractiveScreenshotMessage

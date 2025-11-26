import React, { useState, useRef, useEffect } from 'react'
import { IoLogOutOutline } from 'react-icons/io5'
import { RiEyeLine, RiEyeOffLine } from 'react-icons/ri'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { Separator } from '../ui/separator'
// Ultra-compact Live Mode button with MindWhisper logo - forced tight spacing
// Import logo from src/assets so Vite bundles it correctly for production
// This ensures the image works in both dev (http://) and production (file://) protocols
import mindwhisperLogo from '../../assets/logo-mindwhisper.png'

interface QueueCommandsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  onCaptureAndSolve: () => void;
  isVisible: boolean;
  onClose: () => void;
  onChatToggle: () => void;
  onSettingsToggle: () => void;
  onTranscriptToggle: () => void;
  onStealthToggle?: () => void;
  onAICustomizationToggle?: () => void;
  onMeasureWidth?: (width: number) => void;
  // Render toolbar as fixed overlay (default) or inline block within layout
  positionFixed?: boolean;
  // Optional props that may be passed but aren't used
  screenshots?: string[];
  onMinimize?: () => void;
  onTooltipVisibilityChange?: () => void;
  stealthEnabled?: boolean;
  // Trial/License status
  licenseStatus?: { deviceId: string; status: "active"|"expired"|"banned"|"unknown"; trialEndISO: string|null; serverTimeISO: string|null; daysLeft: number; offline: boolean; message?: string } | null;
  onRefreshLicense?: () => void;
  onActivateLicense?: () => void;
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  isRecording,
  onToggleRecording,
  onCaptureAndSolve,
  isVisible,
  onChatToggle,
  onSettingsToggle,
  onTranscriptToggle,
  onStealthToggle,
  onAICustomizationToggle,
  onMeasureWidth,
  positionFixed = true,
  stealthEnabled,
  licenseStatus,
  onRefreshLicense,
  onActivateLicense,
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsTooltipVisible(false)
    }, 300)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Report toolbar width to parent so window can size correctly (fixed elements don't affect layout size)
  useEffect(() => {
    if (!toolbarRef.current || !onMeasureWidth) return
    const el = toolbarRef.current
    const report = () => {
      // Measure multiple ways and add a buffer so borders/blur/shadows don't clip
      const rectW = el.getBoundingClientRect().width
      const sw = el.scrollWidth
      const ow = el.offsetWidth
      const base = Math.max(rectW, sw, ow)
      const w = Math.ceil(base + 14) // exact width, no buffer - perfect alignment
      onMeasureWidth(w)
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    // Report twice to catch first paint and any late icon/font layout
    report()
    requestAnimationFrame(report)
    const t1 = setTimeout(report, 150)
    const t2 = setTimeout(report, 500)
    const t3 = setTimeout(report, 1000)
    // Also re-measure after fonts load (hover often forces reflow that fonts loading would also cause)
    let fontReady = false
    if ((document as any).fonts && typeof (document as any).fonts.ready?.then === 'function') {
      ;(document as any).fonts.ready.then(() => {
        fontReady = true
        report()
      })
    }

    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    }
  }, [onMeasureWidth])

  const containerClass = positionFixed
    ? `fixed top-4 left-1/2 z-50 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity duration-150`
    : `relative inline-block my-2 ${isVisible ? '' : 'opacity-0 pointer-events-none'}`;

  return (
    <div 
      ref={toolbarRef} 
      className={containerClass}
      style={positionFixed ? { transform: 'translateX(-50%)', width: 'fit-content' } : undefined}
    >
      {/* Integrated Trial Bar */}
      {licenseStatus && (
        <div className="floating-toolbar-premium mb-2 px-4 py-2 w-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`px-2 py-1 rounded-md text-xs font-semibold ${
              licenseStatus.status === 'active' 
                ? 'bg-white/20 text-white border border-white/30' 
                : 'bg-white/10 text-white/80 border border-white/20'
            }`}>
              {licenseStatus.status === 'active' ? 'Trial Active' : licenseStatus.status === 'expired' ? 'Trial Expired' : 'Unknown'}
            </div>
            <span className="text-xs text-white/70 font-medium">
              {licenseStatus.status === 'active' ? `${licenseStatus.daysLeft} day${licenseStatus.daysLeft===1?'':'s'} left` : 'Activation required'}
            </span>
            {licenseStatus.offline && (
              <div className="px-2 py-1 rounded-md text-[10px] font-medium bg-white/10 text-white/60 border border-white/20">
                Offline
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-7 px-3 text-xs font-medium bg-white/10 border-white/20 text-white/90 hover:bg-white/20 hover:border-white/30 transition-all duration-200" 
              onClick={onRefreshLicense}
            >
              Refresh
            </Button>
            {licenseStatus.status !== 'active' && (
              <Button 
                size="sm" 
                className="h-7 px-3 text-xs font-semibold bg-white text-black hover:bg-white/90 transition-all duration-200" 
                onClick={onActivateLicense}
              >
                Activate
              </Button>
            )}
          </div>
        </div>
      )}
      
      {/* Main Toolbar */}
      <div className="floating-toolbar-premium relative flex items-center px-4 py-3 w-fit whitespace-nowrap overflow-visible">
        {typeof stealthEnabled === 'boolean' && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`app-region-no-drag absolute -top-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-all duration-300 shadow-lg backdrop-blur-sm z-10 ${stealthEnabled
                    ? 'border-emerald-400/60 text-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 hover:border-emerald-400/80 shadow-emerald-500/20'
                    : 'border-amber-400/60 text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 hover:border-amber-400/80 shadow-amber-500/20'
                  } hover:scale-110 hover:shadow-xl`}
                  aria-label={stealthEnabled ? 'Invisible on screen shares' : 'Visible on screen shares'}
                  tabIndex={-1}
                >
                  {stealthEnabled ? <RiEyeOffLine className="h-3.5 w-3.5" /> : <RiEyeLine className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                <p>{stealthEnabled ? 'Invisible on screen shares' : 'Visible on screen shares'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Left Section - Primary Actions */}
        <div className="flex items-center gap-2">
          {/* Drag Handle - Premium Design */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="drag-handle app-region-drag toolbar-btn-premium group h-auto px-3 py-2 flex-col min-w-[70px] select-none cursor-move"
                  role="button"
                  aria-label="Drag to move window"
                  title="Drag to move the app"
                >
                  <div className="icon-container-premium relative">
                    <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10H5l4-4 4 4h-2v4h2l-4 4-4-4h2v-4zM14 7V5l4 4-4 4V11h-4v2l-4-4 4-4v2h4z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Move</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Hold and drag to move the application window</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* AI Customization Button - Premium Design */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 hover:shadow-lg"
                  onClick={onAICustomizationToggle}
                >
                  <div className="icon-container-premium relative">
                    <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Profile</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI Customization</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Solve Button - Enhanced Premium Design */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 hover:shadow-lg"
                  onClick={onCaptureAndSolve}
                >
                  <div className="icon-container-premium relative">
                    <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Solve</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Capture & Solve (Ctrl+H)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Voice Button - Enhanced with Recording State */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 ${
                    isRecording ? 'text-white border-white/30 shadow-lg' : 'hover:shadow-lg'
                  }`}
                  style={isRecording ? { backgroundColor: `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.9))` } : undefined}
                  onClick={onToggleRecording}
                >
                  <div className="icon-container-premium relative">
                    {isRecording ? (
                      <div className="w-4 h-4 bg-red-500 rounded-full" />
                    ) : (
                      <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">{isRecording ? 'Recording' : 'Voice'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Voice Recording</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

        </div>

        {/* Premium Separator with Glow Effect */}
        <div className="flex items-center mx-4">
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/30 to-transparent shadow-sm"></div>
        </div>

        {/* CENTER - Main Feature: Live Mode Transcription - Ultra Premium */}
        <div className="flex justify-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="live-mode-btn-premium app-region-no-drag group h-auto px-2 py-2 bg-white text-black shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105 border border-white/20 backdrop-blur-sm"
                  onClick={onTranscriptToggle}
                  style={{ paddingTop: '4px', paddingBottom: '6px', paddingLeft: '8px', paddingRight: '8px' }}
                >
                  <div className="flex flex-col items-center gap-0 relative" style={{ gap: '-4px' }}>
                    <div className="live-mode-icon-premium w-16 h-20 flex items-center justify-center relative overflow-hidden transition-all duration-500 shadow-sm" style={{ paddingTop: '4px', paddingBottom: '4px' }}>
                      <img
                        src={mindwhisperLogo}
                        alt="MindWhisper Live"
                        className="w-14 h-14 object-contain select-none will-change-transform transition-all duration-500 ease-out group-hover:scale-110"
                        draggable={false}
                        loading="eager"
                        decoding="sync"
                        onError={(e) => {
                          console.error('Failed to load MindWhisper logo:', e);
                          // Fallback: try to load from public directory directly
                          (e.target as HTMLImageElement).src = './logo-mindwhisper.png';
                        }}
                      />
                    </div>
                    <span className="live-mode-label-premium text-sm font-semibold tracking-wide transition-all duration-300 pb-1">Live Mode</span>
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>🚀 Live Mode Transcription - Our Main Feature!</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Premium Separator with Glow Effect */}
        <div className="flex items-center mx-4">
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-white/30 to-transparent shadow-sm"></div>
        </div>

        {/* Right Section - Utility Actions */}
        <div className="flex items-center gap-2">
          {/* Chat Button - Premium Design */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 hover:shadow-lg"
                  onClick={onChatToggle}
                >
                  <div className="icon-container-premium relative">
                    <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open Chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Settings Button - Premium Design */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 hover:shadow-lg"
                  onClick={onSettingsToggle}
                >
                  <div className="icon-container-premium relative">
                    <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="7" width="18" height="10" rx="2" ry="2" strokeWidth="2"/>
                      <path strokeWidth="2" d="M6 10h2M10 10h2M14 10h2M18 10h0M6 13h3M10.5 13h3M15 13h3" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Shortcuts</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Keyboard Shortcuts</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>


          {/* Stealth Button - Premium Design */}
          {onStealthToggle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 hover:shadow-lg"
                    onClick={onStealthToggle}
                  >
                    <div className="icon-container-premium relative">
                      <svg className="w-4 h-4 transition-all duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L12 12m6.121-6.121A2.98 2.98 0 0119 8c0 .597-.176 1.152-.487 1.618m-7.681 8.207l6.294-6.294" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Stealth</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stealth Controls</p>
                </TooltipContent>
                </Tooltip>
            </TooltipProvider>
          )}

          {/* Quit Button - Premium Design with Warning State */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="toolbar-btn-premium app-region-no-drag group h-auto px-3 py-2 flex-col min-w-[70px] hover:scale-105 transition-all duration-300 hover:shadow-lg"
                  onClick={() => {
                    try { window.electronAPI.quitApp() } catch {}
                  }}
                  aria-label="Quit MindWhisper AI"
                >
                  <div className="icon-container-premium relative">
                    <IoLogOutOutline className="w-4 h-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12" />
                  </div>
                  <span className="text-xs font-medium group-hover:font-semibold transition-all duration-200">Quit</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Exit MindWhisper AI</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

        </div>

        {/* Audio Result Display - Hidden for now */}
        {false && (
          <div className="mt-4 w-full max-w-md">
            <div className="card p-4 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">Voice Analysis</h4>
                  <p className="text-xs text-black/60">Transcription completed</p>
                </div>
                <button
                  onClick={() => {/* Clear result */}}
                  className="ml-auto btn btn-ghost btn-sm p-1 hover: /10" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}
                  title="Clear result"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="/5 rounded-lg p-3 border border-black/10" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
                <p className="text-sm leading-relaxed">Audio result placeholder</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { QueueCommands as default }

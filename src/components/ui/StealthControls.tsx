// Ultra-Modern Stealth Controls Component
import React, { useState, useEffect } from 'react'
import { Button } from './button'
import { Separator } from './separator'

interface StealthControlsProps {
  onOpacityChange?: (opacity: number) => void
  onStealthModeToggle?: (enabled: boolean) => void
  className?: string
}

const StealthControls: React.FC<StealthControlsProps> = ({
  onOpacityChange,
  onStealthModeToggle,
  className = ""
}) => {
  const [opacity, setOpacity] = useState(95)
  const [stealthMode, setStealthMode] = useState(false)
  const [ultraStealthMode, setUltraStealthMode] = useState(false)

  // Restore saved opacity on mount, if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem('stealth.opacity')
      if (saved != null) {
        const parsed = parseInt(saved, 10)
        if (!Number.isNaN(parsed) && parsed >= 5 && parsed <= 100) {
          setOpacity(parsed)
          // Also apply immediately so the CSS var is set even before user interaction
          const opacityValue = parsed / 100
          document.documentElement.style.setProperty('--stealth-opacity', opacityValue.toString())
          onOpacityChange?.(opacityValue)
        }
      }
      const savedStealth = localStorage.getItem('stealth.mode')
      const savedUltra = localStorage.getItem('stealth.mode.ultra')
      if (savedStealth != null) setStealthMode(savedStealth === '1')
      if (savedUltra != null) setUltraStealthMode(savedUltra === '1')
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update CSS custom property when opacity changes
  useEffect(() => {
    const opacityValue = opacity / 100
    document.documentElement.style.setProperty('--stealth-opacity', opacityValue.toString())
    onOpacityChange?.(opacityValue)
    try {
      localStorage.setItem('stealth.opacity', String(opacity))
    } catch {}
  }, [opacity, onOpacityChange])

  // Apply stealth mode classes
  useEffect(() => {
    const body = document.body
    const app = document.getElementById('root') || document.getElementById('app')
    
    if (ultraStealthMode) {
      body.classList.add('stealth-ultra')
      app?.classList.add('stealth-ultra')
      // Apply undetectable filter adjustments for added stealth
      body.classList.add('undetectable')
      app?.classList.add('undetectable')
    } else if (stealthMode) {
      body.classList.add('stealth-mode')
      app?.classList.add('stealth-mode')
      body.classList.remove('stealth-ultra')
      app?.classList.remove('stealth-ultra')
      // Apply undetectable filter adjustments for added stealth
      body.classList.add('undetectable')
      app?.classList.add('undetectable')
    } else {
      body.classList.remove('stealth-mode', 'stealth-ultra')
      app?.classList.remove('stealth-mode', 'stealth-ultra')
      // Remove undetectable filters when not in stealth
      body.classList.remove('undetectable')
      app?.classList.remove('undetectable')
    }

    onStealthModeToggle?.(stealthMode || ultraStealthMode)
    try {
      localStorage.setItem('stealth.mode', stealthMode ? '1' : '0')
      localStorage.setItem('stealth.mode.ultra', ultraStealthMode ? '1' : '0')
    } catch {}
  }, [stealthMode, ultraStealthMode, onStealthModeToggle])

  const handleOpacityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOpacity(parseInt(event.target.value))
  }

  const toggleStealthMode = () => {
    if (ultraStealthMode) {
      setUltraStealthMode(false)
      setStealthMode(false)
    } else if (stealthMode) {
      setStealthMode(false)
      setUltraStealthMode(true)
    } else {
      setStealthMode(true)
    }
  }

  const quickOpacityPresets = [
    { label: '100%', value: 100 },
    { label: '90%', value: 90 },
    { label: '75%', value: 75 },
    { label: '50%', value: 50 },
    { label: '25%', value: 25 },
    { label: '10%', value: 10 }
  ]

  return (
    <div className={`space-y-6 ${className}`}>
        {/* Premium Transparency Control */}
        <div className="space-y-4 rounded-2xl p-6 border border-white/20 backdrop-blur-xl shadow-xl" style={{backgroundColor: `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.8))`}}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <label className="text-sm font-semibold text-white">
                Transparency Level
              </label>
            </div>
            <span className="text-xs font-mono text-black bg-white px-3 py-1.5 rounded-lg shadow-lg font-semibold">
              {opacity}%
            </span>
          </div>
          
          <div className="relative">
            <input
              type="range"
              min="5"
              max="100"
              value={opacity}
              onChange={handleOpacityChange}
              className="w-full h-3 bg-white/20 rounded-full appearance-none cursor-pointer transition-all duration-300 hover:h-3.5 border border-white/30 shadow-lg"
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.8) 0%, rgba(255,255,255,1) ${opacity}%, rgba(255,255,255,0.2) ${opacity}%, rgba(255,255,255,0.2) 100%)`
              }}
            />
          </div>

          {/* Premium Quick Presets */}
          <div className="grid grid-cols-6 gap-2">
            {quickOpacityPresets.map((preset) => (
              <Button
                key={preset.value}
                variant={opacity === preset.value ? "default" : "ghost"}
                size="sm"
                onClick={() => setOpacity(preset.value)}
                className={`h-9 text-xs px-2 font-semibold transition-all duration-300 hover:scale-105 rounded-xl border shadow-lg ${
                  opacity === preset.value 
                    ? 'bg-white text-black border-white hover:bg-white/90 shadow-white/20' 
                    : 'text-white hover:text-black hover:bg-white border-white/30 hover:border-white'
                }`}
                style={opacity !== preset.value ? {backgroundColor: `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.8))`} : undefined}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Compact Stealth Toggle */}
        <div className="flex items-center justify-between p-4 rounded-2xl border border-white/20 backdrop-blur-xl shadow-xl" style={{backgroundColor: `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.8))`}}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-lg">
              <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L12 12m6.121-6.121A2.98 2.98 0 0119 8c0 .597-.176 1.152-.487 1.618m-7.681 8.207l6.294-6.294" />
              </svg>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-white">
                Stealth Mode
              </label>
              <span className="text-xs text-white/70">
                {ultraStealthMode ? 'Ultra Stealth Active' : stealthMode ? 'Stealth Mode Active' : 'Normal Mode'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {(stealthMode || ultraStealthMode) && (
              <div className="w-3 h-3 bg-white rounded-full animate-pulse shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
            )}
            <Button
              onClick={toggleStealthMode}
              variant={stealthMode || ultraStealthMode ? "default" : "outline"}
              size="sm"
              className={`px-6 py-2 transition-all duration-300 hover:scale-105 rounded-xl border shadow-lg ${
                stealthMode || ultraStealthMode 
                  ? 'bg-white text-black border-white hover:bg-white/90 shadow-white/20' 
                  : 'text-white hover:text-black hover:bg-white border-white/30 hover:border-white'
              }`}
              style={!(stealthMode || ultraStealthMode) ? {backgroundColor: `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.8))`} : undefined}
            >
              Toggle
            </Button>
          </div>
        </div>
    </div>
  )
}

export default StealthControls

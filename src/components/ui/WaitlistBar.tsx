import React, { useState, useRef, useEffect } from 'react'
import { RiCloseLine as X, RiSendPlaneLine as Send, RiMailLine as Mail, RiCheckLine as Check } from "react-icons/ri"
import { Button } from "./button"
import { Input } from "./input"

interface WaitlistBarProps {
  onJoin: (name: string, email: string) => Promise<{ success: boolean; error?: string }>
  onDismiss: () => void
  isVisible: boolean
}

const WaitlistBar: React.FC<WaitlistBarProps> = ({ onJoin, onDismiss, isVisible }) => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus name input when bar becomes visible
  useEffect(() => {
    if (isVisible && nameInputRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus()
      }, 100)
    }
  }, [isVisible])

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError("Please enter your name")
      return
    }

    if (!email.trim()) {
      setError("Please enter your email")
      return
    }

    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address")
      return
    }

    setIsSubmitting(true)
    setError("")

    try {
      console.log('[WaitlistBar] About to call onJoin with:', { name: name.trim(), email: email.trim() })
      const result = await onJoin(name.trim(), email.trim())
      
      if (result.success) {
        setIsSuccess(true)
        setTimeout(() => {
          // The parent component will handle hiding via onWaitlistStatusUpdated
        }, 2000)
      } else {
        setError(result.error || "Failed to join waitlist. Please try again.")
      }
    } catch (err) {
      console.error("Error joining waitlist:", err)
      setError("Network error. Please check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e as any)
    } else if (e.key === 'Escape') {
      onDismiss()
    }
  }

  if (!isVisible) return null

  return (
    <div className="w-full border border-white/20 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-cmd-enter" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          
          {/* Left: Icon + Message */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Mail className="w-5 h-5 text-black" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">Join Premium Waitlist</h3>
              <p className="text-sm text-white/70 leading-relaxed">
                If you liked this application and are okay paying $5/month for unlimited usage with much faster AI models, please join our waitlist. Regular price $15/month.
              </p>
            </div>
          </div>

          {/* Center: Email Form */}
          <div className="flex-shrink-0">
            {isSuccess ? (
              <div className="flex items-center gap-3 px-6 py-3 rounded-xl border shadow-lg" style={{
                backgroundColor: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#000000'
              }}>
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <span className="text-black font-medium">
                  Thanks! You're on the waitlist for $5/month pricing.
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <div className="relative">
                  <Input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (error) setError("")
                    }}
                    onKeyDown={handleKeyPress}
                    placeholder="Your name"
                    disabled={isSubmitting}
                    className="w-32 h-9 text-white placeholder:text-white/50 bg-white/10 border border-white/20 rounded-lg focus:border-white/40 transition-all duration-200"
                  />
                </div>
                <div className="relative">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError("")
                    }}
                    onKeyDown={handleKeyPress}
                    placeholder="your@email.com"
                    disabled={isSubmitting}
                    className="w-48 h-9 text-white placeholder:text-white/50 bg-white/10 border border-white/20 rounded-lg focus:border-white/40 transition-all duration-200"
                  />
                  {error && (
                    <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-white/10 text-white text-xs rounded border border-white/20 whitespace-nowrap z-10">
                      {error}
                    </div>
                  )}
                </div>
                
                <Button
                  type="submit"
                  disabled={isSubmitting || !name.trim() || !email.trim()}
                  className="h-9 px-4 font-medium transition-all duration-200 disabled:opacity-50 border-0"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#000000'
                  }}
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" style={{ color: '#000000' }} />
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Right: Close Button */}
          <div className="flex-shrink-0">
            <Button
              onClick={onDismiss}
              variant="ghost"
              size="sm"
              className="w-10 h-10 p-0 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
export default WaitlistBar

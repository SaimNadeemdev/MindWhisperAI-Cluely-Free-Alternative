import React, { useState, useEffect } from 'react'
import { RiCloseLine, RiTimeLine, RiErrorWarningLine, RiCheckLine } from 'react-icons/ri'
import { Button } from './button'

interface TrialNotificationProps {
  licenseStatus: {
    deviceId: string
    status: "active" | "expired" | "banned" | "unknown"
    trialEndISO: string | null
    serverTimeISO: string | null
    daysLeft: number
    offline: boolean
    message?: string
  }
  onClose: () => void
  onRefresh?: () => void
  onActivate?: () => void
}

const TrialNotification: React.FC<TrialNotificationProps> = ({
  licenseStatus,
  onClose,
  onRefresh,
  onActivate
}) => {
  const [isVisible, setIsVisible] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)

  const handleClose = () => {
    setIsAnimating(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose()
    }, 200)
  }

  // Auto-hide warning notifications after 10 seconds (but not expired/banned)
  useEffect(() => {
    if (licenseStatus.status === "active" && licenseStatus.daysLeft <= 3) {
      const timer = setTimeout(() => {
        handleClose()
      }, 10000) // 10 seconds
      return () => clearTimeout(timer)
    }
  }, [licenseStatus.status, licenseStatus.daysLeft])

  if (!isVisible) return null

  const getNotificationStyle = () => {
    switch (licenseStatus.status) {
      case 'active':
        if (licenseStatus.daysLeft <= 1) {
          return 'bg-red-500/10 border-red-500/30 text-red-200'
        } else if (licenseStatus.daysLeft <= 3) {
          return 'bg-amber-500/10 border-amber-500/30 text-amber-200'
        }
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
      case 'expired':
        return 'bg-red-500/15 border-red-500/40 text-red-200'
      case 'banned':
        return 'bg-red-600/15 border-red-600/40 text-red-200'
      default:
        return 'bg-amber-500/10 border-amber-500/30 text-amber-200'
    }
  }

  const getIcon = () => {
    switch (licenseStatus.status) {
      case 'active':
        if (licenseStatus.daysLeft <= 1) {
          return <RiTimeLine className="w-4 h-4 text-red-400" />
        } else if (licenseStatus.daysLeft <= 3) {
          return <RiTimeLine className="w-4 h-4 text-amber-400" />
        }
        return <RiCheckLine className="w-4 h-4 text-emerald-400" />
      case 'expired':
        return <RiErrorWarningLine className="w-4 h-4 text-red-400" />
      case 'banned':
        return <RiErrorWarningLine className="w-4 h-4 text-red-500" />
      default:
        return <RiErrorWarningLine className="w-4 h-4 text-amber-400" />
    }
  }

  const getMessage = () => {
    switch (licenseStatus.status) {
      case 'active':
        if (licenseStatus.daysLeft <= 1) {
          return `Trial expires in ${licenseStatus.daysLeft} day${licenseStatus.daysLeft === 1 ? '' : 's'}`
        } else if (licenseStatus.daysLeft <= 3) {
          return `${licenseStatus.daysLeft} days left in trial`
        }
        return `Trial active (${licenseStatus.daysLeft} days left)`
      case 'expired':
        return 'Trial expired - Activate to continue'
      case 'banned':
        return 'License banned - Contact support'
      default:
        return 'Unable to verify license'
    }
  }

  // Only show for expired/banned or low days
  const shouldShow = licenseStatus.status === "expired" || 
                   licenseStatus.status === "banned" || 
                   licenseStatus.status === "unknown" ||
                   (licenseStatus.status === "active" && licenseStatus.daysLeft <= 3)

  if (!shouldShow) return null

  return (
    <div 
      className={`fixed top-4 right-4 z-[9998] max-w-sm transition-all duration-300 ${
        isAnimating ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className={`rounded-lg border backdrop-blur-md shadow-lg p-3 ${getNotificationStyle()}`}>
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">
              {getMessage()}
            </p>
            {licenseStatus.offline && (
              <p className="text-xs opacity-70 mt-1">Offline mode</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Refresh button for expired/unknown */}
            {(licenseStatus.status === "expired" || licenseStatus.status === "unknown") && onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="h-6 w-6 p-0 hover:bg-white/10 text-white/70 hover:text-white"
                title="Refresh status"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </Button>
            )}
            
            {/* Activate button for expired/banned */}
            {(licenseStatus.status === "expired" || licenseStatus.status === "banned") && onActivate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onActivate}
                className="h-6 px-2 text-xs font-medium hover:bg-white/10 text-white/90 hover:text-white"
              >
                Activate
              </Button>
            )}
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-6 w-6 p-0 hover:bg-white/10 text-white/50 hover:text-white"
              title="Close notification"
            >
              <RiCloseLine className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TrialNotification

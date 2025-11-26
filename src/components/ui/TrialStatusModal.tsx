import React from 'react'
import { RiErrorWarningLine, RiCheckLine, RiTimeLine, RiGlobalLine } from 'react-icons/ri'
import { Button } from './button'
import { Card, CardContent, CardHeader, CardTitle } from './card'

interface TrialStatusModalProps {
  licenseStatus: {
    deviceId: string
    status: "active" | "expired" | "banned" | "unknown"
    trialEndISO: string | null
    serverTimeISO: string | null
    daysLeft: number
    offline: boolean
    message?: string
  }
  onClose?: () => void
  onRefresh?: () => void
  onActivate?: () => void
  isBlocking?: boolean // If true, modal cannot be closed
}

const TrialStatusModal: React.FC<TrialStatusModalProps> = ({
  licenseStatus,
  onClose,
  onRefresh,
  onActivate,
  isBlocking = false
}) => {
  const getStatusIcon = () => {
    switch (licenseStatus.status) {
      case 'active':
        return <RiCheckLine className="w-8 h-8 text-emerald-400" />
      case 'expired':
        return <RiTimeLine className="w-8 h-8 text-red-400" />
      case 'banned':
        return <RiErrorWarningLine className="w-8 h-8 text-red-500" />
      default:
        return <RiErrorWarningLine className="w-8 h-8 text-amber-400" />
    }
  }

  const getStatusTitle = () => {
    switch (licenseStatus.status) {
      case 'active':
        return 'Trial Active'
      case 'expired':
        return 'Trial Expired'
      case 'banned':
        return 'License Banned'
      default:
        return 'License Status Unknown'
    }
  }

  const getStatusMessage = () => {
    switch (licenseStatus.status) {
      case 'active':
        return `Your free trial is active with ${licenseStatus.daysLeft} day${licenseStatus.daysLeft === 1 ? '' : 's'} remaining.`
      case 'expired':
        return 'Your free trial has ended. Please activate your license to continue using MindWhisper AI.'
      case 'banned':
        return 'Your license has been banned. Please contact support for assistance.'
      default:
        return 'Unable to verify your license status. Please check your internet connection and try again.'
    }
  }

  const getStatusColor = () => {
    switch (licenseStatus.status) {
      case 'active':
        return 'border-emerald-500/30 bg-emerald-500/5'
      case 'expired':
        return 'border-red-500/30 bg-red-500/5'
      case 'banned':
        return 'border-red-600/30 bg-red-600/5'
      default:
        return 'border-amber-500/30 bg-amber-500/5'
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center /80 backdrop-blur-sm" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
      <Card className={`w-full max-w-md mx-4 ${getStatusColor()} border-2 shadow-2xl`}>
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle className="text-xl font-bold text-white">
            {getStatusTitle()}
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Status Message */}
          <div className="text-center">
            <p className="text-white/90 leading-relaxed">
              {getStatusMessage()}
            </p>
            {licenseStatus.message && (
              <p className="text-white/70 text-sm mt-2">
                {licenseStatus.message}
              </p>
            )}
          </div>

          {/* Status Details */}
          <div className="/20 rounded-lg p-4 space-y-2" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/70">Status:</span>
              <span className={`font-semibold ${
                licenseStatus.status === 'active' ? 'text-emerald-400' : 
                licenseStatus.status === 'expired' ? 'text-red-400' : 
                licenseStatus.status === 'banned' ? 'text-red-500' : 'text-amber-400'
              }`}>
                {licenseStatus.status.charAt(0).toUpperCase() + licenseStatus.status.slice(1)}
              </span>
            </div>
            
            {licenseStatus.status === 'active' && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/70">Days Remaining:</span>
                <span className="text-white font-semibold">{licenseStatus.daysLeft}</span>
              </div>
            )}
            
            {licenseStatus.trialEndISO && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/70">Trial Ends:</span>
                <span className="text-white/90 font-mono text-xs">
                  {new Date(licenseStatus.trialEndISO).toLocaleDateString()}
                </span>
              </div>
            )}
            
            {licenseStatus.offline && (
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <RiGlobalLine className="w-4 h-4" />
                <span>Offline Mode</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {onRefresh && (
              <Button
                variant="outline"
                onClick={onRefresh}
                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30"
              >
                Refresh Status
              </Button>
            )}
            
            {licenseStatus.status !== 'active' && onActivate && (
              <Button
                onClick={onActivate}
                className="flex-1 bg-white text-black hover:bg-white/90 font-semibold"
              >
                Activate License
              </Button>
            )}
            
            {!isBlocking && onClose && licenseStatus.status === 'active' && (
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30"
              >
                Continue
              </Button>
            )}
          </div>

          {/* Warning for expired/banned */}
          {(licenseStatus.status === 'expired' || licenseStatus.status === 'banned') && (
            <div className="text-center">
              <p className="text-white/60 text-xs">
                Some features may be limited until activation
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TrialStatusModal

import React, { useState, useEffect } from 'react'
import WaitlistBar from './WaitlistBar'

interface WaitlistIntegrationProps {
  onToastMessage: (message: { title: string; description: string; variant: "success" | "error" | "neutral" }) => void
  onToastOpen: (open: boolean) => void
}

const WaitlistIntegration: React.FC<WaitlistIntegrationProps> = ({ onToastMessage, onToastOpen }) => {
  const [waitlistStatus, setWaitlistStatus] = useState<{
    hasJoined: boolean
    email?: string
    name?: string
    joinedAt?: string
    shouldShowBar: boolean
  } | null>(null)

  // Load waitlist status on mount
  useEffect(() => {
    console.log('[WaitlistIntegration] 🎯 Initializing waitlist')
    
    if (!window.electronAPI?.getWaitlistStatus) {
      console.error('[WaitlistIntegration] ❌ Waitlist API not available!')
      return
    }

    // Load initial waitlist status
    const loadWaitlistStatus = async () => {
      try {
        const status = await window.electronAPI.getWaitlistStatus()
        console.log('[WaitlistIntegration] 📧 Initial waitlist status:', status)
        setWaitlistStatus(status)
      } catch (error) {
        console.error('[WaitlistIntegration] ❌ Failed to load waitlist status:', error)
        setWaitlistStatus({ hasJoined: false, shouldShowBar: false })
      }
    }

    loadWaitlistStatus()

    // Listen for waitlist status updates
    const waitlistCleanup = window.electronAPI.onWaitlistStatusUpdated?.((status: any) => {
      console.log('[WaitlistIntegration] 📧 Waitlist status updated:', status)
      setWaitlistStatus(status)
    })

    return () => {
      waitlistCleanup?.()
    }
  }, [])

  // Waitlist handlers
  const handleJoinWaitlist = async (name: string, email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[WaitlistIntegration] 📧 Received parameters:', { name, email, nameType: typeof name, emailType: typeof email })
      console.log('[WaitlistIntegration] 📧 Attempting to join waitlist:', { name, email })
      
      if (!window.electronAPI?.joinWaitlist) {
        return { success: false, error: "Waitlist functionality not available" }
      }
      
      const result = await window.electronAPI.joinWaitlist(name, email)
      
      if (result.success) {
        console.log('[WaitlistIntegration] ✅ Successfully joined waitlist')
        // Show success toast
        onToastMessage({
          title: "Thanks for joining!",
          description: "You're now on the waitlist for $5/month unlimited usage with faster AI models. We'll email you when it's ready!",
          variant: "success"
        })
        onToastOpen(true)
      } else {
        console.error('[WaitlistIntegration] ❌ Failed to join waitlist:', result.error)
      }
      
      return result
    } catch (error) {
      console.error('[WaitlistIntegration] ❌ Error joining waitlist:', error)
      return { success: false, error: "Network error. Please try again." }
    }
  }

  const handleDismissWaitlist = async () => {
    try {
      console.log('[WaitlistIntegration] 🚫 Dismissing waitlist')
      
      if (!window.electronAPI?.dismissWaitlist) {
        console.error('[WaitlistIntegration] ❌ Dismiss waitlist API not available')
        return
      }
      
      await window.electronAPI.dismissWaitlist()
      console.log('[WaitlistIntegration] ✅ Waitlist dismissed successfully')
    } catch (error) {
      console.error('[WaitlistIntegration] ❌ Error dismissing waitlist:', error)
    }
  }

  // Only render if we should show the bar
  if (!waitlistStatus?.shouldShowBar) {
    return null
  }

  return (
    <WaitlistBar
      onJoin={handleJoinWaitlist}
      onDismiss={handleDismissWaitlist}
      isVisible={waitlistStatus.shouldShowBar}
    />
  )
}

export default WaitlistIntegration

import { app } from "electron"
import crypto from "crypto"
import fs from "fs"
import path from "path"

export type WaitlistEntry = {
  email: string
  deviceId: string
  timestamp: string // ISO timestamp
  source: string // 'waitlist_bar'
  userData?: {
    platform: string
    appVersion: string
  }
}

export type WaitlistStatus = {
  hasJoined: boolean
  email?: string
  joinedAt?: string
  deviceId: string
}

/**
 * WaitlistManager: Handles email collection for paid subscription waitlist
 * Tracks device ID to prevent duplicate entries and remember user preferences
 */
export class WaitlistManager {
  private waitlistEntries: WaitlistEntry[] = []
  private deviceId: string | null = null
  private userJoinedWaitlist: boolean = false
  private userDismissedWaitlist: boolean = false

  // Persistence paths
  private waitlistDataPath = path.join(app.getPath('userData'), 'waitlist-entries.json')
  private waitlistStatusPath = path.join(app.getPath('userData'), 'waitlist-status.json')

  constructor() {}

  async init(): Promise<void> {
    // Generate consistent device ID (reuse from LicenseManager pattern)
    this.deviceId = await this.computeDeviceId()
    
    // Load existing waitlist data
    await this.loadWaitlistData()
    await this.loadWaitlistStatus()
    
    console.log("[WaitlistManager] Initialized:", {
      deviceId: this.deviceId,
      hasJoined: this.userJoinedWaitlist,
      hasDismissed: this.userDismissedWaitlist,
      totalEntries: this.waitlistEntries.length
    })
  }

  private async computeDeviceId(): Promise<string> {
    try {
      // Use same device fingerprinting as LicenseManager for consistency
      const os = require('os')
      const platform = os.platform()
      const arch = os.arch()
      const cpus = os.cpus()
      const hostname = os.hostname()
      const homedir = os.homedir()
      
      // Create a stable fingerprint
      const fingerprint = [
        platform,
        arch,
        hostname,
        homedir,
        cpus.length.toString(),
        cpus[0]?.model || 'unknown'
      ].join('|')
      
      const hash = crypto.createHash('sha256').update(fingerprint).digest('hex')
      return hash.substring(0, 32) // 32 char device ID
    } catch (error) {
      console.error("[WaitlistManager] Error computing device ID:", error)
      // Fallback to random ID (will be different each time)
      return crypto.randomBytes(16).toString('hex')
    }
  }

  private async loadWaitlistData(): Promise<void> {
    try {
      if (fs.existsSync(this.waitlistDataPath)) {
        const data = fs.readFileSync(this.waitlistDataPath, 'utf8')
        this.waitlistEntries = JSON.parse(data) || []
      }
    } catch (error) {
      console.error("[WaitlistManager] Error loading waitlist data:", error)
      this.waitlistEntries = []
    }
  }

  private async loadWaitlistStatus(): Promise<void> {
    try {
      if (fs.existsSync(this.waitlistStatusPath)) {
        const data = fs.readFileSync(this.waitlistStatusPath, 'utf8')
        const status = JSON.parse(data)
        
        // Only load status if it matches current device
        if (status.deviceId === this.deviceId) {
          this.userJoinedWaitlist = status.hasJoined || false
          this.userDismissedWaitlist = status.hasDismissed || false
        }
      }
    } catch (error) {
      console.error("[WaitlistManager] Error loading waitlist status:", error)
      this.userJoinedWaitlist = false
      this.userDismissedWaitlist = false
    }
  }

  private async saveWaitlistData(): Promise<void> {
    try {
      const userData = app.getPath('userData')
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true })
      }
      
      fs.writeFileSync(
        this.waitlistDataPath, 
        JSON.stringify(this.waitlistEntries, null, 2), 
        'utf8'
      )
    } catch (error) {
      console.error("[WaitlistManager] Error saving waitlist data:", error)
      throw error
    }
  }

  private async saveWaitlistStatus(): Promise<void> {
    try {
      const userData = app.getPath('userData')
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true })
      }
      
      const status = {
        deviceId: this.deviceId,
        hasJoined: this.userJoinedWaitlist,
        hasDismissed: this.userDismissedWaitlist,
        lastUpdated: new Date().toISOString()
      }
      
      fs.writeFileSync(
        this.waitlistStatusPath, 
        JSON.stringify(status, null, 2), 
        'utf8'
      )
    } catch (error) {
      console.error("[WaitlistManager] Error saving waitlist status:", error)
      throw error
    }
  }

  public async joinWaitlist(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return { success: false, error: "Invalid email format" }
      }

      if (!this.deviceId) {
        return { success: false, error: "Device ID not available" }
      }

      // Check if this device has already joined
      if (this.userJoinedWaitlist) {
        return { success: false, error: "Device has already joined waitlist" }
      }

      // Check if this email already exists (optional - you might want to allow same email from different devices)
      const existingEntry = this.waitlistEntries.find(entry => 
        entry.email.toLowerCase() === email.toLowerCase()
      )
      
      if (existingEntry) {
        console.log("[WaitlistManager] Email already exists in waitlist, but allowing from new device")
      }

      // Create new waitlist entry
      const newEntry: WaitlistEntry = {
        email: email.toLowerCase().trim(),
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
        source: 'waitlist_bar',
        userData: {
          platform: process.platform,
          appVersion: app.getVersion()
        }
      }

      // Add to entries
      this.waitlistEntries.push(newEntry)
      
      // Mark user as joined
      this.userJoinedWaitlist = true
      
      // Save both data and status
      await this.saveWaitlistData()
      await this.saveWaitlistStatus()

      console.log("[WaitlistManager] Successfully added to waitlist:", {
        email: email,
        deviceId: this.deviceId,
        totalEntries: this.waitlistEntries.length
      })

      return { success: true }
    } catch (error) {
      console.error("[WaitlistManager] Error joining waitlist:", error)
      return { success: false, error: error.message }
    }
  }

  public async dismissWaitlist(): Promise<void> {
    try {
      this.userDismissedWaitlist = true
      await this.saveWaitlistStatus()
      
      console.log("[WaitlistManager] User dismissed waitlist:", {
        deviceId: this.deviceId
      })
    } catch (error) {
      console.error("[WaitlistManager] Error dismissing waitlist:", error)
      throw error
    }
  }

  public getWaitlistStatus(): WaitlistStatus {
    const joinedEntry = this.waitlistEntries.find(entry => entry.deviceId === this.deviceId)
    
    return {
      hasJoined: this.userJoinedWaitlist,
      email: joinedEntry?.email,
      joinedAt: joinedEntry?.timestamp,
      deviceId: this.deviceId || ""
    }
  }

  public shouldShowWaitlistBar(): boolean {
    // Don't show if user has already joined or dismissed
    return !this.userJoinedWaitlist && !this.userDismissedWaitlist
  }

  public getWaitlistStats(): { totalEntries: number; uniqueEmails: number; uniqueDevices: number } {
    const uniqueEmails = new Set(this.waitlistEntries.map(e => e.email)).size
    const uniqueDevices = new Set(this.waitlistEntries.map(e => e.deviceId)).size
    
    return {
      totalEntries: this.waitlistEntries.length,
      uniqueEmails,
      uniqueDevices
    }
  }

  public exportWaitlistData(): WaitlistEntry[] {
    // Return copy to prevent external modification
    return JSON.parse(JSON.stringify(this.waitlistEntries))
  }
}

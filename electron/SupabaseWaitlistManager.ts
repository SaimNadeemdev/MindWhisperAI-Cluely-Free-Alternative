import { app } from "electron"
import crypto from "crypto"
import fs from "fs"
import path from "path"
import os from "os"
import { execFile } from "child_process"

export type WaitlistEntry = {
  name: string
  email: string
  timestamp: string // ISO timestamp
  source: string // 'waitlist_bar'
}

export type WaitlistStatus = {
  hasJoined: boolean
  email?: string
  name?: string
  joinedAt?: string
}

/**
 * SupabaseWaitlistManager: Handles email collection for paid subscription waitlist
 * Uses Supabase for centralized storage across all users and devices
 */
export class SupabaseWaitlistManager {
  private deviceId: string | null = null
  private userJoinedWaitlist: boolean = false
  private userDismissedWaitlist: boolean = false
  private lastJoinedEmail: string | null = null

  // Supabase configuration (separate from license system)
  private supabaseUrl = process.env.SUPABASE_URL || ""
  private supabaseKey = process.env.SUPABASE_ANON_KEY || ""
  
  // Local status persistence (only for UI state, not actual data)
  private waitlistStatusPath = path.join(app.getPath('userData'), 'waitlist-status.json')

  constructor() {}

  async init(): Promise<void> {
    // Refresh env values at runtime (separate from license system)
    this.supabaseUrl = process.env.SUPABASE_URL || this.supabaseUrl || ""
    this.supabaseKey = process.env.SUPABASE_ANON_KEY || this.supabaseKey || ""
    
    console.log("[SupabaseWaitlistManager] Initializing with config:", {
      hasUrl: !!this.supabaseUrl,
      hasKey: !!this.supabaseKey,
      urlPrefix: this.supabaseUrl ? this.supabaseUrl.substring(0, 20) + "..." : "none"
    })
    
    // Generate consistent device ID
    this.deviceId = await this.computeDeviceId()
    
    // Load local UI status (not the actual waitlist data)
    await this.loadLocalStatus()
    
    console.log("[SupabaseWaitlistManager] Initialized:", {
      deviceId: this.deviceId,
      hasJoined: this.userJoinedWaitlist,
      hasDismissed: this.userDismissedWaitlist
    })
  }

  private async computeDeviceId(): Promise<string> {
    try {
      // Use EXACT same device fingerprinting as LicenseManager for consistency
      const parts: string[] = []

      // OS basics
      parts.push(os.platform(), os.arch(), os.hostname())

      // Windows MachineGuid
      try {
        const machineGuid = await this.readRegistryHKLM("SOFTWARE\\Microsoft\\Cryptography", "MachineGuid")
        if (machineGuid) parts.push(machineGuid)
      } catch {}

      // BIOS UUID via wmic
      try {
        const uuid = await this.execGetStdout("wmic", ["csproduct", "get", "uuid"])
        if (uuid) parts.push(uuid)
      } catch {}

      // Volume serial via wmic
      try {
        const vol = await this.execGetStdout("wmic", ["logicaldisk", "where", "DeviceID='C:'", "get", "VolumeSerialNumber"])
        if (vol) parts.push(vol)
      } catch {}

      const raw = parts.join("|")
      const hash = crypto.createHash("sha256").update(raw).digest("hex")
      return hash // Full hash like license system
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error computing device ID:", error)
      // Fallback to random ID (will be different each time)
      return crypto.randomBytes(16).toString('hex')
    }
  }

  // Check if email already exists in database
  private async checkEmailExists(email: string): Promise<boolean> {
    try {
      if (!this.supabaseUrl || !this.supabaseKey) {
        console.warn("[SupabaseWaitlistManager] Cannot check email - Supabase not configured")
        return false
      }

      const response = await fetch(`${this.supabaseUrl}/rest/v1/waitlist_entries?email=eq.${encodeURIComponent(email)}&select=id`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const exists = Array.isArray(data) && data.length > 0
        console.log(`[SupabaseWaitlistManager] Email check for ${email}: ${exists ? 'EXISTS' : 'NOT FOUND'}`)
        return exists
      } else {
        console.error("[SupabaseWaitlistManager] Error checking email:", response.status, response.statusText)
        return false // If we can't check, allow registration
      }
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error checking email existence:", error)
      return false // If we can't check, allow registration
    }
  }

  // Utility methods copied from LicenseManager
  private execGetStdout(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { windowsHide: true }, (err, stdout) => {
        if (err) return reject(err)
        const s = String(stdout || "").replace(/\r/g, "").trim().split("\n").map(x => x.trim()).filter(Boolean).slice(-1)[0] || ""
        resolve(s)
      })
    })
  }

  private readRegistryHKLM(key: string, name: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile("reg", ["query", `HKLM\\${key}`, "/v", name], { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null)
        const m = String(stdout).match(/\sREG_\w+\s+(.*)$/m)
        resolve(m ? m[1].trim() : null)
      })
    })
  }

  private async loadLocalStatus(): Promise<void> {
    try {
      if (fs.existsSync(this.waitlistStatusPath)) {
        const data = fs.readFileSync(this.waitlistStatusPath, 'utf8')
        const status = JSON.parse(data)
        
        // Load local UI state
        this.userJoinedWaitlist = status.hasJoined || false
        this.userDismissedWaitlist = status.hasDismissed || false
        this.lastJoinedEmail = status.lastJoinedEmail || null
      }
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error loading local status:", error)
      this.userJoinedWaitlist = false
      this.userDismissedWaitlist = false
    }
  }

  private async saveLocalStatus(): Promise<void> {
    try {
      const userData = app.getPath('userData')
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true })
      }
      
      const status = {
        hasJoined: this.userJoinedWaitlist,
        hasDismissed: this.userDismissedWaitlist,
        lastJoinedEmail: this.lastJoinedEmail,
        deviceId: this.deviceId,
        lastUpdated: new Date().toISOString()
      }
      
      fs.writeFileSync(
        this.waitlistStatusPath, 
        JSON.stringify(status, null, 2), 
        'utf8'
      )
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error saving local status:", error)
      throw error
    }
  }

  public async joinWaitlist(name: string, email: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("[SupabaseWaitlistManager] joinWaitlist called with:", { name, email, nameType: typeof name, emailType: typeof email })
      
      // Validate parameters
      if (!name || typeof name !== 'string') {
        return { success: false, error: "Name is required" }
      }
      if (!email || typeof email !== 'string') {
        return { success: false, error: "Email is required" }
      }
      
      // Validate and sanitize email
      const sanitizedEmail = email.toLowerCase().trim()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(sanitizedEmail)) {
        return { success: false, error: "Invalid email format" }
      }

      // Additional security: check email length
      if (sanitizedEmail.length > 254) {
        return { success: false, error: "Email address too long" }
      }

      // Validate and sanitize name
      const sanitizedName = name.trim()
      if (!sanitizedName) {
        return { success: false, error: "Name is required" }
      }
      if (sanitizedName.length > 255) {
        return { success: false, error: "Name too long" }
      }

      // Check if email already exists in database
      const emailExists = await this.checkEmailExists(sanitizedEmail)
      if (emailExists) {
        return { success: false, error: "This email is already registered on our waitlist" }
      }

      if (!this.supabaseUrl || !this.supabaseKey) {
        return { success: false, error: "Waitlist service not configured" }
      }

      // Create waitlist entry for Supabase
      const waitlistEntry: WaitlistEntry = {
        name: sanitizedName,
        email: sanitizedEmail,
        timestamp: new Date().toISOString(),
        source: 'waitlist_bar'
      }

      // Send to Supabase with retry logic
      const success = await this.sendToSupabaseWithRetry(waitlistEntry, 3)
      
      if (success) {
        // Mark user as joined locally (for UI state only - this email specifically)
        this.userJoinedWaitlist = true
        this.lastJoinedEmail = sanitizedEmail // Track which email was used
        await this.saveLocalStatus()

        console.log("[SupabaseWaitlistManager] Successfully added to waitlist:", {
          name: sanitizedName,
          email: sanitizedEmail
        })

        return { success: true }
      } else {
        return { success: false, error: "Failed to save to waitlist database" }
      }
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error joining waitlist:", error)
      return { success: false, error: error.message }
    }
  }

  private async sendToSupabaseWithRetry(entry: WaitlistEntry, maxRetries: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[SupabaseWaitlistManager] Attempt ${attempt}/${maxRetries} to send to Supabase`)
      
      const success = await this.sendToSupabase(entry)
      if (success) {
        return true
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // Max 5 second delay
        console.log(`[SupabaseWaitlistManager] Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    console.error(`[SupabaseWaitlistManager] Failed to send to Supabase after ${maxRetries} attempts`)
    return false
  }

  private async sendToSupabase(entry: WaitlistEntry): Promise<boolean> {
    try {
      console.log("[SupabaseWaitlistManager] Sending to Supabase:", {
        url: this.supabaseUrl,
        hasKey: !!this.supabaseKey,
        name: entry.name,
        email: entry.email
      })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch(`${this.supabaseUrl}/rest/v1/waitlist_entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          name: entry.name,
          email: entry.email
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        console.log("[SupabaseWaitlistManager] Successfully saved to Supabase")
        return true
      } else {
        const errorText = await response.text()
        console.error("[SupabaseWaitlistManager] Supabase error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        return false
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error("[SupabaseWaitlistManager] Request timeout sending to Supabase")
      } else {
        console.error("[SupabaseWaitlistManager] Network error sending to Supabase:", error)
      }
      return false
    }
  }

  public async dismissWaitlist(): Promise<void> {
    try {
      this.userDismissedWaitlist = true
      await this.saveLocalStatus()
      
      console.log("[SupabaseWaitlistManager] User dismissed waitlist:", {
        deviceId: this.deviceId
      })
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error dismissing waitlist:", error)
      throw error
    }
  }

  public getWaitlistStatus(): WaitlistStatus {
    return {
      hasJoined: this.userJoinedWaitlist
    }
  }

  public shouldShowWaitlistBar(): boolean {
    // Don't show if user has already joined or dismissed
    return !this.userJoinedWaitlist && !this.userDismissedWaitlist
  }


  // Admin method to get stats from Supabase (optional)
  public async getWaitlistStats(): Promise<{ totalEntries: number; uniqueEmails: number; uniqueDevices: number }> {
    try {
      if (!this.supabaseUrl || !this.supabaseKey) {
        return { totalEntries: 0, uniqueEmails: 0, uniqueDevices: 0 }
      }

      // Get total entries
      const totalResponse = await fetch(`${this.supabaseUrl}/rest/v1/waitlist_entries?select=count`, {
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`
        }
      })

      const totalData = await totalResponse.json()
      const totalEntries = totalData?.[0]?.count || 0

      // For now, return basic stats (can be enhanced with more complex queries)
      return {
        totalEntries,
        uniqueEmails: totalEntries, // Simplified for now
        uniqueDevices: totalEntries // Simplified for now
      }
    } catch (error) {
      console.error("[SupabaseWaitlistManager] Error getting stats:", error)
      return { totalEntries: 0, uniqueEmails: 0, uniqueDevices: 0 }
    }
  }
}

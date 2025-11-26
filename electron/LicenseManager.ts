import { app } from "electron"
import crypto from "crypto"
import os from "os"
import fs from "fs"
import path from "path"
import { execFile } from "child_process"

export type LicenseStatus = {
  deviceId: string
  status: "active" | "expired" | "banned" | "unknown"
  trialEndISO: string | null
  serverTimeISO: string | null
  daysLeft: number
  offline: boolean
  message?: string
}

export type LicenseToken = {
  device_id: string
  trial_end: string // ISO
  issued_at: string // ISO
  server_time: string // ISO
  status: "active" | "expired" | "banned" | "unknown"
  sig: string // server signature (opaque)
  version?: number
}

/**
 * LicenseManager: Handles device fingerprinting, remote verification via Supabase Edge Functions,
 * caching a signed token redundantly, and providing status gating to IPC handlers.
 */
export class LicenseManager {
  private token: LicenseToken | null = null
  private deviceId: string | null = null
  private lastStatus: LicenseStatus | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private mainWindow: Electron.BrowserWindow | null = null

  // Config via env
  private apiBase = process.env.LICENSE_API_BASE || process.env.SUPABASE_EDGE_URL || ""
  private apiKey = process.env.LICENSE_API_KEY || process.env.SUPABASE_ANON_KEY || ""
  private registerPath = process.env.LICENSE_REGISTER_PATH || "/license-register"
  private verifyPath = process.env.LICENSE_VERIFY_PATH || "/license-verify"
  private trialDays = Number(process.env.TRIAL_DAYS || 7)
  private offlineGraceHours = Number(process.env.OFFLINE_GRACE_HOURS || 24)

  // Persistence targets
  private programDataDir = path.join(process.env.ProgramData || "C:/ProgramData", "MindWhisperAI")
  private programDataFile = path.join(this.programDataDir, "license.json")

  constructor() {}

  setMainWindow(window: Electron.BrowserWindow | null) {
    this.mainWindow = window
  }

  async init(): Promise<void> {
    // Refresh env values at runtime in case other parts loaded .env later
    this.apiBase = process.env.LICENSE_API_BASE || process.env.SUPABASE_EDGE_URL || this.apiBase || ""
    this.apiKey = process.env.LICENSE_API_KEY || process.env.SUPABASE_ANON_KEY || this.apiKey || ""
    this.registerPath = process.env.LICENSE_REGISTER_PATH || this.registerPath
    this.verifyPath = process.env.LICENSE_VERIFY_PATH || this.verifyPath
    // Small debug to help diagnose env
    try {
      console.log("[LicenseManager] Env check:", {
        hasApiBase: !!this.apiBase,
        apiBase: this.apiBase,
        hasApiKey: !!this.apiKey,
        apiKeyPrefix: this.apiKey ? (this.apiKey.substring(0, 8) + "...") : "",
        registerPath: this.registerPath,
        verifyPath: this.verifyPath
      })
    } catch {}
    this.deviceId = await this.computeDeviceId()
    await this.loadCachedToken()
    await this.registerOrVerify()
    this.scheduleHeartbeat()
  }

  getStatus(): LicenseStatus {
    const now = new Date()
    const deviceId = this.deviceId || ""

    if (!this.token) {
      return {
        deviceId,
        status: "unknown",
        trialEndISO: null,
        serverTimeISO: null,
        daysLeft: 0,
        offline: true,
        message: "No token yet"
      }
    }

    const trialEnd = new Date(this.token.trial_end)
    const serverNow = this.token.server_time ? new Date(this.token.server_time) : now
    const msLeft = trialEnd.getTime() - now.getTime() // Use local time for expiration check
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))

    // Override token status if we can determine it's expired locally
    let actualStatus = this.token.status
    if (now > trialEnd && this.token.status === "active") {
      actualStatus = "expired"
      console.warn("[LicenseManager] Token claims active but is expired locally", {
        now: now.toISOString(),
        trialEnd: trialEnd.toISOString(),
        tokenStatus: this.token.status,
        actualStatus
      })
    }

    console.log("[LicenseManager] getStatus() result:", {
      status: actualStatus,
      daysLeft,
      offline: this.token.sig === "offline" || this.token.sig === "dev",
      trialEnd: trialEnd.toISOString(),
      now: now.toISOString()
    })

    const status: LicenseStatus = {
      deviceId,
      status: actualStatus,
      trialEndISO: this.token.trial_end,
      serverTimeISO: this.token.server_time,
      daysLeft,
      offline: this.token.sig === "offline" || this.token.sig === "dev"
    }

    // Notify renderer if status changed
    if (this.lastStatus && this.mainWindow && 
        (this.lastStatus.status !== status.status || this.lastStatus.daysLeft !== status.daysLeft)) {
      try {
        this.mainWindow.webContents.send('license-status-updated', status)
      } catch {}
    }

    this.lastStatus = status
    return status
  }

  /** Throws error if license is not active anymore (after grace). */
  ensureLicensed(): void {
    const st = this.getStatus()
    if (st.status === "banned") {
      throw new Error("License banned")
    }
    if (st.status === "expired") {
      throw new Error("Trial expired")
    }
  }

  async forceVerify(): Promise<LicenseStatus> {
    await this.registerOrVerify(true)
    return this.getStatus()
  }

  dispose() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
  }

  // ----------------- Core flows -----------------
  private scheduleHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    // Every 12 hours
    this.heartbeatTimer = setInterval(() => {
      this.registerOrVerify().catch(() => {})
    }, 12 * 60 * 60 * 1000)
  }

  private async registerOrVerify(force = false): Promise<void> {
    if (!this.apiBase || !this.apiKey) {
      // Verbose diagnostics so users can see exactly what's missing
      try {
        console.warn("[LicenseManager] Missing licensing env. Running in unknown license mode. Details:", {
          LICENSE_API_BASE: process.env.LICENSE_API_BASE,
          SUPABASE_EDGE_URL: process.env.SUPABASE_EDGE_URL,
          hasApiBase: !!(process.env.LICENSE_API_BASE || process.env.SUPABASE_EDGE_URL),
          LICENSE_API_KEY_prefix: process.env.LICENSE_API_KEY ? (process.env.LICENSE_API_KEY.substring(0, 12) + "...") : "",
          SUPABASE_ANON_KEY_prefix: process.env.SUPABASE_ANON_KEY ? (process.env.SUPABASE_ANON_KEY.substring(0, 12) + "...") : "",
          hasApiKey: !!(process.env.LICENSE_API_KEY || process.env.SUPABASE_ANON_KEY),
          cwd: process.cwd(),
          __dirname,
          resourcesPath: (process as any).resourcesPath || "",
          userDataPath: (()=>{ try { return app.getPath("userData") } catch { return "" } })(),
        })
      } catch {}
      // Fallback: synthetic token for dev so UI has something to show
      if (!this.token) {
        const now = new Date()
        const end = new Date(now.getTime() + this.trialDays * 24 * 60 * 60 * 1000)
        this.token = {
          device_id: this.deviceId || "dev",
          issued_at: now.toISOString(),
          trial_end: end.toISOString(),
          server_time: now.toISOString(),
          status: "active",
          sig: "dev"
        }
        try {
          console.warn("[LicenseManager] Created DEV token due to missing env")
        } catch {}
      }
      await this.saveToken()
      return
    }

    const hasToken = !!this.token
    let path = hasToken && !force ? this.verifyPath : this.registerPath
    let url = `${this.apiBase}${path}`

    const body: any = { device_id: this.deviceId }
    if (hasToken) body.token = this.token

    try {
      console.log("[LicenseManager] Calling endpoint", {
        url,
        hasToken,
        force,
        deviceId: this.deviceId?.slice(0, 12) + "..."
      })
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "<no-body>")
        console.error("[LicenseManager] Endpoint error", { status: res.status, text: text?.slice(0, 300) })
        
        // If verify failed with 404 (device not found), try to register instead
        if (res.status === 404 && path === this.verifyPath) {
          console.log("[LicenseManager] Device not found, trying to register instead...")
          path = this.registerPath
          url = `${this.apiBase}${path}`
          
          const registerRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({ device_id: this.deviceId }) // Don't send token for registration
          })
          
          if (!registerRes.ok) {
            const registerText = await registerRes.text().catch(() => "<no-body>")
            console.error("[LicenseManager] Registration also failed", { status: registerRes.status, text: registerText?.slice(0, 300) })
            throw new Error(`HTTP ${registerRes.status}`)
          }
          
          const registerData = await registerRes.json()
          if (registerData?.token) {
            this.token = registerData.token as LicenseToken
            await this.saveToken()
            console.log("[LicenseManager] Successfully registered new device")
            return
          }
        }
        
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      // Expect { token, status }
      if (data?.token) {
        this.token = data.token as LicenseToken
        await this.saveToken()
      }
    } catch (e) {
      console.warn("[LicenseManager] verify/register failed: ", (e as Error).message)
      // Offline: keep existing token; allow grace up to offlineGraceHours
      if (!this.token) {
        // create a short-lived local token for UX; server will correct later
        const now = new Date()
        const end = new Date(now.getTime() + Math.min(this.trialDays, 1) * 24 * 60 * 60 * 1000)
        this.token = {
          device_id: this.deviceId || "offline",
          issued_at: now.toISOString(),
          trial_end: end.toISOString(),
          server_time: now.toISOString(),
          status: "unknown", // Mark as unknown when server is unavailable
          sig: "offline"
        }
        await this.saveToken()
      } else {
        // If we have an existing token, check if it's actually expired based on local time
        const now = new Date()
        const trialEnd = new Date(this.token.trial_end)
        if (now > trialEnd) {
          // Token is expired, update status
          this.token.status = "expired"
          await this.saveToken()
          console.warn("[LicenseManager] Cached token is expired, marking as expired")
        } else {
          console.warn("[LicenseManager] Using cached token, server unavailable")
        }
      }
    }
  }

  // ----------------- Persistence -----------------
  private async loadCachedToken(): Promise<void> {
    // 1) ProgramData file
    try {
      const buf = await fs.promises.readFile(this.programDataFile, "utf8")
      const json = JSON.parse(buf)
      if (json?.token?.device_id) {
        this.token = json.token
        return
      }
    } catch {}

    // 2) userData fallback
    try {
      const p = path.join(app.getPath("userData"), "license.json")
      const buf = await fs.promises.readFile(p, "utf8")
      const json = JSON.parse(buf)
      if (json?.token?.device_id) {
        this.token = json.token
        // rehydrate ProgramData cache
        await this.writeProgramData({ token: this.token })
        return
      }
    } catch {}

    // 3) Registry HKCU fallback (best effort)
    try {
      const regVal = await this.readRegistryHKCU("Software\\MindWhisperAI", "LicenseToken")
      if (regVal) {
        const json = JSON.parse(regVal)
        if (json?.token?.device_id) {
          this.token = json.token
          await this.saveToken()
          return
        }
      }
    } catch {}
  }

  private async saveToken(): Promise<void> {
    if (!this.token) return
    const payload = JSON.stringify({ token: this.token })
    await this.writeProgramData({ token: this.token })

    // userData copy
    try {
      const p = path.join(app.getPath("userData"), "license.json")
      await fs.promises.writeFile(p, payload, "utf8")
    } catch {}

    // Registry copy (best effort)
    try {
      await this.writeRegistryHKCU("Software\\MindWhisperAI", "LicenseToken", payload)
    } catch {}
  }

  private async writeProgramData(obj: any): Promise<void> {
    try {
      await fs.promises.mkdir(this.programDataDir, { recursive: true })
      await fs.promises.writeFile(this.programDataFile, JSON.stringify(obj), "utf8")
    } catch (e) {
      // ignore
    }
  }

  // ----------------- Fingerprint -----------------
  private async computeDeviceId(): Promise<string> {
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
    return hash
  }

  // ----------------- Utilities -----------------
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

  private readRegistryHKCU(key: string, name: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile("reg", ["query", `HKCU\\${key}`, "/v", name], { windowsHide: true }, (err, stdout) => {
        if (err) return resolve(null)
        const m = String(stdout).match(/\sREG_\w+\s+(.*)$/m)
        resolve(m ? m[1].trim() : null)
      })
    })
  }

  private writeRegistryHKCU(key: string, name: string, value: string): Promise<void> {
    return new Promise((resolve) => {
      execFile("reg", ["add", `HKCU\\${key}`, "/v", name, "/t", "REG_SZ", "/d", value, "/f"], { windowsHide: true }, () => resolve())
    })
  }
}

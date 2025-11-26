import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron"
import path from "node:path"
import fs from "node:fs"
import dotenv from "dotenv"
import { initializeIpcHandlers } from "./ipcHandlers"
import { LicenseManager } from "./LicenseManager"
import { SupabaseWaitlistManager } from "./SupabaseWaitlistManager"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { MoonshineTranscriptionHelper } from "./MoonshineTranscriptionHelper"
import { LoopbackTranscriptionHelper } from "./loopback/LoopbackTranscriptionHelper"
import { DeepgramTranscriptionHelper } from "./loopback/DeepgramTranscriptionHelper"

// Eagerly load environment variables for production and development
function loadEnv() {
  const tried: string[] = []
  const tryLoad = (p: string) => {
    tried.push(p)
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p })
        console.log(`[env] loaded: ${p}`)
        return true
      }
    } catch {}
    return false
  }

  // 1) Packaged path (inside resources)
  if (tryLoad(path.join(process.resourcesPath || __dirname, ".env"))) return

  // 2) CWD when launched (can be repo root)
  if (tryLoad(path.join(process.cwd(), ".env"))) return

  // 3) Common dev locations relative to this file
  const candidates = [
    path.join(__dirname, "..", ".env"),                  // MindWhisperAI/.env when __dirname = electron/
    path.join(__dirname, "..", "..", ".env"),           // repo root/.env if running deeper
    path.join(process.cwd(), "MindWhisperAI", ".env"),    // if npm start from repo root
  ]
  for (const c of candidates) {
    if (tryLoad(c)) return
  }

  console.warn("[env] No .env found in candidates:", tried)
}

// Load env as early as possible
loadEnv()

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper
  public transcriptionHelper: MoonshineTranscriptionHelper
  public loopbackHelper: LoopbackTranscriptionHelper
  public deepgramHelper: DeepgramTranscriptionHelper
  public licenseManager: LicenseManager
  public waitlistManager: SupabaseWaitlistManager
  private tray: Tray | null = null

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize MoonshineTranscriptionHelper (lazy-start)
    this.transcriptionHelper = new MoonshineTranscriptionHelper(this)
    // Initialize LoopbackTranscriptionHelper (lazy-start)
    this.loopbackHelper = new LoopbackTranscriptionHelper(this)
    // Initialize DeepgramTranscriptionHelper (lazy-start)
    this.deepgramHelper = new DeepgramTranscriptionHelper(this)

    // Initialize LicenseManager (will be asynchronously initialized during app startup)
    this.licenseManager = new LicenseManager()

    // Initialize SupabaseWaitlistManager (will be asynchronously initialized during app startup)
    this.waitlistManager = new SupabaseWaitlistManager()

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  // Content protection controls (screen-share visibility)
  public setContentProtection(enabled: boolean): void {
    this.windowHelper.setContentProtection(enabled)
  }

  public toggleContentProtection(): void {
    this.windowHelper.toggleContentProtection()
  }

  public isContentProtectionEnabled(): boolean {
    return this.windowHelper.isContentProtectionEnabled()
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public centerAndShowWindow(): void {
    this.windowHelper.centerAndShowWindow()
  }

  public getTranscriptionHelper(): MoonshineTranscriptionHelper {
    return this.transcriptionHelper
  }

  public getLoopbackHelper(): LoopbackTranscriptionHelper {
    return this.loopbackHelper
  }

  public getDeepgramHelper(): DeepgramTranscriptionHelper {
    return this.deepgramHelper
  }

  public getLicenseManager(): LicenseManager {
    return this.licenseManager
  }

  public getWaitlistManager(): SupabaseWaitlistManager {
    return this.waitlistManager
  }

  public createTray(): void {
    // Use a real icon for tray with improved path resolution
    const isDev = process.env.NODE_ENV === "development"
    let trayImage: Electron.NativeImage
    
    try {
      let trayIconPath: string
      
      if (isDev) {
        // In development, try multiple fallback paths
        const devCandidates = [
          path.join(__dirname, "..", "logo mindwhisperai.png"),
          path.join(__dirname, "../renderer/public/favicon.ico"),
          path.join(__dirname, "..", "build", "icons", "win", "icon-32.png")
        ]
        
        trayIconPath = devCandidates[0] // Default
        for (const candidate of devCandidates) {
          try {
            if (fs.existsSync(candidate)) {
              trayIconPath = candidate
              console.log(`Found dev tray icon at: ${trayIconPath}`)
              break
            }
          } catch {}
        }
      } else {
        // In production, try multiple icon paths with better resolution
        const prodCandidates = [
          path.join(process.resourcesPath || __dirname, "build", "icons", "win", "icon-32.png"), // PNG first (more reliable)
          path.join(process.resourcesPath || __dirname, "build", "icons", "win", "icon.ico"), // buildResources ICO
          path.join(__dirname, "..", "..", "build", "icons", "win", "icon-32.png"), // Relative to app.asar
          path.join(__dirname, "..", "build", "icons", "win", "icon-32.png"), // Relative to dist-electron
          path.join(process.resourcesPath || __dirname, "app.asar.unpacked", "build", "icons", "win", "icon-32.png") // ASAR unpacked
        ]
        
        trayIconPath = prodCandidates[0] // Default
        for (const candidate of prodCandidates) {
          try {
            if (fs.existsSync(candidate)) {
              trayIconPath = candidate
              console.log(`Found prod tray icon at: ${trayIconPath}`)
              break
            }
          } catch {}
        }
        
        // If still no icon found, log all attempted paths for debugging
        if (!fs.existsSync(trayIconPath)) {
          console.warn("Tray icon not found. Attempted paths:")
          prodCandidates.forEach((path, i) => console.warn(`  ${i + 1}. ${path}`))
        }
      }
      
      console.log(`Loading tray icon from: ${trayIconPath}`)
      trayImage = nativeImage.createFromPath(trayIconPath)
      
      if (trayImage.isEmpty()) {
        console.warn("Tray icon is empty, trying buffer method")
        const iconBuffer = fs.readFileSync(trayIconPath)
        trayImage = nativeImage.createFromBuffer(iconBuffer)
        
        if (trayImage.isEmpty()) {
          throw new Error("Both path and buffer methods failed")
        }
      }
      
      // Resize tray icon for better display (16x16 or 32x32 depending on system)
      if (process.platform === 'win32') {
        trayImage = trayImage.resize({ width: 16, height: 16 })
      }
      
    } catch (error) {
      console.warn("Failed to load tray icon, using system default:", error)
      
      // Create a simple 16x16 transparent icon as fallback
      const fallbackBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0xF3, 0xFF,
        0x61, 0x00, 0x00, 0x00, 0x19, 0x74, 0x45, 0x58, 0x74, 0x53, 0x6F, 0x66, 0x74, 0x77, 0x61, 0x72,
        0x65, 0x00, 0x41, 0x64, 0x6F, 0x62, 0x65, 0x20, 0x49, 0x6D, 0x61, 0x67, 0x65, 0x52, 0x65, 0x61,
        0x64, 0x79, 0x71, 0xC9, 0x65, 0x3C, 0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0xDA,
        0x62, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0xE2, 0x26, 0x05, 0x9B, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ])
      
      try {
        trayImage = nativeImage.createFromBuffer(fallbackBuffer)
        if (trayImage.isEmpty()) {
          trayImage = nativeImage.createEmpty()
        }
        console.log("Using fallback tray icon")
      } catch (fallbackError) {
        console.warn("Fallback icon creation failed:", fallbackError)
        trayImage = nativeImage.createEmpty()
      }
    }

    this.tray = new Tray(trayImage)
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show MindWhisper AI',
        click: () => {
          this.centerAndShowWindow()
        }
      },
      {
        label: 'Toggle Window',
        click: () => {
          this.toggleMainWindow()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Take Screenshot (Cmd+H)',
        click: async () => {
          try {
            const screenshotPath = await this.takeScreenshot()
            const preview = await this.getImagePreview(screenshotPath)
            const mainWindow = this.getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send("screenshot-taken", {
                path: screenshotPath,
                preview
              })
            }
          } catch (error) {
            console.error("Error taking screenshot from tray:", error)
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          app.quit()
        }
      }
    ])
    
    this.tray.setToolTip('MindWhisper AI')
    this.tray.setContextMenu(contextMenu)
    
    // Set a title for macOS (will appear in menu bar)
    if (process.platform === 'darwin') {
      this.tray.setTitle('IC')
    }
    
    // Double-click to show window
    this.tray.on('double-click', () => {
      this.centerAndShowWindow()
    })
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }

  // AI Customization methods
  private aiCustomizationPath = path.join(app.getPath('userData'), 'ai-customization.json')

  public getAICustomization(): { cv: string; customPrompt: string } | null {
    try {
      if (fs.existsSync(this.aiCustomizationPath)) {
        const data = fs.readFileSync(this.aiCustomizationPath, 'utf8')
        return JSON.parse(data)
      }
      return null
    } catch (error) {
      console.error('Error reading AI customization:', error)
      return null
    }
  }

  public async saveAICustomization(data: { cv: string; customPrompt: string }): Promise<void> {
    try {
      const userData = app.getPath('userData')
      if (!fs.existsSync(userData)) {
        fs.mkdirSync(userData, { recursive: true })
      }
      fs.writeFileSync(this.aiCustomizationPath, JSON.stringify(data, null, 2), 'utf8')
      console.log('AI customization saved successfully')
    } catch (error) {
      console.error('Error saving AI customization:', error)
      throw error
    }
  }
}

// Application initialization
async function initializeApp() {
  // Enforce single instance to prevent shortcut registration conflicts
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }
  app.on("second-instance", () => {
    const appState = AppState.getInstance()
    const win = appState.getMainWindow()
    if (win) {
      try {
        appState.centerAndShowWindow()
      } catch {}
    }
  })
  // Setup basic file logging for production troubleshooting
  const userData = app.getPath("userData")
  const logsDir = path.join(userData, "logs")
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  } catch {}
  // Ensure a writable cache directory to avoid Windows access issues
  const cacheDir = path.join(userData, "Cache")
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
  } catch {}
  const logFile = path.join(logsDir, "main.log")
  const log = (msg: string, extra?: any) => {
    const line = `[${new Date().toISOString()}] ${msg} ${extra ? JSON.stringify(extra) : ""}\n`
    try { fs.appendFileSync(logFile, line) } catch {}
    console.log(msg, extra ?? "")
  }

  process.on("uncaughtException", (err) => {
    log("uncaughtException", { message: err.message, stack: err.stack })
  })
  process.on("unhandledRejection", (reason: any) => {
    log("unhandledRejection", { reason: typeof reason === "object" ? reason?.message : String(reason) })
  })

  const appState = AppState.getInstance()

  // Initialize License Manager first so IPC has status available
  try {
    await appState.getLicenseManager().init()
    log("LicenseManager initialized")
    
    // Verify trial status immediately on startup
    const licenseStatus = appState.getLicenseManager().getStatus()
    log("Trial verification on startup", { 
      status: licenseStatus.status, 
      daysLeft: licenseStatus.daysLeft,
      offline: licenseStatus.offline 
    })
    
    // Log trial status for monitoring
    if (licenseStatus.status === "expired") {
      log("WARNING: Trial has expired", { daysLeft: licenseStatus.daysLeft })
    } else if (licenseStatus.status === "banned") {
      log("WARNING: License is banned")
    } else if (licenseStatus.status === "active") {
      log("Trial is active", { daysLeft: licenseStatus.daysLeft })
    }
    
  } catch (e: any) {
    log("LicenseManager init failed", { message: e?.message })
  }

  // Initialize Waitlist Manager
  try {
    await appState.getWaitlistManager().init()
    log("WaitlistManager initialized")
    
    const waitlistStatus = appState.getWaitlistManager().getWaitlistStatus()
    log("Waitlist status on startup", { 
      hasJoined: waitlistStatus.hasJoined,
      shouldShow: appState.getWaitlistManager().shouldShowWaitlistBar()
    })
    
  } catch (e: any) {
    log("WaitlistManager init failed", { message: e?.message })
  }

  // Initialize IPC handlers before window creation
  try {
    initializeIpcHandlers(appState)
    log("IPC handlers initialized")
  } catch (e: any) {
    log("Failed to initialize IPC handlers", { message: e?.message })
  }

  app.whenReady().then(async () => {
    log("App is ready")
    try { appState.createWindow(); log("Window created") } catch (e: any) { log("createWindow failed", { message: e?.message }) }
    try { appState.createTray(); log("Tray created") } catch (e: any) { log("createTray failed", { message: e?.message }) }
    try {
      log("Registering global shortcuts...")
      appState.shortcutsHelper.registerGlobalShortcuts()
      log("Global shortcuts registered successfully")
    } catch (e: any) {
      log("Shortcut registration failed", { message: e?.message })
    }

    // Wait for window to be ready, then send initial license status
    const mainWindow = appState.getMainWindow()
    if (mainWindow) {
      // Set the main window reference in LicenseManager for future notifications
      appState.getLicenseManager().setMainWindow(mainWindow)
      
      mainWindow.webContents.once('did-finish-load', () => {
        // Give the renderer a moment to set up event listeners
        setTimeout(() => {
          try {
            const licenseStatus = appState.getLicenseManager().getStatus()
            log("Sending initial license status to renderer", { status: licenseStatus.status, daysLeft: licenseStatus.daysLeft })
            mainWindow.webContents.send('license-status-updated', licenseStatus)
          } catch (e: any) {
            log("Failed to send initial license status", { message: e?.message })
          }
        }, 2000) // 2 second delay to ensure renderer is fully ready
      })
      
      // Also send status when DOM is ready (additional safety net)
      mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
          try {
            const licenseStatus = appState.getLicenseManager().getStatus()
            log("Sending license status on DOM ready", { status: licenseStatus.status, daysLeft: licenseStatus.daysLeft })
            mainWindow.webContents.send('license-status-updated', licenseStatus)
          } catch (e: any) {
            log("Failed to send license status on DOM ready", { message: e?.message })
          }
        }, 3000) // 3 second delay for DOM ready
        
        // Auto-trigger license refresh 5 seconds after DOM ready (like pressing refresh button)
        setTimeout(async () => {
          try {
            log("Auto-triggering license refresh 5 seconds after startup...")
            const refreshedStatus = await appState.getLicenseManager().forceVerify()
            log("Auto-refresh completed", { status: refreshedStatus.status, daysLeft: refreshedStatus.daysLeft })
            mainWindow.webContents.send('license-status-updated', refreshedStatus)
          } catch (e: any) {
            log("Auto-refresh failed", { message: e?.message })
          }
        }, 5000) // 5 second delay for auto-refresh
      })
    }
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  try { app.dock?.hide() } catch {}
  app.commandLine.appendSwitch("disable-background-timer-throttling")
  // Route caches to userData to avoid permission issues
  try { app.commandLine.appendSwitch("disk-cache-dir", cacheDir) } catch {}
  try { app.commandLine.appendSwitch("disable-gpu-shader-disk-cache") } catch {}
}

// Start the application
initializeApp().catch(console.error)

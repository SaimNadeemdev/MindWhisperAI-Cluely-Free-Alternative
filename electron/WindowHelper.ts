import { BrowserWindow, screen, nativeImage } from "electron"
import type { Event } from "electron"
import type { AppState } from "./main"
import path from "node:path"

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../dist/index.html")}`

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null
  private appState: AppState
  private isContentProtected: boolean = true

  // Initialize with explicit number type and 0 value
  private screenWidth: number = 0
  private screenHeight: number = 0
  private step: number = 0
  private currentX: number = 0
  private currentY: number = 0

  constructor(appState: AppState) {
    this.appState = appState
  }

  // Content protection controls
  public setContentProtection(enabled: boolean): void {
    this.isContentProtected = enabled
    this.applyContentProtection()
    // Notify renderer about change so UI can show a toast/badge
    const win = this.mainWindow
    if (win && !win.isDestroyed()) {
      win.webContents.send("content-protection-changed", {
        enabled: this.isContentProtected
      })
    }
  }

  public toggleContentProtection(): void {
    this.setContentProtection(!this.isContentProtected)
  }

  public isContentProtectionEnabled(): boolean {
    return this.isContentProtected
  }

  private applyContentProtection(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setContentProtection(this.isContentProtected)
    }
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // Get current window position
    const [currentX, currentY] = this.mainWindow.getPosition()

    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize

    // Match content size exactly (rounded). No artificial caps.
    const newWidth = Math.ceil(width)
    const newHeight = Math.ceil(height)

    // First, set the content size to avoid DPI scaling issues
    this.mainWindow.setContentSize(newWidth, newHeight)

    // Then ensure the window remains fully on-screen horizontally
    const maxX = Math.max(0, workArea.width - newWidth)
    const newX = Math.min(Math.max(currentX, 0), maxX)
    if (newX !== currentX) {
      this.mainWindow.setPosition(newX, currentY)
    }

    // Update internal state
    this.windowPosition = { x: newX, y: currentY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
  }

  public createWindow(): void {
    if (this.mainWindow !== null) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    this.screenWidth = workArea.width
    this.screenHeight = workArea.height
    // Set default movement step (2% of screen width, minimum 10px)
    this.step = Math.max(10, Math.floor(this.screenWidth * 0.02))

    // Set up window icon
    let windowIcon: Electron.NativeImage | undefined
    try {
      let iconPath: string
      if (isDev) {
        // In development, use the logo from the project root
        iconPath = path.join(__dirname, "..", "logo mindwhisperai.png")
      } else {
        // In production, try multiple icon paths for better compatibility
        const iconCandidates = [
          path.join(__dirname, "..", "build", "icons", "win", "icon.ico"), // Relative to dist-electron
          path.join(process.resourcesPath || __dirname, "app.asar.unpacked", "build", "icons", "win", "icon.ico"), // ASAR unpacked
          path.join(process.resourcesPath || __dirname, "build", "icons", "win", "icon.ico"), // buildResources
          path.join(__dirname, "..", "build", "icons", "win", "icon-256.png"), // Fallback to PNG
          path.join(process.cwd(), "build", "icons", "win", "icon.ico") // Current working directory
        ]
        
        iconPath = iconCandidates[0] // Default
        
        // Find the first existing icon file
        for (const candidate of iconCandidates) {
          try {
            const fs = require('fs')
            if (fs.existsSync(candidate)) {
              iconPath = candidate
              console.log(`Found icon at: ${iconPath}`)
              break
            }
          } catch {}
        }
      }
      
      console.log(`Attempting to load icon from: ${iconPath}`)
      windowIcon = nativeImage.createFromPath(iconPath)
      
      if (windowIcon.isEmpty()) {
        console.warn("Window icon is empty, trying fallback methods")
        
        // Try creating icon from buffer if path method failed
        if (!isDev) {
          try {
            const fs = require('fs')
            const iconBuffer = fs.readFileSync(iconPath)
            windowIcon = nativeImage.createFromBuffer(iconBuffer)
            if (!windowIcon.isEmpty()) {
              console.log("Successfully loaded icon from buffer")
            }
          } catch (bufferError) {
            console.warn("Buffer method also failed:", bufferError)
            windowIcon = undefined
          }
        } else {
          windowIcon = undefined
        }
      } else {
        console.log("Successfully loaded window icon")
      }
    } catch (error) {
      console.warn("Failed to load window icon:", error)
      windowIcon = undefined
    }
    
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width: 400,
      height: 600,
      minWidth: 400,
      minHeight: 200,
      icon: windowIcon,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js")
      },
      show: false, // Start hidden, then show after setup
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      fullscreenable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      focusable: true,
      resizable: true,
      useContentSize: true,
      movable: true,
      x: 100, // Start at a visible position
      y: 100,
      // Additional properties to remove any system borders/shadows
      titleBarStyle: 'hidden',
      vibrancy: undefined,
      visualEffectState: undefined
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    // this.mainWindow.webContents.openDevTools()
    // Apply content protection based on current state
    this.applyContentProtection()

    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setHiddenInMissionControl(true)
      this.mainWindow.setAlwaysOnTop(true, "floating")
    }
    if (process.platform === "linux") {
      // Linux-specific optimizations for better compatibility
      if (this.mainWindow.setHasShadow) {
        this.mainWindow.setHasShadow(false)
      }
      // Keep window focusable on Linux for proper interaction
      this.mainWindow.setFocusable(true)
    } 
    this.mainWindow.setSkipTaskbar(true)
    // Ensure strong always-on-top on Windows to avoid being hidden by screen share overlays
    if (process.platform === "win32") {
      // 'screen-saver' is the strongest level available on Windows
      this.mainWindow.setAlwaysOnTop(true, "screen-saver")
    } else {
      this.mainWindow.setAlwaysOnTop(true)
    }

    this.mainWindow.loadURL(startUrl).catch((err) => {
      console.error("Failed to load URL:", err)
    })

    // Show window after loading URL and center it
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        // Center the window first
        this.centerWindow()
        this.mainWindow.show()
        this.mainWindow.focus()
        // Re-assert always-on-top after show
        if (process.platform === "win32") {
          this.mainWindow.setAlwaysOnTop(true, "screen-saver")
        } else {
          this.mainWindow.setAlwaysOnTop(true)
        }
        // Re-apply content protection in case it was lost across hide/show
        this.applyContentProtection()
        console.log("Window is now visible and centered")
      }
    })

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.currentX = bounds.x
    this.currentY = bounds.y

    this.setupWindowListeners()
    this.isWindowVisible = true
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) return

    this.mainWindow.on("move", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.currentX = bounds.x
        this.currentY = bounds.y
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowSize = { width: bounds.width, height: bounds.height }
      }
    })

    // Listen for actual window visibility changes from Electron
    this.mainWindow.on("show" as any, () => {
      console.log("Window show event detected by Electron")
      this.isWindowVisible = true
      try { this.mainWindow?.webContents.send("window-visibility-changed", { visible: true }) } catch {}
    })

    this.mainWindow.on("hide" as any, () => {
      console.log("Window hide event detected by Electron")
      this.isWindowVisible = false
      try { this.mainWindow?.webContents.send("window-visibility-changed", { visible: false }) } catch {}
    })

    // Some screen-sharing apps may attempt to minimize or hide protected windows.
    // If the app didn't intentionally hide the window, immediately restore it.
    this.mainWindow.on("minimize" as any, (e: Event) => {
      if (!this.isWindowVisible) return // we hid it on purpose (e.g., for screenshots)
      console.log("Window minimize event detected - restoring window")
      e.preventDefault()
      this.mainWindow?.restore()
      this.mainWindow?.show()
      if (process.platform === "win32") {
        this.mainWindow?.setAlwaysOnTop(true, "screen-saver")
      } else {
        this.mainWindow?.setAlwaysOnTop(true)
      }
      this.applyContentProtection()
    })

    this.mainWindow.on("hide" as any, () => {
      if (!this.isWindowVisible) return // intentional hide
      console.log("Window hide event detected - auto-showing to maintain visibility")
      // Auto-show to keep visible to user during screen share
      this.mainWindow?.showInactive()
      if (process.platform === "win32") {
        this.mainWindow?.setAlwaysOnTop(true, "screen-saver")
      } else {
        this.mainWindow?.setAlwaysOnTop(true)
      }
      this.applyContentProtection()
    })

    // Re-apply protections on show/focus due to known Electron issues
    this.mainWindow.on("show" as any, () => {
      if (process.platform === "win32") {
        this.mainWindow?.setAlwaysOnTop(true, "screen-saver")
      } else {
        this.mainWindow?.setAlwaysOnTop(true)
      }
      this.applyContentProtection()
    })

    this.mainWindow.on("focus" as any, () => {
      if (process.platform === "win32") {
        this.mainWindow?.setAlwaysOnTop(true, "screen-saver")
      } else {
        this.mainWindow?.setAlwaysOnTop(true)
      }
      this.applyContentProtection()
    })

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public isVisible(): boolean {
    // Check both our internal flag and the actual window state
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false
    }
    return this.isWindowVisible && this.mainWindow.isVisible()
  }

  public hideMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.mainWindow.hide()
    this.isWindowVisible = false
  }

  public showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    if (this.windowPosition && this.windowSize) {
      this.mainWindow.setBounds({
        x: this.windowPosition.x,
        y: this.windowPosition.y,
        width: this.windowSize.width,
        height: this.windowSize.height
      })
    }

    this.mainWindow.showInactive()

    this.isWindowVisible = true
  }

  public toggleMainWindow(): void {
    const wasVisible = this.isVisible()
    console.log(`Toggle window called - Current visibility: ${wasVisible}, Internal flag: ${this.isWindowVisible}`)

    if (wasVisible) {
      console.log("Window is visible, hiding it...")
      this.hideMainWindow()
    } else {
      console.log("Window is hidden, showing it...")
      this.showMainWindow()
    }
  }

  private centerWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    
    // Get current window size or use defaults
    const windowBounds = this.mainWindow.getBounds()
    const windowWidth = windowBounds.width || 400
    const windowHeight = windowBounds.height || 600
    
    // Calculate center position
    const centerX = Math.floor((workArea.width - windowWidth) / 2)
    const centerY = Math.floor((workArea.height - windowHeight) / 2)
    
    // Set window position
    this.mainWindow.setBounds({
      x: centerX,
      y: centerY,
      width: windowWidth,
      height: windowHeight
    })
    
    // Update internal state
    this.windowPosition = { x: centerX, y: centerY }
    this.windowSize = { width: windowWidth, height: windowHeight }
    this.currentX = centerX
    this.currentY = centerY
  }

  public centerAndShowWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    this.centerWindow()
    this.mainWindow.show()
    this.mainWindow.focus()
    this.mainWindow.setAlwaysOnTop(true)
    this.isWindowVisible = true
    
    console.log(`Window centered and shown`)
  }

  // New methods for window movement
  public moveWindowRight(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentX = Math.min(
      this.screenWidth - halfWidth,
      this.currentX + this.step
    )
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowLeft(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentX = Math.max(-halfWidth, this.currentX - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowDown(): void {
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0
    const halfHeight = windowHeight / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.min(
      this.screenHeight - halfHeight,
      this.currentY + this.step
    )
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowUp(): void {
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0
    const halfHeight = windowHeight / 2

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.max(-halfHeight, this.currentY - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }
}

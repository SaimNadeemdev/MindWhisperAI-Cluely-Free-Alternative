import { globalShortcut, app } from "electron"
import type { AppState } from "./main" // type-only to avoid runtime cycle

export class ShortcutsHelper {
  private appState: AppState

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    const register = (accelerator: string, handler: () => void) => {
      try {
        // Unregister first to avoid conflicts on hot-reload or second registration
        if (globalShortcut.isRegistered(accelerator)) {
          globalShortcut.unregister(accelerator)
        }
        globalShortcut.register(accelerator, handler)
        const chk = globalShortcut.isRegistered(accelerator)
        if (!chk) {
          console.warn(`[Shortcuts] Failed to register: ${accelerator}`)
        } else {
          console.log(`[Shortcuts] ${accelerator} registered`)
        }
      } catch (e) {
        console.error(`[Shortcuts] Error registering ${accelerator}:`, e)
      }
    }
    // Add global shortcut to show/center window
    register("CommandOrControl+Shift+Space", () => {
      console.log("Show/Center window shortcut pressed...")
      this.appState.centerAndShowWindow()
    })

    register("CommandOrControl+H", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        console.log("Taking screenshot...")
        try {
          const screenshotPath = await this.appState.takeScreenshot()
          const preview = await this.appState.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    })

    register("CommandOrControl+Enter", async () => {
      await this.appState.processingHelper.processScreenshots()
    })

    register("CommandOrControl+R", () => {
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.appState.processingHelper.cancelOngoingRequests()

      // Clear both screenshot queues
      this.appState.clearQueues()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.appState.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    // New shortcuts for moving the window
    register("CommandOrControl+Left", () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.appState.moveWindowLeft()
    })

    register("CommandOrControl+Right", () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.appState.moveWindowRight()
    })
    register("CommandOrControl+Down", () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.appState.moveWindowDown()
    })
    register("CommandOrControl+Up", () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.appState.moveWindowUp()
    })

    register("CommandOrControl+B", () => {
      console.log("Ctrl+B shortcut pressed!")
      const mainWindow = this.appState.getMainWindow()
      const isVisible = this.appState.isVisible()
      console.log(`Window state before toggle: visible=${isVisible}, window exists=${!!mainWindow}`)

      this.appState.toggleMainWindow()

      // If window exists and we're showing it, bring it to front
      if (mainWindow && !this.appState.isVisible()) {
        console.log("Window was hidden, bringing to front...")
        // Force the window to the front on macOS
        if (process.platform === "darwin") {
          mainWindow.setAlwaysOnTop(true, "normal")
          // Reset alwaysOnTop after a brief delay
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(true, "floating")
            }
          }, 100)
        }
      }

      console.log(`Window state after toggle: visible=${this.appState.isVisible()}`)
    })

    // Emergency Hide: instantly hide the main window
    register("CommandOrControl+Shift+H", () => {
      console.log("Emergency Hide triggered")
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("emergency-hide")
        setTimeout(() => {
          this.appState.hideMainWindow()
        }, 250)
      } else {
        this.appState.hideMainWindow()
      }
    })

    // Stealth Cycle: Normal → Stealth → Ultra → Normal (handled in renderer)
    register("CommandOrControl+Shift+S", () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("Stealth Cycle shortcut pressed")
        mainWindow.webContents.send("stealth-cycle")
      }
    })

    // Toggle screen-capture visibility (content protection)
    // When OFF -> window can be recorded/shared. When ON -> hidden from screen capture.
    register("CommandOrControl+Shift+V", () => {
      this.appState.toggleContentProtection()
      const enabled = this.appState.isContentProtectionEnabled()
      console.log(`Content protection ${enabled ? "ENABLED (invisible to screen sharing)" : "DISABLED (visible)"}`)
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("content-protection-changed", { enabled })
      }
    })

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}

import { contextBridge, ipcRenderer } from "electron"

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void

  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<{ path: string; preview: string }>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<any>
  quitApp: () => Promise<void>
  
  // Window controls
  toggleApp: () => Promise<void>
  // Stealth events
  onStealthCycle: (callback: () => void) => () => void
  onEmergencyHide: (callback: () => void) => () => void
  
  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>
  
  // Live transcript + commands
  startLiveTranscript: () => Promise<{ success: boolean; error?: string }>
  stopLiveTranscript: () => Promise<{ success: boolean; error?: string }>
  sendTranscriptChunk: (id: string, base64Wav: string) => Promise<{ id: string; text: string; words?: { word: string; start: number; end: number }[] }>
  extractCommands: (utterance: string, timestampISO?: string) => Promise<any[] | null>
  polishCommandResponse: (commandText: string, context: { transcriptWindow: string; timestamp: string; who: string }) => Promise<{ text: string }>

  // Licensing
  getLicenseStatus: () => Promise<{ deviceId: string; status: "active"|"expired"|"banned"|"unknown"; trialEndISO: string|null; serverTimeISO: string|null; daysLeft: number; offline: boolean; message?: string }>
  // AI Customization
  getAICustomization: () => Promise<{ cv: string; customPrompt: string } | null>
  saveAICustomization: (data: { cv: string; customPrompt: string }) => Promise<{ success: boolean; error?: string }>

  // Waitlist Management
  getWaitlistStatus: () => Promise<{ hasJoined: boolean; email?: string; name?: string; joinedAt?: string; deviceId: string; shouldShowBar: boolean; error?: string }>
  joinWaitlist: (name: string, email: string) => Promise<{ success: boolean; error?: string }>
  dismissWaitlist: () => Promise<{ success: boolean; error?: string }>
  getWaitlistStats: () => Promise<{ totalEntries: number; uniqueEmails: number; uniqueDevices: number }>
  onWaitlistStatusUpdated: (callback: (status: any) => void) => () => void

  // Native loopback (WASAPI) transcription with Whisper
  startLoopbackTranscript: (options?: { model?: string; engine?: string }) => Promise<{ success: boolean; error?: string; model?: string; engine?: string }>
  stopLoopbackTranscript: () => Promise<{ success: boolean; error?: string }>
  getLoopbackModel: () => Promise<{ model: string; engine: string; isReady: boolean }>
  onLoopbackTranscript: (callback: (data: { text: string; timestamp: number; confidence?: number }) => void) => () => void
  // Deepgram transcription
  startDeepgramTranscript: (options?: { model?: string }) => Promise<{ success: boolean; error?: string; model?: string; engine?: string }>
  stopDeepgramTranscript: () => Promise<{ success: boolean; error?: string }>
  getDeepgramModel: () => Promise<{ model: string; engine: string; isReady: boolean; hasApiKey: boolean }>
  onDeepgramTranscript: (callback: (data: { text: string; timestamp: number; confidence?: number }) => void) => () => void
  onDeepgramStatus: (callback: (message: string) => void) => () => void
  onDeepgramReady: (callback: (data: { model: string; engine: string }) => void) => () => void
  onDeepgramError: (callback: (error: string) => void) => () => void

  invoke: (channel: string, ...args: any[]) => Promise<any>
}

export const PROCESSING_EVENTS = {
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

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),

  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onSolutionsReady: (callback: (solutions: string) => void) => {
    const subscription = (_: any, solutions: string) => callback(solutions)
    ipcRenderer.on("solutions-ready", subscription)
    return () => {
      ipcRenderer.removeListener("solutions-ready", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },

  onDebugSuccess: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on("debug-success", subscription)
    return () => {
      ipcRenderer.removeListener("debug-success", subscription)
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },

  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  moveWindowUp: () => ipcRenderer.invoke("move-window-up"),
  moveWindowDown: () => ipcRenderer.invoke("move-window-down"),
  analyzeAudioFromBase64: (data: string, mimeType: string) => ipcRenderer.invoke("analyze-audio-base64", data, mimeType),
  analyzeAudioFile: (path: string) => ipcRenderer.invoke("analyze-audio-file", path),
  analyzeImageFile: (path: string) => ipcRenderer.invoke("analyze-image-file", path),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  // Window controls
  toggleApp: () => ipcRenderer.invoke("toggle-window"),
  // Stealth events
  onStealthCycle: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on('stealth-cycle', subscription)
    return () => ipcRenderer.removeListener('stealth-cycle', subscription)
  },
  onEmergencyHide: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on('emergency-hide', subscription)
    return () => ipcRenderer.removeListener('emergency-hide', subscription)
  },
  
  // LLM Model Management
  getCurrentLlmConfig: () => ipcRenderer.invoke("get-current-llm-config"),
  getAvailableOllamaModels: () => ipcRenderer.invoke("get-available-ollama-models"),
  switchToOllama: (model?: string, url?: string) => ipcRenderer.invoke("switch-to-ollama", model, url),
  switchToGemini: (apiKey?: string) => ipcRenderer.invoke("switch-to-gemini", apiKey),
  testLlmConnection: () => ipcRenderer.invoke("test-llm-connection"),
  
  // Live transcript + commands
  startLiveTranscript: () => ipcRenderer.invoke("live-transcript-start"),
  stopLiveTranscript: () => ipcRenderer.invoke("live-transcript-stop"),
  sendTranscriptChunk: (id: string, base64Wav: string) => ipcRenderer.invoke("live-transcript-chunk", id, base64Wav),
  extractCommands: (utterance: string, timestampISO?: string) => ipcRenderer.invoke("extract-commands", utterance, timestampISO),
  polishCommandResponse: (commandText: string, context: { transcriptWindow: string; timestamp: string; who: string }) => ipcRenderer.invoke("polish-command-response", commandText, context),

  // Licensing
  getLicenseStatus: () => ipcRenderer.invoke("get-license-status"),
  forceVerifyLicense: () => ipcRenderer.invoke("force-verify-license"),

  // Visibility/content protection indicator
  onContentProtectionChanged: (callback: (enabled: boolean) => void) => {
    const subscription = (_: any, data: { enabled: boolean }) => callback(!!data?.enabled)
    ipcRenderer.on("content-protection-changed", subscription)
    return () => ipcRenderer.removeListener("content-protection-changed", subscription)
  },
  onWindowVisibilityChanged: (callback: (visible: boolean) => void) => {
    const subscription = (_: any, data: { visible: boolean }) => callback(!!data?.visible)
    ipcRenderer.on("window-visibility-changed", subscription)
    return () => ipcRenderer.removeListener("window-visibility-changed", subscription)
  },

  // Native loopback (WASAPI) transcription with Whisper
  startLoopbackTranscript: (options?: { model?: string; engine?: string }) => ipcRenderer.invoke("loopback-transcript-start", options),
  stopLoopbackTranscript: () => ipcRenderer.invoke("loopback-transcript-stop"),
  getLoopbackModel: () => ipcRenderer.invoke('loopback-get-model'),
  onLoopbackTranscript: (callback: (data: { text: string; timestamp: number; confidence?: number }) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('loopback-transcription')
    ipcRenderer.on('loopback-transcription', (_, data) => callback(data))
    return unsubscribe
  },
  onLoopbackStatus: (callback: (message: string) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('loopback-status')
    ipcRenderer.on('loopback-status', (_, message) => callback(message))
    return unsubscribe
  },
  onLoopbackFallback: (callback: (data: { originalModel: string; fallbackModel: string; message: string }) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('loopback-fallback')
    ipcRenderer.on('loopback-fallback', (_, data) => callback(data))
    return unsubscribe
  },
  onLoopbackError: (callback: (error: string) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('loopback-error')
    ipcRenderer.on('loopback-error', (_, error) => callback(error))
    return unsubscribe
  },

  // Deepgram transcription methods
  startDeepgramTranscript: (options: { model?: string } = {}) => ipcRenderer.invoke("deepgram-transcript-start", options),
  stopDeepgramTranscript: () => ipcRenderer.invoke("deepgram-transcript-stop"),
  getDeepgramModel: () => ipcRenderer.invoke("deepgram-get-model"),
  onDeepgramTranscript: (callback: (data: { text: string; timestamp: number; confidence?: number }) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('deepgram-transcription')
    ipcRenderer.on('deepgram-transcription', (_, data) => callback(data))
    return unsubscribe
  },
  onDeepgramStatus: (callback: (message: string) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('deepgram-status')
    ipcRenderer.on('deepgram-status', (_, message) => callback(message))
    return unsubscribe
  },
  onDeepgramReady: (callback: (data: { model: string; engine: string }) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('deepgram-ready')
    ipcRenderer.on('deepgram-ready', (_, data) => callback(data))
    return unsubscribe
  },
  onDeepgramError: (callback: (error: string) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('deepgram-error')
    ipcRenderer.on('deepgram-error', (_, error) => callback(error))
    return unsubscribe
  },
  onCommandExtracted: (callback: (data: { command: any; originalTranscript: string; timestamp: number }) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('command-extracted')
    ipcRenderer.on('command-extracted', (_, data) => callback(data))
    return unsubscribe
  },

  // License status event listener
  onLicenseStatusUpdated: (callback: (status: any) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('license-status-updated')
    ipcRenderer.on('license-status-updated', (_, status) => callback(status))
    return unsubscribe
  },

  // AI Customization
  getAICustomization: () => ipcRenderer.invoke('get-ai-customization'),
  saveAICustomization: (data: { cv: string; customPrompt: string }) => ipcRenderer.invoke('save-ai-customization', data),

  // Waitlist Management
  getWaitlistStatus: () => ipcRenderer.invoke('get-waitlist-status'),
  joinWaitlist: (name: string, email: string) => ipcRenderer.invoke('join-waitlist', name, email),
  dismissWaitlist: () => ipcRenderer.invoke('dismiss-waitlist'),
  getWaitlistStats: () => ipcRenderer.invoke('get-waitlist-stats'),
  onWaitlistStatusUpdated: (callback: (status: any) => void) => {
    const unsubscribe = () => ipcRenderer.removeAllListeners('waitlist-status-updated')
    ipcRenderer.on('waitlist-status-updated', (_, status) => callback(status))
    return unsubscribe
  },

  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
} as ElectronAPI)

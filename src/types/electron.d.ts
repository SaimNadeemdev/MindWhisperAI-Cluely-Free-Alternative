export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
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
  analyzeImageFile: (path: string) => Promise<{ text: string; timestamp: number } | any>
  quitApp: () => Promise<void>
  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>
  // Generic invoker
  invoke: (channel: string, ...args: any[]) => Promise<any>

  // Live transcript + commands
  startLiveTranscript: () => Promise<{ success: boolean; error?: string }>
  stopLiveTranscript: () => Promise<{ success: boolean; error?: string }>
  sendTranscriptChunk: (id: string, base64Wav: string) => Promise<{ id: string; text: string; words?: { word: string; start: number; end: number }[] }>
  extractCommands: (utterance: string, timestampISO?: string) => Promise<any[] | null>
  polishCommandResponse: (commandText: string, context: { transcriptWindow: string; timestamp: string; who: string }) => Promise<{ text: string }>

  // Native loopback (WASAPI) transcription 
  startLoopbackTranscript: (options?: { model?: string; engine?: string }) => Promise<{ success: boolean; error?: string }>
  stopLoopbackTranscript: () => Promise<void>
  onLoopbackTranscript: (callback: (data: { text: string; timestamp: number; confidence?: number }) => void) => () => void
  onLoopbackStatus: (callback: (message: string) => void) => () => void
  onLoopbackFallback: (callback: (data: { originalModel: string; fallbackModel: string; message: string }) => void) => () => void
  onLoopbackError: (callback: (error: string) => void) => () => void
  getLoopbackModel: () => Promise<{ model: string; engine: string; isReady: boolean }>

  // Deepgram transcription
  startDeepgramTranscript: (options?: { model?: string }) => Promise<{ success: boolean; error?: string; model?: string; engine?: string }>
  stopDeepgramTranscript: () => Promise<{ success: boolean; error?: string }>
  onDeepgramTranscript: (callback: (data: { text: string; timestamp: number; confidence?: number }) => void) => () => void
  onDeepgramStatus: (callback: (message: string) => void) => () => void
  onDeepgramReady: (callback: (data: { model: string; engine: string }) => void) => () => void
  onDeepgramError: (callback: (error: string) => void) => () => void
  onCommandExtracted: (callback: (data: { command: any; originalTranscript: string; timestamp: number }) => void) => () => void

  // License management
  getLicenseStatus: () => Promise<{ deviceId: string; status: "active"|"expired"|"banned"|"unknown"; trialEndISO: string|null; serverTimeISO: string|null; daysLeft: number; offline: boolean; message?: string }>
  forceVerifyLicense: () => Promise<{ deviceId: string; status: "active"|"expired"|"banned"|"unknown"; trialEndISO: string|null; serverTimeISO: string|null; daysLeft: number; offline: boolean; message?: string }>
  onLicenseStatusUpdated: (callback: (status: any) => void) => () => void

  // AI Customization
  getAICustomization: () => Promise<{ cv: string; customPrompt: string } | null>
  saveAICustomization: (data: { cv: string; customPrompt: string }) => Promise<{ success: boolean; error?: string }>

  // Waitlist Management
  getWaitlistStatus: () => Promise<{ hasJoined: boolean; email?: string; name?: string; joinedAt?: string; shouldShowBar: boolean; error?: string }>
  joinWaitlist: (name: string, email: string) => Promise<{ success: boolean; error?: string }>
  dismissWaitlist: () => Promise<{ success: boolean; error?: string }>
  getWaitlistStats: () => Promise<{ totalEntries: number; uniqueEmails: number }>
  onWaitlistStatusUpdated: (callback: (status: any) => void) => () => void

  invoke: (channel: string, ...args: any[]) => Promise<any>
  // Mode management
  onModeChange: (callback: (mode: 'live' | 'voice' | 'chat' | 'settings') => void) => () => void;
  changeMode: (mode: 'live' | 'voice' | 'chat' | 'settings') => void;
  toggleApp: () => Promise<void>;
  onStealthCycle: (callback: () => void) => () => void;
  onEmergencyHide: (callback: () => void) => () => void;
  // Visibility/content protection indicator
  onContentProtectionChanged: (callback: (enabled: boolean) => void) => () => void;
  onWindowVisibilityChanged: (callback: (visible: boolean) => void) => () => void;
  getMode: () => Promise<'live' | 'voice' | 'chat' | 'settings'>;
  isMode: (mode: 'live' | 'voice' | 'chat' | 'settings') => Promise<boolean>;
  getModeHistory: () => Promise<Array<'live' | 'voice' | 'chat' | 'settings'>>;
  setModeHistory: (modes: Array<'live' | 'voice' | 'chat' | 'settings'>) => Promise<void>;
  resetModeHistory: () => Promise<void>;
  getPreviousMode: () => Promise<'live' | 'voice' | 'chat' | 'settings' | null>;
  getNextMode: () => Promise<'live' | 'voice' | 'chat' | 'settings' | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 
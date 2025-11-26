// ProcessingHelper.ts

import { AppState } from "./main"
import { LLMHelper } from "./LLMHelper"
import dotenv from "dotenv"
import path from "node:path"
import fs from "node:fs"
import { app } from "electron"

const isDev = process.env.NODE_ENV === "development"
const isDevTest = process.env.IS_DEV_TEST === "true"
const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500

export class ProcessingHelper {
  private appState: AppState
  private llmHelper: LLMHelper
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  private sendDebugLog(type: 'info' | 'error' | 'warning' | 'success', source: string, message: string, data?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      source,
      message,
      data
    };
    
    // Send to console
    console.log(`[ProcessingHelper] [${type.toUpperCase()}] [${source}] ${message}`, data || '');
    
    // Send to renderer via IPC
    const mainWindow = this.appState.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('solve-debug', logEntry);
    }
  }

  constructor(appState: AppState) {
    this.appState = appState
    this.sendDebugLog('info', 'Initialization', 'ProcessingHelper starting...');

    // Load environment variables from multiple possible locations
    const isDevelopment = process.env.NODE_ENV === "development"
    const candidates: string[] = []

    try {
      const exeDir = path.dirname(process.execPath)
      // 1) Next to the executable (installed or unpacked)
      candidates.push(path.join(exeDir, ".env"))
    } catch {}

    try {
      // 2) Parent of resources path (e.g., .../win-unpacked/.env or install dir/.env)
      candidates.push(path.resolve(process.resourcesPath || __dirname, "..", ".env"))
    } catch {}

    try {
      // 3) User data directory (allows per-user configuration)
      candidates.push(path.join(app.getPath("userData"), ".env"))
    } catch {}

    // 4) Current working directory (when launched from a shell)
    candidates.push(path.resolve(process.cwd(), ".env"))

    // 5) App path (useful in development)
    try {
      candidates.push(path.resolve(app.getAppPath(), ".env"))
    } catch {}

    let loadedFrom: string | null = null
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          dotenv.config({ path: p })
          loadedFrom = p
          break
        }
      } catch {}
    }
    if (!loadedFrom && isDevelopment) {
      // As a final fallback in dev, try default .env load
      dotenv.config()
    }
    if (loadedFrom) {
      console.log(`[ProcessingHelper] Loaded .env from: ${loadedFrom}`)
    } else {
      console.warn("[ProcessingHelper] No .env file found; relying on process env")
    }
    
    // Check if user wants to use Ollama
    const useOllama = String(process.env.USE_OLLAMA || "").toLowerCase() === "true"
    const ollamaModel = process.env.OLLAMA_MODEL // Don't set default here, let LLMHelper auto-detect
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434"
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite-preview-09-2025"
    
    if (useOllama) {
      console.log("[ProcessingHelper] Initializing with Ollama")
      this.llmHelper = new LLMHelper(undefined, true, ollamaModel, ollamaUrl, geminiModel)
    } else {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not found in environment variables. Set GEMINI_API_KEY or enable Ollama with USE_OLLAMA=true")
      }
      console.log("[ProcessingHelper] Initializing with Gemini")
      this.llmHelper = new LLMHelper(apiKey, false, undefined, undefined, geminiModel)
    }
  }

  public async processScreenshots(): Promise<void> {
    this.sendDebugLog('info', 'Solve', 'processScreenshots called');
    
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) {
      this.sendDebugLog('error', 'Solve', 'No main window available');
      return;
    }

    const view = this.appState.getView()
    this.sendDebugLog('info', 'Solve', `Current view: ${view}`);

    if (view === "queue") {
      const screenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue()
      this.sendDebugLog('info', 'Solve', `Screenshot queue length: ${screenshotQueue.length}`, { queue: screenshotQueue });
      
      if (screenshotQueue.length === 0) {
        this.sendDebugLog('warning', 'Solve', 'No screenshots in queue');
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      // Check if last screenshot is an audio file
      const allPaths = this.appState.getScreenshotHelper().getScreenshotQueue();
      const lastPath = allPaths[allPaths.length - 1];
      this.sendDebugLog('info', 'Solve', `Processing file: ${lastPath}`);
      
      if (lastPath.endsWith('.mp3') || lastPath.endsWith('.wav')) {
        this.sendDebugLog('info', 'Solve', 'Detected audio file, processing...');
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START);
        this.appState.setView('solutions');
        try {
          this.sendDebugLog('info', 'Solve', 'Analyzing audio file with LLM...');
          const audioResult = await this.llmHelper.analyzeAudioFile(lastPath);
          this.sendDebugLog('success', 'Solve', 'Audio analysis complete', { text: audioResult.text.substring(0, 100) });
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, audioResult);
          this.appState.setProblemInfo({ problem_statement: audioResult.text, input_format: {}, output_format: {}, constraints: [], test_cases: [] });
          return;
        } catch (err: any) {
          this.sendDebugLog('error', 'Solve', 'Audio processing failed', { error: err.message, stack: err.stack });
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, err.message);
          return;
        }
      }

      // NEW: Handle screenshot as plain text (like audio)
      this.sendDebugLog('info', 'Solve', 'Processing screenshot image...');
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")
      this.currentProcessingAbortController = new AbortController()
      try {
        this.sendDebugLog('info', 'Solve', 'Analyzing image with LLM...');
        const imageResult = await this.llmHelper.analyzeImageFile(lastPath);
        this.sendDebugLog('success', 'Solve', 'Image analysis complete', { text: imageResult.text.substring(0, 100) });
        
        const problemInfo = {
          problem_statement: imageResult.text,
          input_format: { description: "Generated from screenshot", parameters: [] as any[] },
          output_format: { description: "Generated from screenshot", type: "string", subtype: "text" },
          complexity: { time: "N/A", space: "N/A" },
          test_cases: [] as any[],
          validation_type: "manual",
          difficulty: "custom"
        };
        this.sendDebugLog('success', 'Solve', 'Problem info generated, sending to frontend');
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, problemInfo);
        this.appState.setProblemInfo(problemInfo);
      } catch (error: any) {
        this.sendDebugLog('error', 'Solve', 'Image processing failed', { error: error.message, stack: error.stack });
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, error.message)
      } finally {
        this.currentProcessingAbortController = null
      }
      return;
    } else {
      // Debug mode
      const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue()
      if (extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots to process")
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START)
      this.currentExtraProcessingAbortController = new AbortController()

      try {
        // Get problem info and current solution
        const problemInfo = this.appState.getProblemInfo()
        if (!problemInfo) {
          throw new Error("No problem info available")
        }

        // Get current solution from state
        const currentSolution = await this.llmHelper.generateSolution(problemInfo)
        const currentCode = currentSolution.solution.code

        // Debug the solution using vision model
        const debugResult = await this.llmHelper.debugSolutionWithImages(
          problemInfo,
          currentCode,
          extraScreenshotQueue
        )

        this.appState.setHasDebugged(true)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
          debugResult
        )

      } catch (error: any) {
        console.error("Debug processing error:", error)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
          error.message
        )
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  public cancelOngoingRequests(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }

    this.appState.setHasDebugged(false)
  }

  public async processAudioBase64(data: string, mimeType: string) {
    // Directly use LLMHelper to analyze inline base64 audio
    return this.llmHelper.analyzeAudioFromBase64(data, mimeType);
  }

  // Add audio file processing method
  public async processAudioFile(filePath: string) {
    return this.llmHelper.analyzeAudioFile(filePath);
  }

  public getLLMHelper() {
    return this.llmHelper;
  }
}

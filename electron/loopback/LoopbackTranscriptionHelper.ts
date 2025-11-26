import { AppState } from "../main";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import path from "path";

export class LoopbackTranscriptionHelper {
  private appState: AppState;
  private pyProc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private currentModel: string = "large-v3";
  private currentEngine: string = "openai";
  private isStarting = false;
  private isStopping = false;

  constructor(appState: AppState) {
    this.appState = appState;
  }

  public async start(model: string = "medium", engine: string = "openai"): Promise<void> {
    // Prevent concurrent start operations
    if (this.isStarting) {
      console.log("[LoopbackHelper] Start already in progress, waiting...");
      while (this.isStarting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
    
    this.isStarting = true;
    
    try {
      // Force stop any existing process first with enhanced cleanup
      if (this.pyProc) {
        console.log("Stopping existing process before starting new one");
        await this.forceStop();
        // Minimal wait for process cleanup in compiled exe environment
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    console.log("LoopbackTranscriptionHelper.start called with:", { model, engine });
    this.currentModel = model;
    this.currentEngine = engine;

    // Enhanced script path resolution for both unpacked and installed versions
    let scriptPath: string;
    const scriptCandidates = [
      // For unpacked version (win-unpacked)
      path.join(process.cwd(), "worker-script", "python", "loopback_transcribe.py"),
      // For installed version (extraResources)
      path.join(process.resourcesPath || process.cwd(), "worker-script", "python", "loopback_transcribe.py"),
      // For ASAR unpacked version
      path.join(process.resourcesPath || process.cwd(), "app.asar.unpacked", "worker-script", "python", "loopback_transcribe.py"),
      // Relative to dist-electron
      path.join(__dirname, "..", "worker-script", "python", "loopback_transcribe.py")
    ];
    
    scriptPath = scriptCandidates[0]; // Default
    
    // Find the first existing script file
    for (const candidate of scriptCandidates) {
      try {
        const fs = require('fs');
        if (fs.existsSync(candidate)) {
          scriptPath = candidate;
          console.log(`[LoopbackHelper] Found Python script at: ${scriptPath}`);
          break;
        }
      } catch {}
    }
    
    console.log(`[LoopbackHelper] Using Python script: ${scriptPath}`);
    
    // Enhanced Python binary resolution with bundled portable Python
    let pythonBinary: string;
    const isProduction = process.env.NODE_ENV === 'production' || (process as any).pkg;
    
    if (isProduction) {
      // In production, use bundled portable Python first, then fallback to system
      const pythonCandidates = [
        path.join(process.resourcesPath || process.cwd(), "python-portable", "python.exe"), // Bundled portable Python
        path.join(process.cwd(), "python-portable", "python.exe"), // Local portable Python
        "python", // System Python fallback
        "python.exe",
        "py", // Python Launcher
        "py.exe"
      ];
      
      pythonBinary = pythonCandidates[0]; // Default to bundled
      
      // Find the first existing Python binary
      for (const candidate of pythonCandidates) {
        try {
          const fs = require('fs');
          if (candidate.includes('python.exe') && fs.existsSync(candidate)) {
            pythonBinary = candidate;
            console.log(`[LoopbackHelper] Found bundled Python at: ${pythonBinary}`);
            break;
          } else if (!candidate.includes('python.exe')) {
            pythonBinary = candidate; // System python
            console.log(`[LoopbackHelper] Using system Python: ${pythonBinary}`);
            break;
          }
        } catch {}
      }
    } else {
      // In development, prefer venv Python but fallback to system
      const devCandidates = [
        path.join(process.cwd(), "..", ".venv", "Scripts", "python.exe"),
        path.join(process.cwd(), "python-portable", "python.exe"), // Local portable for testing
        "python",
        "python.exe"
      ];
      
      pythonBinary = devCandidates[0]; // Default
      for (const candidate of devCandidates) {
        try {
          const fs = require('fs');
          if (candidate.includes('python.exe') && fs.existsSync(candidate)) {
            pythonBinary = candidate;
            break;
          } else if (!candidate.includes('python.exe')) {
            pythonBinary = candidate; // System python
            break;
          }
        } catch {}
      }
      console.log(`[LoopbackHelper] Using Python for development: ${pythonBinary}`);
    }

    // CRITICAL: Use -s flag to prevent Python from adding user site-packages
    this.pyProc = spawn(pythonBinary, ["-s", "-u", scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        WHISPER_MODEL: model,
        WHISPER_ENGINE: engine,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });

    this.pyProc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((line: string) => line.trim());
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          
          if (parsed.type === 'ready') {
            console.log(`Loopback transcription ready with ${parsed.model}`);
            this.ready = true;
            this.currentModel = parsed.model;
            this.currentEngine = parsed.engine;
            
            // Notify renderer if fallback occurred
            if (parsed.fallback) {
              const win = this.appState.getMainWindow();
              if (win) {
                win.webContents.send('loopback-fallback', {
                  originalModel: 'large-v3',
                  fallbackModel: parsed.model,
                  message: 'Switched to base model due to initialization issues'
                });
              }
            }
          } else if (parsed.type === 'status' || parsed.type === 'debug') {
            console.log('Loopback status:', parsed.message);
            // Send status updates to renderer for user feedback
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('loopback-status', parsed.message);
            }
          } else if (parsed.type === 'transcription' && parsed.text?.trim()) {
            // Send transcription to renderer
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('loopback-transcription', {
                text: parsed.text,
                timestamp: Date.now(),
                confidence: parsed.confidence || 0.9
              });
            }
          } else if (parsed.type === 'error') {
            console.error('Loopback transcription error:', parsed.error);
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('loopback-error', parsed.error);
            }
          }
        } catch (e) {
          console.error("[LoopbackTranscriptionHelper] parse error:", line, e);
        }
      }
    });

    this.pyProc.stderr.on("data", (data: Buffer) => {
      console.error("[LoopbackTranscriptionHelper] STDERR:", data.toString());
    });

    this.pyProc.on("exit", (code, signal) => {
      console.log(`[LoopbackTranscriptionHelper] exited: code=${code} signal=${signal}`);
      this.pyProc = null;
      this.ready = false;
    });
    
    } finally {
      this.isStarting = false;
    }
  }

  public async stop(): Promise<void> {
    if (!this.pyProc) return;
    await this.forceStop();
  }

  private async forceStop(): Promise<void> {
    if (!this.pyProc) return;
    
    // Prevent concurrent stop operations
    if (this.isStopping) {
      console.log("[LoopbackHelper] Stop already in progress, waiting...");
      while (this.isStopping) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
    
    this.isStopping = true;
    
    const proc = this.pyProc;
    this.pyProc = null;
    this.ready = false;
    
    try {
      // Enhanced process termination for compiled exe
      console.log("[LoopbackHelper] Initiating graceful shutdown...");
      
      // Step 1: Try graceful termination
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
      
      // Step 2: Wait for graceful exit with extended timeout for compiled exe
      const gracefulExit = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log("[LoopbackHelper] Graceful shutdown timeout, forcing kill...");
          resolve();
        }, 3000); // Reduced timeout for faster shutdown
        
        proc.on('exit', () => {
          clearTimeout(timeout);
          console.log("[LoopbackHelper] Process exited gracefully");
          resolve();
        });
      });
      
      await gracefulExit;
      
      // Step 3: Force kill if still running
      if (!proc.killed) {
        console.log("[LoopbackHelper] Force killing process...");
        proc.kill("SIGKILL");
        
        // Wait for force kill to complete
        await new Promise<void>((resolve) => {
          const forceTimeout = setTimeout(() => {
            console.log("[LoopbackHelper] Force kill completed (timeout)");
            resolve();
          }, 2000);
          
          proc.on('exit', () => {
            clearTimeout(forceTimeout);
            console.log("[LoopbackHelper] Process force killed successfully");
            resolve();
          });
        });
      }
      
      // Step 4: Additional cleanup for Windows compiled exe
      if (process.platform === 'win32') {
        try {
          // Kill any remaining Python processes that might be hanging
          const { exec } = require('child_process');
          exec(`taskkill /F /IM python.exe /T`, (error: any) => {
            if (error) {
              console.log("[LoopbackHelper] No hanging Python processes found (expected)");
            } else {
              console.log("[LoopbackHelper] Cleaned up hanging Python processes");
            }
          });
        } catch (cleanupError) {
          console.log("[LoopbackHelper] Process cleanup completed");
        }
      }
      
    } catch (error) {
      console.error("[LoopbackHelper] Error during process termination:", error);
    }
    
    console.log("[LoopbackHelper] Process cleanup completed");
    this.isStopping = false;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getCurrentModel(): string {
    return this.currentModel;
  }

  public getCurrentEngine(): string {
    return this.currentEngine;
  }
}

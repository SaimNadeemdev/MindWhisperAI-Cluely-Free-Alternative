import { AppState } from "../main";
import { ChildProcessWithoutNullStreams, spawn, ChildProcess } from "child_process";
import path from "path";

export class DeepgramTranscriptionHelper {
  private pythonProcess: ChildProcess | null = null
  private appState: AppState
  
  // Advanced backend transcript processing
  private accumulatedTranscript: string = ""
  private lastTranscriptTime: number = 0
  private silenceTimer: NodeJS.Timeout | null = null
  private readonly SILENCE_THRESHOLD = 1200 // 1.2s silence detection
  private pyProc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private currentModel: string = "nova-2";
  private apiKey: string = "";
  private isStarting = false;
  private isStopping = false;

  constructor(appState: AppState) {
    this.appState = appState;
  }

  private sendDebugLog(type: 'info' | 'error' | 'warning' | 'success', source: string, message: string, data?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      source,
      message,
      data
    };
    
    // Send to console
    console.log(`[DeepgramHelper] [${type.toUpperCase()}] [${source}] ${message}`, data || '');
    
    // Send to renderer via IPC
    const mainWindow = this.appState.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('deepgram-debug', logEntry);
    }
  }

  // ADVANCED: Intelligent backend transcript processing
  private processTranscriptIntelligently(text: string, confidence: number): void {
    console.log('[DeepgramHelper] 🧠 INTELLIGENT PROCESSING:', text);
    
    // SMART ACCUMULATION: Merge new fragment with overlap-aware logic to avoid duplication
    const before = this.accumulatedTranscript;
    this.accumulatedTranscript = this.mergeIncremental(this.accumulatedTranscript, text);
    if (!before) {
      console.log('[DeepgramHelper] 📝 Started new accumulation:', this.accumulatedTranscript);
    } else if (this.accumulatedTranscript !== before) {
      console.log('[DeepgramHelper] 📝 Accumulation merged ->', this.accumulatedTranscript.substring(0, 120) + '...');
    } else {
      console.log('[DeepgramHelper] 📝 No change after merge (duplicate fragment)');
    }
    
    this.lastTranscriptTime = Date.now();
    
    // Clear existing silence timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    
    // OPTIMIZED SILENCE THRESHOLD: Wait for configured silence before processing
    this.silenceTimer = setTimeout(() => {
      this.processAccumulatedTranscript();
    }, this.SILENCE_THRESHOLD);
  }

  // Merge two incremental transcript strings while avoiding duplicated overlaps
  private mergeIncremental(prev: string, next: string): string {
    const p = (prev || '').trim();
    const n = (next || '').trim();
    if (!p) return n;
    if (!n) return p;
    const pw = p.split(/\s+/);
    const nw = n.split(/\s+/);
    const lp = p.toLowerCase();
    const ln = n.toLowerCase();
    if (ln.startsWith(lp) || ln.includes(lp)) return n;
    if (lp.startsWith(ln) || lp.includes(ln)) return p;
    const maxOverlap = Math.min(20, pw.length, nw.length);
    for (let i = maxOverlap; i > 0; i--) {
      const ps = pw.slice(-i).join(' ').toLowerCase();
      const ns = nw.slice(0, i).join(' ').toLowerCase();
      if (ps === ns) {
        return p + ' ' + nw.slice(i).join(' ');
      }
    }
    return p + ' ' + n;
  }

  // Process accumulated transcript for command extraction
  private async processAccumulatedTranscript(): Promise<void> {
    if (!this.accumulatedTranscript.trim()) return;
    
    console.log('[DeepgramHelper] 🔥 PROCESSING COMPLETE TRANSCRIPT:', this.accumulatedTranscript);
    
    try {
      // Use LLMHelper for command extraction
      const llmHelper = this.appState.processingHelper.getLLMHelper();
      const commands = await llmHelper.extractCommandsFromUtterance(this.accumulatedTranscript);
      
      if (commands && commands.length > 0) {
        console.log('[DeepgramHelper] ✅ EXTRACTED COMMAND:', commands[0]);
        
        // Send command directly to frontend
        const win = this.appState.getMainWindow();
        if (win) {
          console.log('[DeepgramHelper] 📤 SENDING COMMAND TO FRONTEND:', {
            command: commands[0].command_text,
            originalTranscript: this.accumulatedTranscript
          });
          win.webContents.send('command-extracted', {
            command: commands[0],
            originalTranscript: this.accumulatedTranscript,
            timestamp: Date.now()
          });
          console.log('[DeepgramHelper] ✅ Command sent to frontend successfully');
        } else {
          console.error('[DeepgramHelper] ❌ No main window available to send command');
        }
      } else {
        console.log('[DeepgramHelper] ❌ No actionable commands found in:', this.accumulatedTranscript);
      }
    } catch (error) {
      console.error('[DeepgramHelper] Error processing transcript:', error);
    }
    
    // Clear accumulated transcript for next utterance
    this.accumulatedTranscript = "";
  }

  public async start(model: string = "nova-2", apiKey: string): Promise<void> {
    this.sendDebugLog('info', 'Start', `Starting Deepgram with model: ${model}`, { model, hasApiKey: !!apiKey });
    
    // Prevent concurrent start operations
    if (this.isStarting) {
      this.sendDebugLog('warning', 'Start', 'Start already in progress, waiting...');
      while (this.isStarting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
    
    this.isStarting = true;
    
    try {
      // Force stop any existing process first with enhanced cleanup
      if (this.pyProc) {
        console.log("Stopping existing Deepgram process before starting new one");
        await this.forceStop();
        // Fast process cleanup for optimized startup
        await new Promise(resolve => setTimeout(resolve, 200));
      }

    if (!apiKey) {
      this.sendDebugLog('error', 'Start', 'Deepgram API key is required but not provided');
      throw new Error("Deepgram API key is required");
    }
    
    this.sendDebugLog('success', 'Start', 'API key validated', { keyLength: apiKey.length });

    console.log("DeepgramTranscriptionHelper.start called with:", { model, apiKey: "***" });
    this.currentModel = model;
    this.apiKey = apiKey;

    // Enhanced script path resolution for both unpacked and installed versions
    let scriptPath: string;
    const scriptCandidates = [
      // For unpacked version (win-unpacked)
      path.join(process.cwd(), "worker-script", "python", "deepgram_transcribe.py"),
      // For installed version (extraResources)
      path.join(process.resourcesPath || process.cwd(), "worker-script", "python", "deepgram_transcribe.py"),
      // For ASAR unpacked version
      path.join(process.resourcesPath || process.cwd(), "app.asar.unpacked", "worker-script", "python", "deepgram_transcribe.py"),
      // Relative to dist-electron
      path.join(__dirname, "..", "worker-script", "python", "deepgram_transcribe.py")
    ];
    
    scriptPath = scriptCandidates[0]; // Default
    
    this.sendDebugLog('info', 'Script Resolution', 'Searching for Python script...', { candidates: scriptCandidates });
    
    // Find the first existing script file
    for (const candidate of scriptCandidates) {
      try {
        const fs = require('fs');
        if (fs.existsSync(candidate)) {
          scriptPath = candidate;
          this.sendDebugLog('success', 'Script Resolution', `Found Python script at: ${scriptPath}`);
          break;
        }
      } catch {}
    }
    
    this.sendDebugLog('info', 'Script Resolution', `Using Python script: ${scriptPath}`);
    
    // Enhanced Python binary resolution with bundled portable Python
    let pythonBinary: string;
    // Better production detection: check if app is packaged (has resourcesPath and it's different from cwd)
    const isProduction = process.env.NODE_ENV === 'production' || 
                         (process as any).pkg || 
                         (process.resourcesPath && process.resourcesPath !== process.cwd()) ||
                         __dirname.includes('app.asar');
    
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
      
      this.sendDebugLog('info', 'Python Resolution', 'Production mode: Searching for Python binary...', { candidates: pythonCandidates });
      
      // Find the first existing Python binary
      for (const candidate of pythonCandidates) {
        try {
          const fs = require('fs');
          if (candidate.includes('python.exe') && fs.existsSync(candidate)) {
            pythonBinary = candidate;
            this.sendDebugLog('success', 'Python Resolution', `Found bundled Python at: ${pythonBinary}`);
            break;
          } else if (!candidate.includes('python.exe')) {
            pythonBinary = candidate; // System python
            this.sendDebugLog('info', 'Python Resolution', `Using system Python: ${pythonBinary}`);
            break;
          }
        } catch {}
      }
    } else {
      // In development, prefer local portable for testing, then system
      const devCandidates = [
        path.join(process.cwd(), "python-portable", "python.exe"), // Local portable for testing
        "python",
        "python.exe"
      ];
      
      pythonBinary = devCandidates[1]; // Default to system for dev
      
      this.sendDebugLog('info', 'Python Resolution', 'Development mode: Searching for Python binary...', { candidates: devCandidates });
      
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
      this.sendDebugLog('success', 'Python Resolution', `Using Python for development: ${pythonBinary}`);
    }

    // Test Python dependencies before starting transcription
    this.sendDebugLog('info', 'Dependency Check', 'Testing Python dependencies...');
    try {
      const testScript = path.join(path.dirname(scriptPath), 'test_deepgram_dependencies.py');
      if (require('fs').existsSync(testScript)) {
        this.sendDebugLog('info', 'Dependency Check', `Running test script: ${testScript}`);
        const testResult = require('child_process').spawnSync(pythonBinary, [testScript], {
          encoding: 'utf-8',
          timeout: 30000
        });
        
        if (testResult.status !== 0) {
          this.sendDebugLog('error', 'Dependency Check', 'Python dependency test FAILED', {
            stdout: testResult.stdout,
            stderr: testResult.stderr,
            exitCode: testResult.status
          });
          throw new Error('Missing Python dependencies. Please reinstall the application.');
        } else {
          this.sendDebugLog('success', 'Dependency Check', 'All Python dependencies verified', {
            output: testResult.stdout
          });
        }
      } else {
        this.sendDebugLog('warning', 'Dependency Check', 'Test script not found, skipping verification');
      }
    } catch (testError: any) {
      this.sendDebugLog('warning', 'Dependency Check', `Could not verify dependencies: ${testError.message}`);
      // Continue anyway - the actual script will fail with better error messages
    }

    this.pyProc = spawn(pythonBinary, ["-u", scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DEEPGRAM_API_KEY: apiKey,
        DEEPGRAM_MODEL: model,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
        // Ensure Python can find bundled packages
        PYTHONPATH: path.join(path.dirname(pythonBinary), 'Lib', 'site-packages'),
        PYTHONHOME: path.dirname(pythonBinary),
      },
    });

    this.pyProc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((line: string) => line.trim());
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          
          if (parsed.type === 'ready') {
            console.log(`Deepgram transcription ready with ${parsed.model}`);
            this.ready = true;
            this.currentModel = parsed.model;
            
            // Notify renderer that Deepgram is ready
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('deepgram-ready', {
                model: parsed.model,
                engine: parsed.engine
              });
            }
          } else if (parsed.type === 'status' || parsed.type === 'debug') {
            console.log('Deepgram status:', parsed.message);
            // Send status updates to renderer for user feedback
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('deepgram-status', parsed.message);
            }
          } else if (parsed.type === 'transcription' && parsed.text?.trim()) {
            console.log('[DeepgramHelper] Processing transcription:', parsed.text);
            
            // ADVANCED: Backend auto-processing with intelligent accumulation
            try {
              console.log('[DeepgramHelper] 🔧 About to call processTranscriptIntelligently...');
              this.processTranscriptIntelligently(parsed.text, parsed.confidence || 0.9);
              console.log('[DeepgramHelper] ✅ processTranscriptIntelligently completed');
            } catch (error) {
              console.error('[DeepgramHelper] ❌ Error in processTranscriptIntelligently:', error);
            }
            
            // Still send to renderer for display purposes
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('deepgram-transcription', {
                text: parsed.text,
                timestamp: Date.now(),
                confidence: parsed.confidence || 0.9
              });
            }
          } else if (parsed.type === 'error') {
            console.error('Deepgram transcription error:', parsed.error);
            const win = this.appState.getMainWindow();
            if (win) {
              win.webContents.send('deepgram-error', parsed.error);
            }
          }
        } catch (e) {
          console.error("[DeepgramTranscriptionHelper] parse error:", line, e);
        }
      }
    });

    this.pyProc.stderr.on("data", (data: Buffer) => {
      console.error("[DeepgramTranscriptionHelper] STDERR:", data.toString());
    });

    this.pyProc.on("exit", (code, signal) => {
      console.log(`[DeepgramTranscriptionHelper] exited: code=${code} signal=${signal}`);
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
      console.log("[DeepgramHelper] Stop already in progress, waiting...");
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
      console.log("[DeepgramHelper] Initiating graceful shutdown...");
      
      // Step 1: Try graceful termination
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
      
      // Step 2: Wait for graceful exit with extended timeout for compiled exe
      const gracefulExit = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.log("[DeepgramHelper] Graceful shutdown timeout, forcing kill...");
          resolve();
        }, 3000); // Reduced timeout for faster shutdown
        
        proc.on('exit', () => {
          clearTimeout(timeout);
          console.log("[DeepgramHelper] Process exited gracefully");
          resolve();
        });
      });
      
      await gracefulExit;
      
      // Step 3: Force kill if still running
      if (!proc.killed) {
        console.log("[DeepgramHelper] Force killing process...");
        proc.kill("SIGKILL");
        
        // Wait for force kill to complete
        await new Promise<void>((resolve) => {
          const forceTimeout = setTimeout(() => {
            console.log("[DeepgramHelper] Force kill completed (timeout)");
            resolve();
          }, 2000);
          
          proc.on('exit', () => {
            clearTimeout(forceTimeout);
            console.log("[DeepgramHelper] Process force killed successfully");
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
              console.log("[DeepgramHelper] No hanging Python processes found (expected)");
            } else {
              console.log("[DeepgramHelper] Cleaned up hanging Python processes");
            }
          });
        } catch (cleanupError) {
          console.log("[DeepgramHelper] Process cleanup completed");
        }
      }
      
    } catch (error) {
      console.error("[DeepgramHelper] Error during process termination:", error);
    }
    
    console.log("[DeepgramHelper] Process cleanup completed");
    this.isStopping = false;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getCurrentModel(): string {
    return this.currentModel;
  }

  public getApiKey(): string {
    return this.apiKey ? "***" : ""; // Never return actual API key
  }
}

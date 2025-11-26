import { AppState } from "./main";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import path from "path";

export type TranscriptWord = { word: string; start: number; end: number };
export type TranscriptResult = { id: string; text: string; words?: TranscriptWord[] };

export class MoonshineTranscriptionHelper {
  private appState: AppState;
  private pyProc: ChildProcessWithoutNullStreams | null = null;
  private pending: Map<string, (res: TranscriptResult | null, err?: Error) => void> = new Map();
  private ready: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 2; // Reduced retries since Moonshine is more stable
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private requestTimeoutMs: number = Number(process.env.MOONSHINE_TIMEOUT_MS) || 60000; // Increase default to 60s to allow first-run model downloads

  constructor(appState: AppState) {
    this.appState = appState;
  }

  public async start(): Promise<void> {
    if (this.pyProc) return;

    const scriptPath = path.join(__dirname, "..", "worker-script", "python", "moonshine_transcribe.py");

    // Spawn persistent python process with Moonshine
    const pythonBinary = process.env.PYTHON_BIN || "python";
    console.log(`[MoonshineTranscriptionHelper] Spawning: ${pythonBinary} -u ${scriptPath}`);
    this.pyProc = spawn(pythonBinary, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Allow override from environment; default to higher-quality base model
        MOONSHINE_MODEL: process.env.MOONSHINE_MODEL || "moonshine/base",
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8"
      }
    });

    // Add process cleanup handler
    process.on('exit', () => {
      this.stop().catch(console.error);
    });

    this.pyProc.stdout.on("data", (data: Buffer) => {
      const messages = data.toString().split(/\n+/).filter(Boolean);
      for (const line of messages) {
        try {
          const msg = JSON.parse(line);
          
          if (msg.type === "ready") {
            this.ready = true;
            console.log(`[MoonshineTranscriptionHelper] Ready with model: ${msg.model || 'moonshine/tiny'}`);
            // Send an initial keepalive to ensure stdin remains open on Windows
            try {
              this.pyProc?.stdin.write(JSON.stringify({ type: "keepalive" }) + "\n");
            } catch {}
            // Start periodic keepalive pings
            if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = setInterval(() => {
              try {
                this.pyProc?.stdin.write(JSON.stringify({ type: "keepalive" }) + "\n");
              } catch {}
            }, 15000);
            continue;
          }
          
          if (msg.type === "result") {
            const cb = this.pending.get(msg.id);
            if (cb) {
              this.pending.delete(msg.id);
              cb({ id: msg.id, text: msg.text || "", words: msg.words || [] }, undefined);
            }
          } else if (msg.type === "error") {
            const cb = this.pending.get(msg.id);
            if (cb) {
              this.pending.delete(msg.id);
              cb(null, new Error(msg.error || "Unknown Moonshine error"));
            } else {
              console.error("[MoonshineTranscriptionHelper] Unhandled error:", msg.error);
            }
          }
        } catch (e) {
          console.error("[MoonshineTranscriptionHelper] Failed to parse python stdout:", line, e);
        }
      }
    });

    this.pyProc.stderr.on("data", (data: Buffer) => {
      const errorMsg = data.toString();
      console.error("[MoonshineTranscriptionHelper] Python STDERR:", errorMsg);
      
      // Check for specific Moonshine installation issues
      if (errorMsg.includes("moonshine_onnx not installed")) {
        console.error("[MoonshineTranscriptionHelper] Moonshine not installed. Run: pip install git+https://github.com/moonshine-ai/moonshine.git#subdirectory=moonshine-onnx");
      }
    });

    this.pyProc.on("exit", (code, signal) => {
      console.log(`[MoonshineTranscriptionHelper] Python process exited with code ${code} and signal ${signal}`);
      
      if (signal === 'SIGTERM') {
        console.log('[MoonshineTranscriptionHelper] Process was terminated gracefully');
      } else if (code !== 0) {
        console.error(`[MoonshineTranscriptionHelper] Process crashed with exit code ${code}`);
        
        // Moonshine-specific error handling
        if (code === 1) {
          console.error("[MoonshineTranscriptionHelper] Check Moonshine installation and model availability");
        }
      }
      
      this.pyProc = null;
      this.ready = false;
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
      
      // Auto-restart logic with exponential backoff (reduced retries)
      // Only retry on non-zero exit codes (unexpected/crash). Avoid infinite restarts on clean exit (code 0).
      if ((code ?? 0) !== 0) {
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.pow(2, this.retryCount) * 1000;
          console.log(`[MoonshineTranscriptionHelper] Will retry in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
          setTimeout(() => this.start(), delay);
        } else {
          console.error("[MoonshineTranscriptionHelper] Max retries exceeded. Manual restart required.");
        }
      }
    });

    // Wait for ready signal with timeout
    const readyTimeout = setTimeout(() => {
      if (!this.ready) {
        console.error("[MoonshineTranscriptionHelper] Timeout waiting for ready signal");
        this.stop();
      }
    }, 30000); // 30 second timeout

    // Clear timeout when ready
    const checkReady = setInterval(() => {
      if (this.ready) {
        clearTimeout(readyTimeout);
        clearInterval(checkReady);
      }
    }, 100);
  }

  public async stop(): Promise<void> {
    if (!this.pyProc) return;
    
    try {
      // Send graceful shutdown signal
      this.pyProc.stdin.write(JSON.stringify({ type: "shutdown" }) + "\n");
      
      // Give process time to shutdown gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error("[MoonshineTranscriptionHelper] Error during graceful shutdown:", e);
    }
    
    // Force kill if still running
    if (this.pyProc && !this.pyProc.killed) {
      this.pyProc.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        if (this.pyProc && !this.pyProc.killed) {
          this.pyProc.kill('SIGKILL');
        }
      }, 5000);
    }
    
    this.pyProc = null;
    this.ready = false;
    this.retryCount = 0;
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    
    // Reject all pending requests
    this.pending.forEach(cb => cb(null, new Error("Transcription service stopped")));
    this.pending.clear();
  }

  public async transcribeSegment(id: string, base64Wav: string): Promise<TranscriptResult> {
    if (!this.pyProc || !this.ready) {
      throw new Error("Moonshine transcription engine not ready");
    }

    const payload = {
      type: "transcribe",
      id,
      audio_base64: base64Wav,
    };

    return new Promise<TranscriptResult>((resolve, reject) => {
      // Set timeout for individual transcription requests
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Transcription request timeout"));
      }, this.requestTimeoutMs);

      this.pending.set(id, (res, err) => {
        clearTimeout(timeout);
        if (err || !res) return reject(err || new Error("Unknown Moonshine transcription error"));
        resolve(res);
      });

      try {
        this.pyProc!.stdin.write(JSON.stringify(payload) + "\n");
      } catch (e) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  public isReady(): boolean {
    return this.ready && this.pyProc !== null;
  }

  public getStatus(): { ready: boolean; retryCount: number; maxRetries: number } {
    return {
      ready: this.ready,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries
    };
  }
}

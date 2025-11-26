import { AppState } from "./main";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import path from "path";

export type TranscriptWord = { word: string; start: number; end: number };
export type TranscriptResult = { id: string; text: string; words?: TranscriptWord[] };

export class TranscriptionHelper {
  private appState: AppState;
  private pyProc: ChildProcessWithoutNullStreams | null = null;
  private pending: Map<string, (res: TranscriptResult | null, err?: Error) => void> = new Map();
  private ready: boolean = false;
  private retryCount: number = 0;

  constructor(appState: AppState) {
    this.appState = appState;
  }

  public async start(): Promise<void> {
    if (this.pyProc) return;

    const scriptPath = path.join(__dirname, "..", "worker-script", "python", "whisper_transcribe.py");

    // Spawn persistent python process
    const pythonBinary = process.env.PYTHON_BIN || "python";
    this.pyProc = spawn(pythonBinary, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        WHISPER_DEVICE: "cpu", // Force CPU mode
        WHISPER_MODEL: "tiny.en", // Use smallest model
        WHISPER_COMPUTE: "float32", // Most compatible
        HF_HOME: process.env.HF_HOME || path.join(require('os').homedir(), '.cache', 'huggingface')
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
              cb(null, new Error(msg.error || "Unknown error"));
            }
          }
        } catch (e) {
          console.error("[TranscriptionHelper] Failed to parse python stdout:", line, e);
        }
      }
    });

    this.pyProc.stderr.on("data", (data: Buffer) => {
      console.error("[TranscriptionHelper] Python STDERR:", data.toString());
    });

    this.pyProc.on("exit", (code, signal) => {
      console.error(`[TranscriptionHelper] Python process exited with code ${code} and signal ${signal}`);
      
      if (signal === 'SIGTERM') {
        console.error('[TranscriptionHelper] Process was terminated - check for:',
          '1. Memory constraints',
          '2. Anti-virus blocking',
          '3. Python environment conflicts');
      }
      // Additional diagnostics for common exit codes
      if (code === 3221225781) {
        console.error("[TranscriptionHelper] Detected CUDA initialization error - check GPU drivers");
      } else if (code === 1) {
        console.error("[TranscriptionHelper] Python script crashed - check model files and dependencies");
      }
      
      this.pyProc = null;
      this.ready = false;
      
      // Auto-restart logic (3 retries max)
      if (this.retryCount < 3) {
        this.retryCount++;
        const delay = Math.pow(2, this.retryCount) * 1000; // Exponential backoff
        console.log(`[TranscriptionHelper] Will retry in ${delay}ms (attempt ${this.retryCount}/3)`);
        setTimeout(() => this.start(), delay);
      }
    });
  }

  public async stop(): Promise<void> {
    if (!this.pyProc) return;
    try {
      this.pyProc.stdin.write(JSON.stringify({ type: "shutdown" }) + "\n");
    } catch {}
    this.pyProc.kill();
    this.pyProc = null;
    this.ready = false;
    this.pending.clear();
  }

  public async transcribeSegment(id: string, base64Wav: string): Promise<TranscriptResult> {
    if (!this.pyProc || !this.ready) {
      throw new Error("Transcription engine not ready");
    }

    const payload = {
      type: "transcribe",
      id,
      audio_base64: base64Wav,
    };

    return new Promise<TranscriptResult>((resolve, reject) => {
      this.pending.set(id, (res, err) => {
        if (err || !res) return reject(err || new Error("Unknown transcription error"));
        resolve(res);
      });
      try {
        this.pyProc!.stdin.write(JSON.stringify(payload) + "\n");
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }
}

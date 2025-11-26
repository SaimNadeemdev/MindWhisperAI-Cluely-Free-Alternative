// ipcHandlers.ts

import { ipcMain, app, shell } from "electron"
import { AppState } from "./main"

export function initializeIpcHandlers(appState: AppState): void {
  // License status endpoints
  ipcMain.handle("get-license-status", async () => {
    try {
      return appState.getLicenseManager().getStatus()
    } catch (e: any) {
      return { deviceId: "", status: "unknown", trialEndISO: null, serverTimeISO: null, daysLeft: 0, offline: true, message: e?.message || "error" }
    }
  })
  ipcMain.handle("force-verify-license", async () => {
    try {
      const status = await appState.getLicenseManager().forceVerify()
      return status
    } catch (e: any) {
      return { deviceId: "", status: "unknown", trialEndISO: null, serverTimeISO: null, daysLeft: 0, offline: true, message: e?.message || "error" }
    }
  })

  // External URL handler
  ipcMain.handle("open-external-url", async (event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error("Failed to open external URL:", error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      // Enforce license: taking screenshots is part of premium flow
      appState.getLicenseManager().ensureLicensed()
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      // Notify renderer(s) so they can react immediately
      const mainWindow = appState.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("screenshot-taken", {
          path: screenshotPath,
          preview
        })
      }
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("gemini-chat", async (event, message: string) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message);
      return result;
    } catch (error: any) {
      console.error("Error in gemini-chat handler:", error);
      throw error;
    }
  });

  // Add the MindWhisperAI-chat handler that the frontend is expecting
  ipcMain.handle("MindWhisperAI-chat", async (event, message: string) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message);
      return result;
    } catch (error: any) {
      console.error("Error in MindWhisperAI-chat handler:", error);
      throw error;
    }
  });

  // Native loopback transcription (WASAPI) start/stop with Whisper model selection
  ipcMain.handle("loopback-transcript-start", async (event, options: { model?: string, engine?: string } = {}) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const model = options.model || "medium";
      const engine = options.engine || "openai";
      console.log("IPC Handler received:", { model, engine, originalOptions: options });
      await appState.getLoopbackHelper().start(model, engine);
      return { success: true, model, engine };
    } catch (error: any) {
      console.error("Error starting loopback transcription:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("loopback-transcript-stop", async () => {
    try {
      await appState.getLoopbackHelper().stop();
      return { success: true };
    } catch (error: any) {
      console.error("Error stopping loopback transcription:", error);
      return { success: false, error: error.message };
    }
  });

  // Get current Whisper model configuration
  ipcMain.handle("loopback-get-model", async () => {
    try {
      const helper = appState.getLoopbackHelper();
      return {
        model: helper.getCurrentModel(),
        engine: helper.getCurrentEngine(),
        isReady: helper.isReady()
      };
    } catch (error: any) {
      return { model: "large-v3", engine: "openai", isReady: false };
    }
  });

  // Deepgram transcription handlers
  ipcMain.handle("deepgram-transcript-start", async (event, options: { model?: string } = {}) => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      const model = options.model || "nova-2";
      
      // Try to get API key from multiple sources
      let apiKey = process.env.DEEPGRAM_API_KEY;
      
      // If not in process.env, try to read from .env file directly
      if (!apiKey) {
        try {
          const fs = require('fs');
          const path = require('path');
          const candidates = [
            path.join(process.cwd(), '.env'),
            path.join(process.resourcesPath || __dirname, '.env')
          ];
          for (const envPath of candidates) {
            if (fs.existsSync(envPath)) {
              const envContent = fs.readFileSync(envPath, 'utf8');
              const envLines = envContent.split('\n');
              for (const line of envLines) {
                if (line.trim().startsWith('DEEPGRAM_API_KEY=')) {
                  apiKey = line.split('=')[1].trim().replace(/['"]/g, '');
                  break;
                }
              }
              if (apiKey) break;
            }
          }
        } catch (envError) {
          console.error("Error reading .env file:", envError);
        }
      }
      
      console.log("Environment check:", {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "none"
      });
      
      if (!apiKey) {
        return { success: false, error: "DEEPGRAM_API_KEY not found in environment variables or .env file. Please add it to your .env file." };
      }
      
      console.log("IPC Handler received Deepgram start:", { model, apiKey: "***" });
      await appState.getDeepgramHelper().start(model, apiKey);
      return { success: true, model, engine: "deepgram" };
    } catch (error: any) {
      console.error("Error starting Deepgram transcription:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("deepgram-transcript-stop", async () => {
    try {
      await appState.getDeepgramHelper().stop();
      return { success: true };
    } catch (error: any) {
      console.error("Error stopping Deepgram transcription:", error);
      return { success: false, error: error.message };
    }
  });

  // Get current Deepgram model configuration
  ipcMain.handle("deepgram-get-model", async () => {
    try {
      const helper = appState.getDeepgramHelper();
      return {
        model: helper.getCurrentModel(),
        engine: "deepgram",
        isReady: helper.isReady(),
        hasApiKey: helper.getApiKey() !== ""
      };
    } catch (error: any) {
      return { model: "nova-2", engine: "deepgram", isReady: false, hasApiKey: false };
    }
  });

  // Trigger the full processing pipeline (emits start/success/error events)
  ipcMain.handle("process-screenshots", async () => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      await appState.processingHelper.processScreenshots();
      return { success: true };
    } catch (error: any) {
      console.error("Error in process-screenshots handler:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // Live Transcription IPC
  ipcMain.handle("live-transcript-start", async () => {
    try {
      // Enforce license
      appState.getLicenseManager().ensureLicensed()
      await appState.getTranscriptionHelper().start();
      return { success: true };
    } catch (error: any) {
      console.error("Error starting live transcription:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("live-transcript-stop", async () => {
    try {
      await appState.getTranscriptionHelper().stop();
      return { success: true };
    } catch (error: any) {
      console.error("Error stopping live transcription:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("live-transcript-chunk", async (_evt, id: string, base64Wav: string) => {
    try {
      const res = await appState.getTranscriptionHelper().transcribeSegment(id, base64Wav);
      return res;
    } catch (error: any) {
      console.error("Error transcribing chunk:", error);
      return { id, text: "", words: [] };
    }
  });

  ipcMain.handle("extract-commands", async (_evt, utterance: string, timestampISO?: string) => {
    try {
      console.log("[IPC] extract-commands received:", {
        utteranceLength: utterance.length,
        utterancePreview: utterance.substring(0, 150) + '...',
        timestamp: timestampISO
      });
      
      const llm = appState.processingHelper.getLLMHelper();
      const result = await llm.extractCommandsFromUtterance(utterance, timestampISO);
      
      console.log("[IPC] extract-commands result:", {
        resultType: Array.isArray(result) ? 'array' : typeof result,
        resultLength: Array.isArray(result) ? result.length : 'N/A',
        result: result
      });
      
      return result; // array or null
    } catch (error: any) {
      console.error("Error extracting commands:", error);
      return null;
    }
  });

  ipcMain.handle("polish-command-response", async (_evt, commandText: string, context: { transcriptWindow: string; timestamp: string; who: string }) => {
    try {
      const llm = appState.processingHelper.getLLMHelper();
      const prompt = `You are an expert assistant writing a concise, professional reply to a meeting request or action item.\nContext transcript window (recent):\n${context.transcriptWindow}\n\nCommand: ${commandText}\nTimestamp: ${context.timestamp}\nSpeaker: ${context.who}\n\nWrite a polished, helpful response the user can say or paste. Keep it direct and under 120 words.`;
      const text = await llm.chatWithGemini(prompt);
      return { text };
    } catch (error: any) {
      console.error("Error generating polished response:", error);
      return { text: "" };
    }
  });

  // Window movement handlers
  ipcMain.handle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  ipcMain.handle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  ipcMain.handle("move-window-up", async () => {
    appState.moveWindowUp()
  })

  ipcMain.handle("move-window-down", async () => {
    appState.moveWindowDown()
  })

  ipcMain.handle("center-and-show-window", async () => {
    appState.centerAndShowWindow()
  })

  // LLM Model Management Handlers
  ipcMain.handle("get-current-llm-config", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return {
        provider: llmHelper.getCurrentProvider(),
        model: llmHelper.getCurrentModel(),
        isOllama: llmHelper.isUsingOllama()
      };
    } catch (error: any) {
      console.error("Error getting current LLM config:", error);
      throw error;
    }
  });

  ipcMain.handle("get-available-ollama-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const models = await llmHelper.getOllamaModels();
      return models;
    } catch (error: any) {
      console.error("Error getting Ollama models:", error);
      throw error;
    }
  });

  ipcMain.handle("switch-to-ollama", async (_, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Ollama:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-gemini", async (_, apiKey?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Gemini:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("test-llm-connection", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const result = await llmHelper.testConnection();
      return result;
    } catch (error: any) {
      console.error("Error testing LLM connection:", error);
      return { success: false, error: error.message };
    }
  });

  // AI Customization handlers
  ipcMain.handle("get-ai-customization", async () => {
    try {
      return appState.getAICustomization();
    } catch (error: any) {
      console.error("Error getting AI customization:", error);
      return null;
    }
  });

  ipcMain.handle("save-ai-customization", async (_, data: { cv: string; customPrompt: string }) => {
    try {
      await appState.saveAICustomization(data);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving AI customization:", error);
      return { success: false, error: error.message };
    }
  });

  // Waitlist handlers
  ipcMain.handle("get-waitlist-status", async () => {
    try {
      const status = appState.getWaitlistManager().getWaitlistStatus();
      const shouldShow = appState.getWaitlistManager().shouldShowWaitlistBar();
      return { 
        ...status,
        shouldShowBar: shouldShow
      };
    } catch (error: any) {
      console.error("Error getting waitlist status:", error);
      return { 
        hasJoined: false, 
        deviceId: "", 
        shouldShowBar: false,
        error: error.message 
      };
    }
  });

  ipcMain.handle("join-waitlist", async (_, name: string, email: string) => {
    try {
      console.log("[IPC] join-waitlist called with:", { name, email, nameType: typeof name, emailType: typeof email })
      const result = await appState.getWaitlistManager().joinWaitlist(name, email);
      
      // Send update to renderer about new status
      const mainWindow = appState.getMainWindow();
      if (mainWindow && result.success) {
        const updatedStatus = appState.getWaitlistManager().getWaitlistStatus();
        mainWindow.webContents.send('waitlist-status-updated', {
          ...updatedStatus,
          shouldShowBar: appState.getWaitlistManager().shouldShowWaitlistBar()
        });
      }
      
      return result;
    } catch (error: any) {
      console.error("Error joining waitlist:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("dismiss-waitlist", async () => {
    try {
      await appState.getWaitlistManager().dismissWaitlist();
      
      // Send update to renderer about new status
      const mainWindow = appState.getMainWindow();
      if (mainWindow) {
        const updatedStatus = appState.getWaitlistManager().getWaitlistStatus();
        mainWindow.webContents.send('waitlist-status-updated', {
          ...updatedStatus,
          shouldShowBar: appState.getWaitlistManager().shouldShowWaitlistBar()
        });
      }
      
      return { success: true };
    } catch (error: any) {
      console.error("Error dismissing waitlist:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-waitlist-stats", async () => {
    try {
      return appState.getWaitlistManager().getWaitlistStats();
    } catch (error: any) {
      console.error("Error getting waitlist stats:", error);
      return { totalEntries: 0, uniqueEmails: 0, uniqueDevices: 0 };
    }
  });

}

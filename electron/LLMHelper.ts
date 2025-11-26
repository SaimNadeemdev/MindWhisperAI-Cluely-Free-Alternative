import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"
import { app, nativeImage } from "electron"
import path from "path"

interface OllamaResponse {
  response: string
  done: boolean
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite-preview-09-2025"

export class LLMHelper {
  private model: GenerativeModel | null = null
  private geminiClient: GoogleGenerativeAI | null = null
  private geminiApiKey?: string
  private readonly baseSystemPrompt = `You are an AI assistant that responds to questions as if you are the user themselves, using their background and experience. When someone asks you interview questions or personal questions, answer directly as the user would, drawing from their CV, experience, and background information.

Respond naturally and conversationally, as if you're the person being interviewed. Use first person ("I", "my", "me") and speak about the user's experiences, skills, and background as your own. Be confident, personable, and authentic in your responses.

Answer questions directly without explaining that you're helping them prepare - just respond as if you ARE them in the conversation or interview.`
  private useOllama: boolean = false
  private ollamaModel: string = "llama3.2"
  private ollamaUrl: string = "http://localhost:11434"
  private geminiModel: string = DEFAULT_GEMINI_MODEL
  
  // Real-time streaming command extraction system
  private conversationBuffer: Array<{text: string, timestamp: number}> = []
  private lastCommandExtraction: number = 0
  private realtimeTimeout: number = 1500 // 1.5 seconds for real-time processing
  private maxBufferAge: number = 15000 // 15 seconds max conversation window
  private extractedCommandHashes: Set<string> = new Set()
  private maxHashCache: number = 100
  private pendingExtractions: Set<string> = new Set() // Track in-flight extractions
  private conversationContext: string = "" // Rolling conversation context
  private maxContextLength: number = 500 // Max chars for context

  constructor(apiKey?: string, useOllama: boolean = false, ollamaModel?: string, ollamaUrl?: string, geminiModel?: string) {
    this.useOllama = useOllama
    if (geminiModel) {
      this.geminiModel = geminiModel
    }
    if (useOllama) {
      this.ollamaUrl = ollamaUrl || "http://localhost:11434"
      this.ollamaModel = ollamaModel || "gemma:latest" // Default fallback
      console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)

      // Auto-detect and use first available model if specified model doesn't exist
      this.initializeOllamaModel()
    } else if (apiKey) {
      this.geminiApiKey = apiKey
      this.geminiClient = new GoogleGenerativeAI(apiKey)
      this.model = this.geminiClient.getGenerativeModel({ model: this.geminiModel })
      console.log(`[LLMHelper] Using Google Gemini model: ${this.geminiModel}`)
    } else {
      throw new Error("Either provide Gemini API key or enable Ollama mode")
    }
  }

  // AI Customization methods
  private getAICustomization(): { cv: string; customPrompt: string } | null {
    try {
      const customizationPath = path.join(app.getPath('userData'), 'ai-customization.json')
      if (fs.existsSync(customizationPath)) {
        const data = fs.readFileSync(customizationPath, 'utf8')
        return JSON.parse(data)
      }
      return null
    } catch (error) {
      console.error('Error reading AI customization in LLMHelper:', error)
      return null
    }
  }

  private get systemPrompt(): string {
    const customization = this.getAICustomization()
    let prompt = this.baseSystemPrompt

    if (customization) {
      if (customization.cv && customization.cv.trim()) {
        prompt += `\n\nUser Background/CV:\n${customization.cv.trim()}`
      }
      if (customization.customPrompt && customization.customPrompt.trim()) {
        prompt += `\n\nCustom Instructions:\n${customization.customPrompt.trim()}`
      }
    }

    return prompt
  }
  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    const mime = this.getMimeFromExtension(ext, true)
    return {
      inlineData: {
        data: imageData.toString("base64"),
        mimeType: mime
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present (more comprehensive)
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    // Remove any leading/trailing whitespace and newlines
    text = text.trim();
    return text;
  }

  private getMimeFromExtension(ext: string, isImage: boolean): string {
    const e = (ext || '').toLowerCase().replace(/^\./, '');
    if (isImage) {
      switch (e) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'webp': return 'image/webp';
        case 'bmp': return 'image/bmp';
        case 'gif': return 'image/gif';
        case 'tiff':
        case 'tif': return 'image/tiff';
        default: return 'image/png';
      }
    } else {
      switch (e) {
        case 'mp3': return 'audio/mpeg';
        case 'wav': return 'audio/wav';
        case 'ogg':
        case 'oga': return 'audio/ogg';
        case 'opus': return 'audio/opus';
        case 'webm': return 'audio/webm';
        case 'm4a': return 'audio/m4a';
        case 'aac': return 'audio/aac';
        case 'flac': return 'audio/flac';
        default: return 'audio/mpeg';
      }
    }
  }

  private ensureJsonOrNull(text: string): any {
    const cleaned = this.cleanJsonResponse(text);
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/(\[.*\]|null)/s);
      if (match) {
        return JSON.parse(match[1]);
      }
      throw new Error("Invalid JSON");
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data: OllamaResponse = await response.json()
      return data.response
    } catch (error) {
      console.error("[LLMHelper] Error calling Ollama:", error)
      throw new Error(`Failed to connect to Ollama: ${error.message}. Make sure Ollama is running on ${this.ollamaUrl}`)
    }
  }

  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  private async initializeOllamaModel(): Promise<void> {
    try {
      const availableModels = await this.getOllamaModels()
      if (availableModels.length === 0) {
        console.warn("[LLMHelper] No Ollama models found")
        return
      }

      // Check if current model exists, if not use the first available
      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }

      // Test the selected model works
      const testResult = await this.callOllama("Hello")
      console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
      // Try to use first available model as fallback
      try {
        const models = await this.getOllamaModels()
        if (models.length > 0) {
          this.ollamaModel = models[0]
          console.log(`[LLMHelper] Fallback to: ${this.ollamaModel}`)
        }
      } catch (fallbackError) {
        console.error(`[LLMHelper] Fallback also failed: ${fallbackError.message}`)
      }
    }
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling Gemini LLM for solution...");
    try {
      const result = await this.model.generateContent(prompt)
      console.log("[LLMHelper] Gemini LLM returned result.");
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error);
      throw error;
    }
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
      const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(audioPath: string) {
    try {
      const audioData = await fs.promises.readFile(audioPath);
      const ext = path.extname(audioPath).toLowerCase()
      const mime = this.getMimeFromExtension(ext, false)
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: mime
        }
      };
      const prompt = `${this.systemPrompt}\n\nListen to what the person is saying and respond as yourself, using your background and experience. Answer naturally and conversationally, as if you're responding in a real conversation or interview situation.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", { error, audioPath });
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string) {
    try {
      const audioPart = {
        inlineData: {
          data,
          mimeType
        }
      };
      const prompt = `${this.systemPrompt}\n\nListen to what the person is saying and respond as yourself, using your background and experience. Answer naturally and conversationally, as if you're responding in a real conversation or interview situation.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio from base64:", error);
      throw error;
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      // Always read the file first
      const originalData = await fs.promises.readFile(imagePath);
      const ext = path.extname(imagePath).toLowerCase();
      let mime: string = this.getMimeFromExtension(ext, true);

      // Helper: compress with nativeImage (preferred in Electron)
      const compressWithNativeImage = (inputBuf: Buffer): { out: Buffer; mime: string } | null => {
        try {
          let img = nativeImage.createFromPath(imagePath);
          if (img.isEmpty()) {
            img = nativeImage.createFromBuffer(inputBuf);
          }
          if (img.isEmpty()) return null;
          const size = img.getSize();
          const MAX_DIM = 1600;
          let target = img;
          if (Math.max(size.width, size.height) > MAX_DIM) {
            const scale = MAX_DIM / Math.max(size.width, size.height);
            target = img.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
          }
          // Encode as JPEG to reduce payload size substantially
          let quality = 80;
          let out = Buffer.from(target.toJPEG(quality));
          // If still too large (> 7MB), reduce quality once more
          if (out.length > 7 * 1024 * 1024) {
            quality = 65;
            out = Buffer.from(target.toJPEG(quality));
          }
          return { out, mime: 'image/jpeg' };
        } catch (e) {
          console.warn('[LLMHelper] nativeImage compression failed, will fallback to original buffer', e);
          return null;
        }
      };

      const compressed = compressWithNativeImage(originalData) || { out: originalData, mime };
      const finalBuf = compressed.out;
      mime = compressed.mime;

      console.log('[LLMHelper] analyzeImageFile prepared image', {
        path: imagePath,
        inputBytes: originalData.length,
        outputBytes: finalBuf.length,
        mime
      });

      const imagePart = {
        inlineData: {
          data: finalBuf.toString("base64"),
          mimeType: mime
        }
      };
      const prompt = `${this.systemPrompt}\n\nAnalyze this image and respond as yourself, using your background and experience. Describe what you see and provide your thoughts or insights based on your expertise. Answer naturally and conversationally, as if you're discussing the image in a real conversation or interview situation.`;
      const result = await this.model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing image file:", { error, imagePath });
      throw error;
    }
  }

  // Real-time streaming command extraction for live assistance
  public async extractCommandsFromUtterance(utterance: string, timestampISO?: string) {
    const ts = timestampISO || new Date().toISOString();
    const now = Date.now();
    
    console.log("[LLMHelper] Starting real-time command extraction:", {
      utteranceLength: utterance.length,
      utterancePreview: utterance.substring(0, 150) + '...',
      useOllama: this.useOllama,
      hasModel: !!this.model,
      timestamp: ts
    });
    
    // Update rolling conversation context for better understanding
    this.updateConversationContext(utterance.trim(), now);
    
    // Real-time sentence completion detection
    const isCompleteThought = this.detectSentenceCompletion(utterance);
    if (!isCompleteThought) {
      console.log("[LLMHelper] Utterance appears incomplete, waiting for completion...");
      return null;
    }
    
    // Fast duplicate prevention using utterance hash
    const utteranceHash = this.hashString(utterance.toLowerCase().trim());
    if (this.extractedCommandHashes.has(utteranceHash) || this.pendingExtractions.has(utteranceHash)) {
      console.log("[LLMHelper] Utterance already processed or in progress, skipping");
      return null;
    }
    
    // Mark as processing to prevent duplicates
    this.pendingExtractions.add(utteranceHash);
    
    // Fast heuristic filter before expensive LLM call
    if (!this.hasActionableContent(utterance)) {
      this.pendingExtractions.delete(utteranceHash);
      console.log("[LLMHelper] No actionable content detected, skipping extraction");
      return null;
    }
    
    this.lastCommandExtraction = now;
    console.log("[LLMHelper] Processing real-time command extraction:", {
      utteranceLength: utterance.length,
      utterancePreview: utterance.substring(0, 200) + '...',
      contextLength: this.conversationContext.length,
      contextPreview: this.conversationContext.substring(0, 100) + '...'
    });
    
    // Create context-aware prompt for real-time processing
    const recentContext = this.conversationContext ? `\nRecent conversation context: "${this.conversationContext}"` : '';
    const prompt = `${this.systemPrompt}\n\nYou are providing LIVE ASSISTANCE in real-time. Analyze the current utterance and extract EXACTLY ONE actionable command if it contains a clear question or request.\n\nCurrent utterance (timestamp ${ts}): "${utterance}"${recentContext}\n\nReturn EXACTLY one of:\n1) [ {\n  "command_text": "the question or request (max 100 chars)",\n  "timestamp": "${ts}",\n  "who_said_it": "other_participant",\n  "polished_response": "your immediate, confident reply (60-120 words) using your background and experience",\n  "confidence": 0.95\n} ]\n2) null\n\nSTRICT RULES FOR LIVE ASSISTANCE:\n- Process the CURRENT utterance with context awareness\n- SPEED IS CRITICAL - provide immediate responses for live help\n- ONLY extract if there's a CLEAR, DIRECT question or actionable request\n- Return EXACTLY ONE command maximum\n- JSON array with ONE object or null only\n- No markdown, no code fences, no extra text\n- High confidence (0.9+) responses only\n- Focus on interview questions, technical questions, or specific requests\n- Provide concise but complete responses for real-time assistance`;

    // Helper: timeout wrapper
    const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
        p.then(v => { clearTimeout(to); resolve(v) }).catch(err => { clearTimeout(to); reject(err) })
      })
    }

    let text: string;
    if (this.useOllama) {
      console.log("[LLMHelper] Using Ollama for real-time command extraction");
      text = await withTimeout(this.callOllama(prompt), 3000) // Ultra-fast timeout for real-time
    } else if (this.model) {
      console.log("[LLMHelper] Using Gemini for real-time command extraction");
      const result = await withTimeout(this.model.generateContent(prompt), 7500) // Extended timeout for complex responses
      const response = await (result as any).response;
      text = response.text();
      console.log("[LLMHelper] Gemini real-time response:", {
        responseLength: text.length,
        responsePreview: text.substring(0, 200) + '...'
      });
    } else {
      throw new Error("No LLM provider configured");
    }

    try {
      const parsed = this.ensureJsonOrNull(text);
      if (parsed === null) return null;
      if (!Array.isArray(parsed)) return null;
      // ENFORCE EXACTLY ONE HIGH-QUALITY COMMAND
      const MAX_ITEMS = 1 // Only allow 1 command maximum
      
      if (parsed.length === 0) {
        console.log("[LLMHelper] No commands found in response")
        return null
      }
      
      if (parsed.length > 1) {
        console.warn("[LLMHelper] Multiple commands detected, taking only the first one")
      }
      
      // Take only the first command and validate quality
      const item = parsed[0]
      const command_text = String(item?.command_text ?? '').trim().slice(0, 100) // Max 100 chars as specified
      const confidence = Number(item?.confidence ?? 0)
      const polished_response_raw = String(item?.polished_response ?? '').trim()
      
      // Quality validation - ensure high confidence and proper content
      if (!command_text || command_text.length < 5) {
        console.log("[LLMHelper] Command text too short or empty, rejecting")
        return null
      }
      
      if (confidence < 0.9) {
        console.log("[LLMHelper] Confidence too low:", confidence, "rejecting command")
        return null
      }
      
      if (!polished_response_raw || polished_response_raw.length < 20) {
        console.log("[LLMHelper] Polished response too short, rejecting")
        return null
      }
      
      // Ensure response is within optimal length (80-150 words)
      const wordCount = polished_response_raw.split(/\s+/).length
      if (wordCount < 15 || wordCount > 200) {
        console.log("[LLMHelper] Response word count out of range:", wordCount, "rejecting")
        return null
      }
      
      const polished_response = polished_response_raw.length > 900 ? polished_response_raw.slice(0, 900) + '…' : polished_response_raw
      
      const singleCommand = {
        command_text,
        timestamp: ts,
        who_said_it: String(item?.who_said_it ?? 'other_participant').trim().slice(0, 64),
        polished_response,
        confidence
      }
      
      // Add to processed cache and clean up
      this.extractedCommandHashes.add(utteranceHash)
      this.pendingExtractions.delete(utteranceHash)
      this.manageCacheSize()
      
      console.log("[LLMHelper] Real-time command extracted:", {
        command_text,
        confidence,
        responseWordCount: wordCount,
        responseLength: polished_response.length,
        processingTime: Date.now() - now
      })
      
      return [singleCommand]
    } catch (error) {
      console.warn("[LLMHelper] Error in real-time command extraction:", error);
      this.pendingExtractions.delete(utteranceHash);
      return null;
    }
  }
  
  // Real-time conversation context management
  private updateConversationContext(text: string, timestamp: number): void {
    if (!text || text.length < 3) return;
    
    // Add to rolling context with space separator
    const separator = this.conversationContext && !this.conversationContext.endsWith('.') && !this.conversationContext.endsWith('?') && !this.conversationContext.endsWith('!') ? '. ' : ' ';
    this.conversationContext = (this.conversationContext + separator + text).trim();
    
    // Keep context within manageable size for fast processing
    if (this.conversationContext.length > this.maxContextLength) {
      // Keep the most recent part of the conversation
      const words = this.conversationContext.split(' ');
      const targetWords = Math.floor(this.maxContextLength / 6); // Approximate word count
      this.conversationContext = words.slice(-targetWords).join(' ');
    }
    
    // Clean old context periodically
    this.cleanOldContext(timestamp);
    
    console.log("[LLMHelper] Updated conversation context:", {
      textAdded: text.substring(0, 50) + '...',
      contextLength: this.conversationContext.length,
      contextPreview: this.conversationContext.substring(0, 100) + '...'
    });
  }
  
  private cleanOldContext(currentTime: number): void {
    // Clean context older than maxBufferAge
    const cutoff = currentTime - this.maxBufferAge;
    
    // Simple time-based cleanup - if context is getting old, trim it
    if (this.lastCommandExtraction > 0 && (currentTime - this.lastCommandExtraction) > this.maxBufferAge) {
      // Keep only the last few sentences for context
      const sentences = this.conversationContext.split(/[.!?]\s+/);
      if (sentences.length > 3) {
        this.conversationContext = sentences.slice(-2).join('. ') + '.';
        console.log("[LLMHelper] Trimmed old conversation context");
      }
    }
  }
  
  // Fast sentence completion detection for real-time processing
  private detectSentenceCompletion(utterance: string): boolean {
    const trimmed = utterance.trim();
    
    // Check for clear sentence endings
    if (/[.!?]\s*$/.test(trimmed)) {
      return true;
    }
    
    // Check for question patterns
    if (/\?$/.test(trimmed) || /^(what|how|why|when|where|who|can|could|should|would|tell me|explain)\b/i.test(trimmed)) {
      return true;
    }
    
    // Check for imperative statements (commands/requests)
    if (/\b(please|can you|could you|would you|let me know|help me|show me|give me)\b/i.test(trimmed)) {
      return true;
    }
    
    // Check minimum length for processing (avoid processing partial words)
    if (trimmed.length < 10) {
      return false;
    }
    
    // For statements without clear endings, check if they seem complete
    // Look for complete phrases that make sense
    const words = trimmed.split(/\s+/);
    if (words.length >= 4 && !/\b(and|but|however|also|then|so|because|since|if|when|while|although)$/i.test(trimmed)) {
      return true;
    }
    
    return false;
  }
  
  // Fast heuristic filter to avoid expensive LLM calls
  private hasActionableContent(utterance: string): boolean {
    const lowered = utterance.toLowerCase();
    
    // Question patterns
    if (/\?/.test(utterance) || /^(what|how|why|when|where|who|can|could|should|would)\b/i.test(utterance)) {
      return true;
    }
    
    // Action patterns
    if (/\b(tell me|explain|describe|show me|help me|teach me|give me|can you|could you|would you|please)\b/i.test(lowered)) {
      return true;
    }
    
    // Topic introduction patterns
    if (/\b(talk about|discuss|let's|next|now|about)\b/i.test(lowered)) {
      return true;
    }
    
    // Skip casual conversation
    if (/^(hi|hello|thanks|thank you|ok|okay|yes|no|sure|alright|got it|sounds good)\s*[.!?]?$/i.test(utterance.trim())) {
      return false;
    }
    
    // If utterance is substantial and not clearly casual, allow processing
    return utterance.trim().length >= 15;
  }
  
  private hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & 0xffffffff;
    }
    return (hash >>> 0).toString(16);
  }
  
  private manageCacheSize(): void {
    if (this.extractedCommandHashes.size > this.maxHashCache) {
      // Remove oldest entries by converting to array and keeping recent ones
      const hashArray = Array.from(this.extractedCommandHashes);
      this.extractedCommandHashes = new Set(hashArray.slice(-Math.floor(this.maxHashCache * 0.8)));
      
      console.log("[LLMHelper] Managed command hash cache size:", {
        newSize: this.extractedCommandHashes.size,
        maxSize: this.maxHashCache
      });
    }
    
    // Clean up pending extractions that might be stuck
    if (this.pendingExtractions.size > 10) {
      console.log("[LLMHelper] Clearing stuck pending extractions");
      this.pendingExtractions.clear();
    }
  }

  public async chatWithGemini(message: string): Promise<string> {
    try {
      // Create the full prompt with system context and user message
      const fullPrompt = `${this.systemPrompt}\n\nUser: ${message}\n\nAssistant:`;
      
      if (this.useOllama) {
        return this.callOllama(fullPrompt);
      } else if (this.model) {
        const result = await this.model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
      } else {
        throw new Error("No LLM provider configured");
      }
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGemini:", error);
      const statusCode = (error as any)?.status || (error as any)?.response?.status;
      if (statusCode === 429) {
        throw new Error(`Gemini model ${this.geminiModel} hit rate limits. Please wait and try again.`);
      }
      throw new Error(`Gemini model ${this.geminiModel} error: ${(error as any)?.message || String(error)}`);
    }
  }

  public async chat(message: string): Promise<string> {
    return this.chatWithGemini(message);
  }

  public isUsingOllama(): boolean {
    return this.useOllama;
  }

  public async getOllamaModels(): Promise<string[]> {
    if (!this.useOllama) return [];
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch models');
      
      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error("[LLMHelper] Error fetching Ollama models:", error);
      return [];
    }
  }

  public getCurrentProvider(): "ollama" | "gemini" {
    return this.useOllama ? "ollama" : "gemini";
  }

  public getCurrentModel(): string {
    return this.useOllama ? this.ollamaModel : this.geminiModel;
  }

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    if (url) this.ollamaUrl = url;
    
    if (model) {
      this.ollamaModel = model;
    } else {
      // Auto-detect first available model
      await this.initializeOllamaModel();
    }
    
    console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`);
  }

  public async switchToGemini(apiKey?: string, model?: string): Promise<void> {
    if (model) {
      this.geminiModel = model;
    }

    if (apiKey) {
      this.geminiApiKey = apiKey;
      this.geminiClient = new GoogleGenerativeAI(apiKey);
    } else if (!this.geminiClient && this.geminiApiKey) {
      this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
    }

    if (!this.geminiClient) {
      throw new Error("No Gemini API key provided and no existing model instance");
    }

    this.model = this.geminiClient.getGenerativeModel({ model: this.geminiModel });
    this.useOllama = false;
    console.log(`[LLMHelper] Switched to Gemini model: ${this.geminiModel}`);
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        // Test with a simple prompt
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (!this.model) {
          return { success: false, error: "No Gemini model configured" };
        }
        // Test with a simple prompt
        const result = await this.model.generateContent("Hello");
        const response = await result.response;
        const text = response.text(); // Ensure the response is valid
        if (text) {
          return { success: true };
        } else {
          return { success: false, error: "Empty response from Gemini" };
        }
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
} 
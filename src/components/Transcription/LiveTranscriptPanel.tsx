import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { encodeWavBase64 } from "../../lib/wav";

interface WordTs { word: string; start: number; end: number }
interface TranscriptResult { id: string; text: string; words?: WordTs[] }

interface ActionCommand {
  command_text: string
  timestamp: string
  who_said_it: string
  suggested_response: string
  polished_response?: string
}

// Simple deterministic string hash (djb2)
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & 0xffffffff
  }
  // Return as unsigned hex string for compactness
  return (hash >>> 0).toString(16)
}

// Normalize utterance to stabilize hashing and heuristics
function normalizeUtterance(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim()
}

// Extract the most recent, likely-complete sentence for faster, accurate extraction
function getExtractionCandidate(utterance: string): string {
  // Split by common sentence boundaries
  const parts = utterance.split(/([.!?])\s+/)
  if (parts.length <= 1) return utterance
  // Reconstruct into sentences: token + delimiter
  const sentences: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i]
    const delim = parts[i + 1] || ''
    if (token && token.trim()) sentences.push((token + delim).trim())
  }
  // Prefer the last complete sentence; if last has no delimiter, try previous
  const last = sentences[sentences.length - 1] || ''
  if (/[.!?]$/.test(last)) return last
  return sentences[sentences.length - 2] || last || utterance
}

// Extract last N sentences to capture bursts (e.g., multiple questions back-to-back)
function getLastSentences(utterance: string, n: number = 2): string {
  const parts = utterance.split(/([.!?])\s+/)
  if (parts.length <= 1) return utterance
  const sentences: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const token = parts[i]
    const delim = parts[i + 1] || ''
    if (token && token.trim()) sentences.push((token + delim).trim())
  }
  const start = Math.max(0, sentences.length - n)
  return sentences.slice(start).join(' ').trim()
}

function mergeIncremental(prev: string, next: string): string {
  const p = (prev || '').trim()
  const n = (next || '').trim()
  if (!p) return n
  if (!n) return p
  const pw = p.split(/\s+/)
  const nw = n.split(/\s+/)
  const lp = p.toLowerCase()
  const ln = n.toLowerCase()
  if (ln.startsWith(lp) || ln.includes(lp)) return n
  if (lp.startsWith(ln) || lp.includes(ln)) return p
  const maxOverlap = Math.min(20, pw.length, nw.length)
  for (let i = maxOverlap; i > 0; i--) {
    const ps = pw.slice(-i).join(' ').toLowerCase()
    const ns = nw.slice(0, i).join(' ').toLowerCase()
    if (ps === ns) {
      return p + ' ' + nw.slice(i).join(' ')
    }
  }
  return p + ' ' + n
}

const LiveTranscriptPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'transcript'|'commands'>('transcript')
  const [captureSource, setCaptureSource] = useState<'speaker'|'microphone'|'system'>('system')
  const [statusMsg, setStatusMsg] = useState<string>("")
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>("")
  
  // Transcription engine selection
  const [transcriptionEngine, setTranscriptionEngine] = useState<'whisper'|'deepgram'>('deepgram')
  
  // Deepgram configuration
  const [deepgramModel, setDeepgramModel] = useState<string>("nova-2")

  // Map Deepgram models to branded MindWhisper labels
  const brandModelLabel = (model: string): string => {
    switch ((model || '').toLowerCase()) {
      case 'nova-2': return 'Alpha'
      case 'nova': return 'Beta'
      case 'enhanced': return 'Gamma'
      case 'base': return 'Gamma'
      default: return model
    }
  }

  // Transform backend status strings to branded wording
  const brandStatus = (msg: string): string => {
    if (!msg) return ''
    let m = msg.replace(/deepgram/ig, 'MindWhisper')
    m = m
      .replace(/nova-2/ig, 'Alpha')
      .replace(/\bnova\b/ig, 'Beta')
      .replace(/enhanced/ig, 'Gamma')
      .replace(/\bbase\b/ig, 'Gamma')
    return m
  }

  // Transcript state
  const [transcript, setTranscript] = useState<string>("")
  const [history, setHistory] = useState<Array<{ text: string; start: number; end: number }>>([])
  const [commands, setCommands] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1)
  const [transcriptTrigger, setTranscriptTrigger] = useState(0) // Trigger for command extraction

  // Streaming capture
  const mediaStreamRef = useRef<MediaStream|null>(null)
  const audioCtxRef = useRef<AudioContext|null>(null)
  const processorRef = useRef<ScriptProcessorNode|null>(null)
  const channelBuffersRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef<number>(48000)
  const framesCollectedRef = useRef<number>(0)
  const totalFramesSentRef = useRef<number>(0)
  const lastSpeechTimeRef = useRef<number>(Date.now())
  const currentSegmentStartRef = useRef<number>(0)
  const pendingUtteranceRef = useRef<string>("")
  const loopbackUnsubRef = useRef<(() => void) | null>(null)
  const deepgramUnsubRef = useRef<(() => void) | null>(null)
  const commandExtractedUnsubRef = useRef<(() => void) | null>(null)

  // Deduplication stores
  const utteranceHashesRef = useRef<Set<string>>(new Set())
  const commandHashesRef = useRef<Set<string>>(new Set())

  // Intelligent silence-based extraction control
  const isExtractingRef = useRef<boolean>(false)
  const lastExtractTsRef = useRef<number>(0)
  const pendingRerunRef = useRef<boolean>(false)
  const silenceDetectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastTranscriptTimeRef = useRef<number>(0)
  // Cooldown to avoid rapid duplicate extractions
  const lastAcceptedAtRef = useRef<number>(0)
  // Guard to prevent reprocessing the same extraction text
  const lastExtractionHashRef = useRef<string>("")
  // Separate silence detection interval
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Auto-setup event listeners when component mounts (in case Deepgram auto-starts)
  useEffect(() => {
    console.log('[DEBUG] 🔧 Component mounted, setting up event listeners...')
    
    // Set up event listeners regardless of how Deepgram starts
    const setupEventListeners = () => {
      if (deepgramUnsubRef.current) {
        deepgramUnsubRef.current() // Clean up existing listeners
      }
      
      deepgramUnsubRef.current = window.electronAPI.onDeepgramTranscript((data) => {
        console.log('[Deepgram Frontend] ✅ RECEIVED transcript data:', data)
        const text = (data?.text || '').trim()
        if (text) {
          console.log('[Deepgram Frontend] ✅ Processing transcript:', text)
          setTranscript(prev => mergeIncremental(prev, text))
          
          // ACCUMULATE ALL TRANSCRIPTS - ignore Deepgram's "final" vs "interim" 
          pendingUtteranceRef.current = mergeIncremental(pendingUtteranceRef.current, text)
          console.log('[Deepgram Frontend] ✅ ACCUMULATED:', pendingUtteranceRef.current.substring(0, 150) + '...')
          
          lastSpeechTimeRef.current = Date.now()
          lastTranscriptTimeRef.current = Date.now()
          
          console.log('[Deepgram Frontend] ✅ Updated transcript, waiting for silence...')
          tryExtractCommands('deepgram_silence_detection')
        }
      })

      // Set up command extraction event listener - receives commands from backend
      if (commandExtractedUnsubRef.current) {
        commandExtractedUnsubRef.current() // Clean up existing listener
      }
      
      commandExtractedUnsubRef.current = window.electronAPI.onCommandExtracted((data) => {
        console.log('[Command Extraction] ✅ RECEIVED command from backend:', data)
        
        if (data?.command) {
          const command = data.command
          const originalTranscript = data.originalTranscript || ''
          const timestamp = data.timestamp || Date.now()
          
          console.log('[Command Extraction] ✅ Processing backend command:', {
            command_text: command.command_text,
            confidence: command.confidence,
            originalTranscript: originalTranscript.substring(0, 100) + '...',
            timestamp
          })
          
          // Add command to the frontend commands list
          setCommands(prev => {
            // Check for duplicates based on command text
            const isDuplicate = prev.some(existingCmd => 
              existingCmd.command_text?.toLowerCase().trim() === command.command_text?.toLowerCase().trim()
            )
            
            if (!isDuplicate) {
              console.log('[Command Extraction] ✅ Adding new command to frontend list')
              return [command, ...prev]
            } else {
              console.log('[Command Extraction] ⚠️ Duplicate command detected, skipping')
              return prev
            }
          })
          
          // Clear accumulated transcript since it's been processed
          pendingUtteranceRef.current = ""
          console.log('[Command Extraction] ✅ Cleared accumulated transcript')
        } else {
          console.log('[Command Extraction] ⚠️ Received invalid command data:', data)
        }
      })
      
      console.log('[DEBUG] ✅ Event listeners set up successfully')
    }
    
    setupEventListeners()
    startSilenceDetection()
    
    return () => {
      if (deepgramUnsubRef.current) {
        deepgramUnsubRef.current()  
      }
      if (commandExtractedUnsubRef.current) {
        commandExtractedUnsubRef.current()
      }
      if (silenceCheckIntervalRef.current) {
        clearInterval(silenceCheckIntervalRef.current)
      }
    }
  }, []) // Run once on mount

  const capSet = (set: Set<string>, max = 200) => {
    if (set.size > max) {
      // Simple strategy: clear to avoid unbounded growth
      set.clear()
    }
  }

  // Separate silence detection that only triggers when NO transcripts arrive for 1 second
  const startSilenceDetection = () => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current)
    }
    
    console.log('[Silence Detection] 🔄 Starting silence detection interval')
    
    silenceCheckIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const timeSinceLastTranscript = now - (lastTranscriptTimeRef.current || 0)
      
      console.log('[Silence Detection] 🔍 Checking silence:', {
        hasPendingText: !!pendingUtteranceRef.current,
        pendingTextLength: pendingUtteranceRef.current?.length || 0,
        timeSinceLastTranscript,
        lastTranscriptTime: lastTranscriptTimeRef.current,
        currentTime: now
      })
      
      // DISABLED: Frontend command extraction - now handled by advanced backend system
      if (pendingUtteranceRef.current && timeSinceLastTranscript > 1200) {
        console.log('[Silence Detection] 🔕 TRUE SILENCE DETECTED - but using backend processing instead')
        // tryExtractCommands('true_silence_detection') // DISABLED - backend handles this now
      }
    }, 200) // Check every 200ms for silence
  }

  // Pre-compiled regex patterns for better performance
  const COMMAND_PATTERNS = useMemo(() => ({
    question: /\?$|^(what|how|why|when|where|who|can|could|should|would)\b/i,
    action: /\b(send|email|summarize|schedule|remind|note|explain|clarify|list|create|generate|compare|draft|answer|translate|share|open|search|lookup|calculate|follow up|follow-up)\b/i,
    polite: /\b(please|can you|could you)\b/i
  }), [])

  // Enhanced deduplication using exact text + length + timestamp
  const isDuplicateUtterance = useCallback((text: string, timestamp: number) => {
    const exactKey = text.trim().toLowerCase() // Exact text match
    const lengthKey = `${text.length}-${Math.floor(timestamp / 10000)}` // 10-second windows
    
    if (utteranceHashesRef.current.has(exactKey) || utteranceHashesRef.current.has(lengthKey)) {
      console.log('[Duplicate Detection] Found duplicate utterance:', text.substring(0, 50) + '...')
      return true
    }
    
    utteranceHashesRef.current.add(exactKey)
    utteranceHashesRef.current.add(lengthKey)
    capSet(utteranceHashesRef.current, 100) // Larger cache for better detection
    return false
  }, [])

  // Pure silence-based command extraction - triggered automatically by transcript events
  const tryExtractCommands = useCallback(async (reason: string) => {
    console.log('[Command Extraction] 🚀 FUNCTION CALLED! Reason:', reason)
    const now = Date.now()
    // For Deepgram, backend handles silence detection and Gemini extraction.
    if (transcriptionEngine === 'deepgram') {
      return
    }
    
    // Clear any existing timeout (resets every time new transcript arrives)
    if (silenceDetectionTimeoutRef.current) {
      clearTimeout(silenceDetectionTimeoutRef.current)
      console.log('[Command Extraction] ⏰ Cleared existing timeout')
    }
    
    // Frontend silence detection - wait for natural pause in speech
    const silenceThreshold = 1200
    
    console.log('[Command Extraction] 🎯 Setting up silence detection timer:', {
      reason,
      engine: transcriptionEngine,
      silenceThreshold,
      currentAccumulated: pendingUtteranceRef.current.substring(0, 100) + '...',
      accumulatedLength: pendingUtteranceRef.current.length
    })
    
    silenceDetectionTimeoutRef.current = setTimeout(async () => {
      try {
        // Check if we've had enough silence since last transcript
        const timeSinceLastTranscript = Date.now() - lastTranscriptTimeRef.current
        if (timeSinceLastTranscript < silenceThreshold) {
          console.log('[Command Extraction] Not enough silence yet, waiting...', timeSinceLastTranscript, 'ms ago')
          return
        }
        
        // No extraction cooldown needed - silence detection is our primary control mechanism
        
        const accumulatedTranscript = pendingUtteranceRef.current.trim()
        if (!accumulatedTranscript || accumulatedTranscript.length < 10) {
          console.log('[Command Extraction] Insufficient accumulated transcript for processing')
          return
        }
        
        const processedUtterance = normalizeUtterance(accumulatedTranscript)
        // Send the entire accumulated utterance from last silence to this silence
        const extractionText = processedUtterance
        
        // Fast actionable content detection
        const lowered = extractionText.toLowerCase()
        const hasQuestionMark = /\?/.test(extractionText)
        const hasActionablePattern = COMMAND_PATTERNS.question.test(extractionText) || 
                                   COMMAND_PATTERNS.action.test(lowered) || 
                                   COMMAND_PATTERNS.polite.test(lowered) ||
                                   /\b(tell me|talk about|discuss|explain|describe|next|can you|could you|would you|please)\b/i.test(lowered)
        
        if (!hasQuestionMark && !hasActionablePattern) {
          console.log('[Command Extraction] No actionable content detected in accumulated transcript')
          return
        }
        
        // Mark extraction time for logging purposes
        lastExtractTsRef.current = now
        
        console.log('[Command Extraction] Processing silence-triggered extraction:', {
          reason,
          engine: transcriptionEngine,
          accumulatedLength: processedUtterance.length,
          accumulatedPreview: processedUtterance.substring(0, 200) + '...',
          extractionLength: extractionText.length,
          extractionPreview: extractionText.substring(0, 200) + '...',
          silenceDuration: timeSinceLastTranscript,
          processingStart: now
        })
        
        // Hash guard: skip if same text was just processed
        const extractionHash = hashString(extractionText)
        if (lastExtractionHashRef.current === extractionHash) {
          console.log('[Command Extraction] Skipping duplicate extraction for same text hash')
          return
        }
        lastExtractionHashRef.current = extractionHash
        
        // Send only the recent sentences for processing
        const extracted = await window.electronAPI.extractCommands(extractionText, new Date().toISOString())
        
        if (Array.isArray(extracted) && extracted.length > 0) {
          const singleCommand = extracted[0]
          const cmdText = (singleCommand.command_text || '').toLowerCase().trim()
          const confidence = Number(singleCommand.confidence || 0)
          const response = (singleCommand.polished_response || '').trim()
          const processingTime = Date.now() - now
          
          // Minimal frontend validation for silence-triggered processing
          if (cmdText && confidence >= 0.9 && response) {
            // Cooldown: avoid accepting multiple commands within 2.5s
            const nowAccepted = Date.now()
            const sinceLastAccepted = nowAccepted - (lastAcceptedAtRef.current || 0)
            if (sinceLastAccepted < 2500) {
              console.log('[Command Extraction] Cooldown active, skipping acceptance. ms since last:', sinceLastAccepted)
              return
            }
            // Check for frontend duplicates as final safety
            if (!commandHashesRef.current.has(cmdText)) {
              commandHashesRef.current.add(cmdText)
              
              console.log('[Command Extraction] Silence-triggered command accepted:', {
                command_text: cmdText,
                confidence,
                responseLength: response.length,
                processingTime: processingTime + 'ms',
                totalTimeFromSilence: (processingTime + silenceThreshold) + 'ms',
                accumulatedTranscriptLength: processedUtterance.length
              })
              
              setCommands(prev => [singleCommand, ...prev])
              lastAcceptedAtRef.current = nowAccepted
              
              // Clear the processed accumulated transcript to avoid duplicate re-processing
              pendingUtteranceRef.current = ""
              
            } else {
              console.log('[Command Extraction] Frontend duplicate check blocked command')
            }
          } else {
            console.log('[Command Extraction] Silence-triggered quality validation failed')
          }
        } else {
          console.log('[Command Extraction] No actionable commands found in accumulated transcript')
        }
        
        capSet(commandHashesRef.current, 100)
        pendingUtteranceRef.current = ""
        
      } catch (err) {
        console.error('[Command Extraction] Silence-triggered processing error:', err)
      }
    }, silenceThreshold)
  }, [transcriptionEngine, COMMAND_PATTERNS])

  // Helpers
  const resetBuffers = () => {
    channelBuffersRef.current = []
    framesCollectedRef.current = 0
  }

  // Enumerate audio input devices (for microphone and Stereo Mix selection)
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const inputs = devices.filter(d => d.kind === 'audioinput')
      setAudioInputs(inputs)
    }).catch(() => {})
  }, [])

  // Cleanup effect for silence detection timeout
  useEffect(() => {
    return () => {
      if (silenceDetectionTimeoutRef.current) {
        clearTimeout(silenceDetectionTimeoutRef.current)
        console.log('[Command Extraction] Cleanup: Cleared silence detection timeout')
      }
    }
  }, [])

  const handlePolish = async (idx: number) => {
    const cmd = commands[idx]
    if (!cmd) return
    try {
      const result = await window.electronAPI.polishCommandResponse(cmd.command_text, {
        transcriptWindow: transcript,
        timestamp: cmd.timestamp,
        who: cmd.who_said_it
      })
      setCommands(prev => prev.map((c, i) => i === idx ? { ...c, polished_response: result.text } : c))
    } catch (error) {
      console.error('Error polishing response:', error)
    }
  }

  const stopCapture = async () => {
    try {
      setStatusMsg('Stopping transcription...')
      
      // Clear any pending silence detection timeout
      if (silenceDetectionTimeoutRef.current) {
        clearTimeout(silenceDetectionTimeoutRef.current)
        silenceDetectionTimeoutRef.current = null
        console.log('[Command Extraction] Cleared pending silence detection timeout')
      }
      
      if (captureSource === 'system') {
        // Add timeout wrapper for stop operations in compiled exe
        const stopWithTimeout = async (stopFn: () => Promise<any>) => {
          return Promise.race([
            stopFn(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Stop timeout - process may still be running')), 10000)
            )
          ])
        }
        
        if (transcriptionEngine === 'deepgram') {
          try {
            await stopWithTimeout(() => window.electronAPI.stopDeepgramTranscript())
          } catch (error) {
            console.warn('Deepgram stop timeout:', error)
          }
          if (deepgramUnsubRef.current) {
            deepgramUnsubRef.current()
            deepgramUnsubRef.current = null
          }
        } else {
          try {
            await stopWithTimeout(() => window.electronAPI.stopLoopbackTranscript())
          } catch (error) {
            console.warn('Loopback stop timeout:', error)
          }
          if (loopbackUnsubRef.current) {
            loopbackUnsubRef.current()
            loopbackUnsubRef.current = null
          }
        }
      } else {
        await window.electronAPI.stopLiveTranscript()
        if (processorRef.current) {
          processorRef.current.disconnect()
          processorRef.current = null
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close()
          audioCtxRef.current = null
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop())
          mediaStreamRef.current = null
        }
        resetBuffers()
        currentSegmentStartRef.current = 0
        lastSpeechTimeRef.current = Date.now()
        return
      }
    } catch (error) {
      console.error('Error stopping capture:', error)
      setStatusMsg(`Error stopping: ${error}`)
    }
    setIsRunning(false)
  }

  const startCapture = async () => {
    console.log('[DEBUG] 🚀 startCapture called with state:', {
      captureSource,
      transcriptionEngine,
      deepgramModel,
      isRunning
    })
    try {
      setStatusMsg("")
      let stream: MediaStream | null = null
      if (captureSource === 'system') {
        console.log('[DEBUG] ✅ Capture source is system')
        if (transcriptionEngine === 'deepgram') {
          console.log('[DEBUG] ✅ Transcription engine is deepgram')
          // Deepgram transcription with timeout for compiled exe
          console.log('Starting Deepgram with:', { model: deepgramModel })
          setStatusMsg('Starting MindWhisper transcription...')
          
          // Add timeout wrapper for compiled exe environments
          const startWithTimeout = async () => {
            return Promise.race([
              window.electronAPI.startDeepgramTranscript({ model: deepgramModel }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Transcription start timeout - try restarting the app')), 15000)
              )
            ])
          }
          
          const res = await startWithTimeout() as any
          if (!res?.success) throw new Error(res?.error || 'Failed to start Deepgram transcription')
          
          console.log('[Deepgram Frontend] 🔧 Setting up transcript event listener...')
          console.log('[Deepgram Frontend] 📊 Component state:', {
            isRunning,
            transcriptionEngine,
            captureSource,
            pendingUtteranceRef: pendingUtteranceRef.current
          })
          deepgramUnsubRef.current = window.electronAPI.onDeepgramTranscript((data) => {
            console.log('[Deepgram Frontend] ✅ RECEIVED transcript data:', data)
            const text = (data?.text || '').trim()
            if (text) {
              console.log('[Deepgram Frontend] ✅ Processing final transcript:', text)
              setTranscript(prev => mergeIncremental(prev, text))
              
              // ACCUMULATE ALL TRANSCRIPTS - ignore Deepgram's "final" vs "interim" 
              // Just keep building the complete sentence until TRUE silence
              pendingUtteranceRef.current = mergeIncremental(pendingUtteranceRef.current, text)
              console.log('[Deepgram Frontend] ✅ ACCUMULATED ALL transcripts:', pendingUtteranceRef.current.substring(0, 150) + '...')
              
              lastSpeechTimeRef.current = Date.now()
              lastTranscriptTimeRef.current = Date.now() // Track when last transcript arrived
              
              // DON'T trigger extraction here - let the separate silence detection handle it
              console.log('[Deepgram Frontend] ✅ Updated transcript, waiting for true silence...')
              
              console.log('[Deepgram Frontend] ✅ Intelligent accumulation with silence detection:', {
                currentText: text,
                textLength: text.length,
                totalAccumulated: pendingUtteranceRef.current.length,
                lastTranscriptTime: lastTranscriptTimeRef.current,
                currentTime: Date.now()
              })
              tryExtractCommands('deepgram_silence_detection')
            } else {
              console.log('[Deepgram Frontend] Empty or invalid text received:', data)
            }
          })
          
          // Handle status messages
          const statusUnsub = window.electronAPI.onDeepgramStatus((message: string) => {
            console.log('Frontend received Deepgram status:', message)
            setStatusMsg(brandStatus(message))
          })
          
          // Handle ready notifications
          const readyUnsub = window.electronAPI.onDeepgramReady((data: any) => {
            console.log('Frontend received Deepgram ready:', data)
            setStatusMsg(`✅ MindWhisper ${brandModelLabel(data.model)} ready`)
          })
          
          // Handle errors
          const errorUnsub = window.electronAPI.onDeepgramError((error: string) => {
            console.log('Frontend received Deepgram error:', error)
            setStatusMsg(`❌ MindWhisper Error: ${error}`)
            setIsRunning(false)
          })
          
          // Update cleanup to include new listeners
          const originalUnsub = deepgramUnsubRef.current
          deepgramUnsubRef.current = () => {
            originalUnsub?.()
            statusUnsub?.()
            readyUnsub?.()
            errorUnsub?.()
          }
          setIsRunning(true)
          setStatusMsg(`Starting MindWhisper ${brandModelLabel(deepgramModel)} transcription...`)
          
          // Start separate silence detection for Deepgram
          startSilenceDetection()
          return
        } else {
          // Whisper transcription with timeout for compiled exe
          console.log('Starting loopback with:', { model: 'medium', engine: 'openai' })
          setStatusMsg('Starting Whisper transcription...')
          
          // Add timeout wrapper for compiled exe environments
          const startWithTimeout = async () => {
            return Promise.race([
              window.electronAPI.startLoopbackTranscript({ model: 'medium', engine: 'openai' }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Transcription start timeout - try restarting the app')), 15000)
              )
            ])
          }
          
          const res = await startWithTimeout() as any
          if (!res?.success) throw new Error(res?.error || 'Failed to start loopback transcription')
          loopbackUnsubRef.current = window.electronAPI.onLoopbackTranscript((data) => {
            const text = (data?.text || '').trim()
            if (text) {
              setTranscript(prev => mergeIncremental(prev, text))
              pendingUtteranceRef.current = mergeIncremental(pendingUtteranceRef.current, text)
              lastSpeechTimeRef.current = Date.now()
              lastTranscriptTimeRef.current = Date.now() // Track when last transcript arrived
              
              // Trigger silence-based detection for Whisper transcripts
              tryExtractCommands('whisper_silence_detection')
            }
          })
          
          // Handle status messages - CRITICAL: Remove optional chaining
          const statusUnsub = window.electronAPI.onLoopbackStatus((message: string) => {
            console.log('Frontend received status:', message)
            setStatusMsg(message)
          })
          
          // Handle fallback notifications
          const fallbackUnsub = window.electronAPI.onLoopbackFallback((data: any) => {
            console.log('Frontend received fallback:', data)
            setStatusMsg(`⚠️ ${data.message} - Using ${data.fallbackModel} instead`)
          })
          
          // Handle errors
          const errorUnsub = window.electronAPI.onLoopbackError((error: string) => {
            console.log('Frontend received error:', error)
            setStatusMsg(`❌ Error: ${error}`)
            setIsRunning(false)
          })
          
          // Update cleanup to include new listeners
          const originalUnsub = loopbackUnsubRef.current
          loopbackUnsubRef.current = () => {
            originalUnsub?.()
            statusUnsub?.()
            fallbackUnsub?.()
            errorUnsub?.()
          }
          setIsRunning(true)
          setStatusMsg(`Started native system audio capture with Whisper medium`)
          
          // Start separate silence detection for Deepgram
          startSilenceDetection()
          return
        }
      } else if (captureSource === 'speaker') {
        // If the user selected a loopback-like device, prefer using it directly
        const selectedDevice = audioInputs.find(d => d.deviceId === selectedMicId)
        const looksLikeLoopback = selectedDevice && /stereo mix|loopback|what u hear|vb\-audio|cable output|wave out/i.test(selectedDevice.label || '')
        
        if (looksLikeLoopback) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: selectedMicId ? { exact: selectedMicId } : undefined }
          })
        } else {
          // Fallback: try to get display media with audio
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({ 
              video: false, 
              audio: true 
            })
          } catch (displayError) {
            // If display media fails, try getUserMedia with default device
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: selectedMicId ? { exact: selectedMicId } : undefined }
            })
          }
        }
      } else {
        // Microphone
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedMicId ? { exact: selectedMicId } : undefined }
        })
      }

      if (!stream) throw new Error('Failed to get media stream')
      
      mediaStreamRef.current = stream
      const audioCtx = new AudioContext({ sampleRate: 48000 })
      audioCtxRef.current = audioCtx
      sampleRateRef.current = audioCtx.sampleRate

      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer
        const inputData = inputBuffer.getChannelData(0)
        
        // Collect frames
        if (!channelBuffersRef.current.length) {
          channelBuffersRef.current = [new Float32Array(inputData)]
        } else {
          const newBuffer = new Float32Array(channelBuffersRef.current[0].length + inputData.length)
          newBuffer.set(channelBuffersRef.current[0])
          newBuffer.set(inputData, channelBuffersRef.current[0].length)
          channelBuffersRef.current = [newBuffer]
        }
        
        framesCollectedRef.current += inputData.length

        // Send chunks every ~1 second
        const targetFrames = Math.floor(sampleRateRef.current * 1.0)
        if (framesCollectedRef.current >= targetFrames) {
          const audioData = channelBuffersRef.current[0].slice(0, targetFrames)
          const base64Wav = encodeWavBase64([audioData], sampleRateRef.current)
          const chunkId = `chunk_${totalFramesSentRef.current}`
          
          window.electronAPI.sendTranscriptChunk(chunkId, base64Wav).then(result => {
            const text = (result?.text || '').trim()
            if (text) {
              setTranscript(prev => (prev ? prev + ' ' : '') + text)
              pendingUtteranceRef.current = (pendingUtteranceRef.current ? pendingUtteranceRef.current + ' ' : '') + text
              lastSpeechTimeRef.current = Date.now()
              setTranscriptTrigger(prev => prev + 1) // Trigger command extraction
            }
          }).catch(console.error)

          // Shift buffer
          const remaining = channelBuffersRef.current[0].slice(targetFrames)
          channelBuffersRef.current = [remaining]
          framesCollectedRef.current = remaining.length
          totalFramesSentRef.current++
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)

      // Start live transcript backend
      const res = await window.electronAPI.startLiveTranscript()
      if (!res?.success) throw new Error(res?.error || 'Failed to start live transcript')

      setIsRunning(true)
      setStatusMsg(`Capturing from ${captureSource}...`)
    } catch (error) {
      console.error('Error starting capture:', error)
      setStatusMsg(`Error: ${error}`)
      setIsRunning(false)
    }
  }


  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!searchQuery) return commands
    return commands.filter(cmd => 
      cmd.command_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cmd.polished_response && cmd.polished_response.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [commands, searchQuery])

  // Keyboard shortcuts handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'k':
          e.preventDefault()
          document.getElementById('command-search')?.focus()
          break
        case 'c':
          if (activeTab === 'transcript' && transcript) {
            e.preventDefault()
            navigator.clipboard.writeText(transcript)
          } else if (activeTab === 'commands' && filteredCommands.length > 0) {
            e.preventDefault()
            const allText = filteredCommands.map(cmd => 
              `${cmd.command_text}${cmd.polished_response ? '\n' + cmd.polished_response : ''}`
            ).join('\n\n')
            navigator.clipboard.writeText(allText)
          }
          break
        case 'Enter':
          if (selectedCommandIndex >= 0 && selectedCommandIndex < filteredCommands.length) {
            e.preventDefault()
            handlePolish(commands.indexOf(filteredCommands[selectedCommandIndex]))
          }
          break
      }
    } else {
      switch (e.key) {
        case 'ArrowDown':
          if (activeTab === 'commands' && filteredCommands.length > 0) {
            e.preventDefault()
            setSelectedCommandIndex(prev => 
              prev < filteredCommands.length - 1 ? prev + 1 : 0
            )
          }
          break
        case 'ArrowUp':
          if (activeTab === 'commands' && filteredCommands.length > 0) {
            e.preventDefault()
            setSelectedCommandIndex(prev => 
              prev > 0 ? prev - 1 : filteredCommands.length - 1
            )
          }
          break
        case 'Escape':
          setSearchQuery('')
          setSelectedCommandIndex(-1)
          break
      }
    }
  }, [activeTab, transcript, filteredCommands, selectedCommandIndex, commands])

  // Add keyboard event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Reset selection when switching tabs or filtering
  useEffect(() => {
    setSelectedCommandIndex(-1)
  }, [activeTab, searchQuery])

  // Auto-scroll transcript
  const transcriptDisplayText = useMemo(() => {
    if (!transcript) return isRunning ? 'Listening…' : 'Press Start to begin live transcription.'
    return transcript
  }, [transcript, isRunning])

  return (
    <div className="w-full relative overflow-hidden rounded-[28px] border-2 border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)]" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
      {/* 2025 Ultra-Premium Container */}
      <div className="relative z-10 overflow-hidden">
        
        {/* 2025 Ultra-Premium Header */}
        <div className="relative px-6 py-4 border-b-2 border-white/15">
          <div className="flex flex-col gap-4">
            {/* Top Row: Title + Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                {/* Premium Icon */}
                <div className="relative group">
                  <div className="absolute inset-0 bg-white/20 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="relative w-16 h-16 rounded-[20px] bg-white flex items-center justify-center shadow-2xl transform transition-all duration-500 hover:scale-110 hover:rotate-6">
                    <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                </div>
                
                {/* Title + Badge */}
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-black text-white tracking-tight">
                      Live Transcription
                    </h1>
                    <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/15 border-2 border-white/25 shadow-lg">
                      <div className="relative">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          isRunning ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-white/40'
                        }`}></div>
                        {isRunning && (
                          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-white animate-ping"></div>
                        )}
                      </div>
                      <span className="text-xs font-black text-white uppercase tracking-widest">{isRunning ? 'Live' : 'Ready'}</span>
                    </div>
                  </div>
                  <p className="text-base text-white/70 font-semibold">Real-time AI-powered transcription</p>
                </div>
              </div>
              
              {/* Premium Status */}
              {statusMsg && (
                <div className="px-4 py-2 bg-white/10 border-2 border-white/20 rounded-xl shadow-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                    <span className="text-xs font-bold text-white">{statusMsg}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* 2025 Premium Controls */}
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {/* Source Badge */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-white/60 uppercase tracking-[0.15em]">Source</label>
                  <div className="px-3 py-2 bg-white/10 border-2 border-white/20 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                      <span className="text-xs font-bold text-white">System Audio</span>
                    </div>
                  </div>
                </div>
                
                {/* Model Selector */}
                {captureSource === 'system' && transcriptionEngine === 'deepgram' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-white/60 uppercase tracking-[0.15em]">Model</label>
                    <Select value={deepgramModel} onValueChange={setDeepgramModel}>
                      <SelectTrigger className="h-10 w-32 text-xs bg-white/10 border-2 border-white/20 text-white hover:bg-white/15 hover:border-white/30 transition-all duration-300 rounded-xl font-bold shadow-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-2 border-white/20 rounded-2xl shadow-2xl" style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
                        <SelectItem value="nova-2" className="text-white hover:bg-white/15 rounded-xl font-semibold my-1">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                            <span>Alpha</span>
                            <span className="text-xs text-white/60 font-bold">Latest</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="nova" className="text-white hover:bg-white/15 rounded-xl font-semibold my-1">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-white/80"></div>
                            <span>Beta</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="enhanced" className="text-white hover:bg-white/15 rounded-xl font-semibold my-1">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-white/60"></div>
                            <span>Gamma</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* 2025 Ultra-Premium Action Button */}
              <div>
                {!isRunning ? (
                  <button
                    onClick={startCapture}
                    className="relative h-11 px-8 border-2 border-white/40 text-white hover:border-white/60 transition-all duration-300 hover:scale-[1.08] active:scale-95 shadow-xl rounded-xl font-black text-sm group"
                    style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                      <span className="tracking-wide">Start Live Mode</span>
                      <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  </button>
                ) : (
                  <button 
                    onClick={stopCapture}
                    className="relative h-11 px-8 border-2 border-white/40 text-white hover:border-white/60 transition-all duration-300 hover:scale-[1.08] active:scale-95 shadow-xl rounded-xl font-black text-sm group"
                    style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                      <span className="tracking-wide">Stop Recording</span>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* 2025 Ultra-Premium Tabs */}
            <div className="flex gap-2 p-1.5 rounded-xl bg-white/8 border-2 border-white/15 shadow-inner">
              <button 
                onClick={() => setActiveTab('transcript')}
                className={`relative h-10 px-6 text-xs font-black transition-all duration-300 rounded-lg group overflow-hidden ${
                  activeTab === 'transcript' 
                    ? 'bg-white text-black shadow-2xl scale-105 border-2 border-white' 
                    : 'text-white/80 hover:text-white hover:bg-white/15 hover:scale-105 border-2 border-white/20'
                }`}
              >
                {activeTab === 'transcript' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-shimmer"></div>
                )}
                <div className="relative flex items-center gap-2">
                  <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="tracking-wide">Transcript</span>
                </div>
              </button>
              <button 
                onClick={() => setActiveTab('commands')}
                className={`relative h-10 px-6 text-xs font-black transition-all duration-300 rounded-lg group overflow-hidden ${
                  activeTab === 'commands' 
                    ? 'bg-white text-black shadow-2xl scale-105 border-2 border-white' 
                    : 'text-white/80 hover:text-white hover:bg-white/15 hover:scale-105 border-2 border-white/20'
                }`}
              >
                {activeTab === 'commands' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-shimmer"></div>
                )}
                <div className="relative flex items-center gap-2">
                  <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="tracking-wide">Commands</span>
                </div>
              </button>
            </div>
          </div>
        </div>
        
        {/* 2025 Ultra-Premium Content */}
        <div className="px-6 py-5">
          {activeTab === 'transcript' ? (
            <div className="space-y-4">
              {/* Premium Stats Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-white">{transcript ? `${transcript.split(' ').length}` : '0'}</span>
                    <span className="text-xs font-black text-white/60 uppercase tracking-[0.15em]">Words</span>
                  </div>
                  <div className="w-px h-6 bg-white/20"></div>
                  <div className="text-xs font-bold text-white/80">
                    {isRunning ? 'Live transcription active' : 'Ready to transcribe'}
                  </div>
                </div>
                {transcript && (
                  <Button 
                    onClick={() => navigator.clipboard.writeText(transcript)}
                    className="h-9 px-5 bg-white text-black hover:bg-white transition-all duration-300 hover:scale-110 active:scale-95 rounded-xl font-black group shadow-2xl overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                    <div className="relative flex items-center gap-2">
                      <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs">Copy</span>
                    </div>
                  </Button>
                )}
              </div>
              
              {/* 2025 Ultra-Premium Transcript Display */}
              <div className="relative min-h-[240px] max-h-[320px] overflow-y-auto rounded-xl p-5 border-2 border-white/20 bg-white/8 shadow-inner">
                {transcript ? (
                  <div className="space-y-1">
                    {transcript.split(/([.!?]+)/).map((part, idx) => {
                      if (/[.!?]+/.test(part)) {
                        return <span key={idx} className="text-white font-black text-base">{part}</span>
                      }
                      return <span key={idx} className="text-white/95 font-semibold text-sm leading-relaxed">{part}</span>
                    })}
                    {isRunning && (
                      <span className="inline-block w-0.5 h-4 bg-white ml-1 animate-blink shadow-[0_0_8px_rgba(255,255,255,0.8)]"></span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    {isRunning ? (
                      <div className="text-center space-y-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 bg-white rounded-full animate-bounce shadow-[0_0_12px_rgba(255,255,255,0.8)]" style={{animationDelay: '0s'}}></div>
                          <div className="w-3 h-3 bg-white rounded-full animate-bounce shadow-[0_0_12px_rgba(255,255,255,0.8)]" style={{animationDelay: '0.15s'}}></div>
                          <div className="w-3 h-3 bg-white rounded-full animate-bounce shadow-[0_0_12px_rgba(255,255,255,0.8)]" style={{animationDelay: '0.3s'}}></div>
                        </div>
                        <div className="text-lg font-black text-white">Listening...</div>
                        <div className="text-sm text-white/70 font-bold">Speak naturally</div>
                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        <div className="w-14 h-14 rounded-xl bg-white/10 border-2 border-white/25 flex items-center justify-center mx-auto shadow-lg">
                          <svg className="w-7 h-7 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div className="text-lg font-black text-white">Ready to Start</div>
                        <div className="text-sm text-white/70 font-bold">Press "Start Live Mode" to begin</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 2025 Ultra-Premium Commands Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-white">{filteredCommands.length}</span>
                    <span className="text-xs font-black text-white/60 uppercase tracking-[0.15em]">
                      {searchQuery ? `of ${commands.length} ` : ''}Command{filteredCommands.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/20"></div>
                  <div className="text-xs font-bold text-white/80">
                    {commands.length === 0 ? 'No commands detected yet' : 'AI-powered extraction'}
                  </div>
                </div>
                {commands.length > 0 && (
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => {
                        const allText = filteredCommands.filter(cmd => cmd.polished_response).map(cmd => 
                          `${cmd.command_text}\n${cmd.polished_response}`
                        ).join('\n\n')
                        navigator.clipboard.writeText(allText)
                      }}
                      className="h-9 px-5 bg-white text-black hover:bg-black hover:text-white transition-all duration-300 hover:scale-110 active:scale-95 rounded-xl font-black shadow-2xl overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                      <span className="relative text-xs">Copy All</span>
                    </Button>
                    <Button 
                      onClick={() => setCommands([])}
                      className="h-9 px-5 border-2 border-white/40 text-white hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-110 active:scale-95 rounded-xl font-black shadow-2xl"
                      style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}
                    >
                      <span className="text-xs">Clear All</span>
                    </Button>
                  </div>
                )}
              </div>
              
              {/* 2025 Ultra-Premium Commands Display */}
              <div className="relative max-h-[320px] overflow-y-auto rounded-xl p-4 border-2 border-white/20 bg-white/8 shadow-inner">
                <div className="space-y-3">
                  {filteredCommands.length === 0 && searchQuery ? (
                    <div className="text-center py-12">
                      <div className="w-14 h-14 rounded-xl bg-white/10 border-2 border-white/25 flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <svg className="w-7 h-7 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div className="text-lg font-black text-white mb-2">No matches</div>
                      <div className="text-sm text-white/70 font-bold">No commands match "{searchQuery}"</div>
                    </div>
                  ) : filteredCommands.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-14 h-14 rounded-xl bg-white/10 border-2 border-white/25 flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <svg className="w-7 h-7 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                      </div>
                      <div className="text-lg font-black text-white mb-2">
                        {isRunning ? 'Listening...' : 'Ready to Start'}
                      </div>
                      <div className="text-sm text-white/70 font-bold">
                        {isRunning ? 'AI will detect commands from speech' : 'Start Live Mode to detect commands'}
                      </div>
                    </div>
                  ) : (
                    filteredCommands.map((cmd, idx) => {
                      const originalIndex = commands.indexOf(cmd)
                      const isSelected = idx === selectedCommandIndex
                      return (
                        <div 
                          key={originalIndex} 
                          className={`relative border-2 rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${
                            isSelected ? 'border-white/50 scale-[1.02] shadow-2xl' : 'border-white/25 hover:border-white/40'
                          }`}
                          style={{backgroundColor: `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * 0.85))`}}
                        >
                          {/* Command Header */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-black text-white leading-tight mb-2">{cmd.command_text}</div>
                              <div className="flex items-center gap-2 text-xs text-white/60 font-bold">
                                <span>{cmd.timestamp}</span>
                                <span>•</span>
                                <span>{cmd.who_said_it}</span>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <Button 
                                onClick={() => {
                                  const text = `${cmd.command_text}${cmd.polished_response ? '\n' + cmd.polished_response : ''}`
                                  navigator.clipboard.writeText(text)
                                }}
                                className="h-8 w-8 p-0 bg-white/15 border-2 border-white/25 text-white hover:bg-white/25 hover:border-white/40 transition-all duration-300 rounded-lg group shadow-lg"
                              >
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
                                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
                                </svg>
                              </Button>
                              <Button 
                                onClick={() => handlePolish(originalIndex)}
                                className="h-8 px-4 bg-white text-black hover:bg-white transition-all duration-300 rounded-lg text-xs font-black group shadow-2xl overflow-hidden"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                                <div className="relative flex items-center gap-1.5">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                  </svg>
                                  Polish
                                </div>
                              </Button>
                            </div>
                          </div>
                          
                          {/* AI Response */}
                          {cmd.polished_response && (
                            <div className="mt-3 pt-3 border-t-2 border-white/15">
                              <div className="text-xs font-black text-white/60 uppercase tracking-[0.15em] mb-2">AI Response</div>
                              <div className="text-sm text-white/95 leading-relaxed whitespace-pre-wrap font-semibold">{cmd.polished_response}</div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
              
              {/* 2025 Ultra-Premium Keyboard Shortcuts */}
              {commands.length > 0 && (
                <div className="border-t-2 border-white/15 pt-4">
                  <div className="flex items-center justify-center gap-6 text-xs">
                    <div className="flex items-center gap-1.5">
                      <kbd className="px-2 py-1 bg-white/15 border-2 border-white/25 rounded-lg text-xs font-black text-white shadow-lg">Ctrl+K</kbd>
                      <span className="text-white/70 font-black">Search</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <kbd className="px-2 py-1 bg-white/15 border-2 border-white/25 rounded-lg text-xs font-black text-white shadow-lg">Ctrl+C</kbd>
                      <span className="text-white/70 font-black">Copy</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <kbd className="px-2 py-1 bg-white/15 border-2 border-white/25 rounded-lg text-xs font-black text-white shadow-lg">↑↓</kbd>
                      <span className="text-white/70 font-black">Navigate</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <kbd className="px-2 py-1 bg-white/15 border-2 border-white/25 rounded-lg text-xs font-black text-white shadow-lg">Enter</kbd>
                      <span className="text-white/70 font-black">Polish</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LiveTranscriptPanel;

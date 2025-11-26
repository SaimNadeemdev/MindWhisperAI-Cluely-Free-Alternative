import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";

interface WordTs { word: string; start: number; end: number }
interface TranscriptResult { id: string; text: string; words?: WordTs[] }

interface ActionCommand {
  command_text: string
  timestamp: string
  who_said_it: string
  suggested_response: string
  polished_response?: string
}

/**
 * Optimized audio processing functions for Moonshine
 */
const AudioUtils = {
  SAMPLE_RATE: 16000, // Moonshine expects 16kHz
  CHUNK_DURATION: 1.5, // Reduced latency

  processAudioChunk(channels: Float32Array[], originalSampleRate: number): Float32Array {
    if (channels.length === 0) return new Float32Array(0);

    // Convert to mono by averaging channels
    const monoData = new Float32Array(channels[0].length);
    for (let i = 0; i < channels[0].length; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels.length; ch++) {
        sum += channels[ch][i] || 0;
      }
      monoData[i] = sum / channels.length;
    }

    // Resample to 16kHz if needed
    if (originalSampleRate !== this.SAMPLE_RATE) {
      return this.resample(monoData, originalSampleRate, this.SAMPLE_RATE);
    }

    return monoData;
  },

  resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (inputRate === outputRate) return input;

    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
    }

    return output;
  },

  encodeWavBase64(audioData: Float32Array, sampleRate?: number): string {
    const sr = sampleRate ?? AudioUtils.SAMPLE_RATE
    const length = audioData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // Convert float32 to int16
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    // Convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  detectSilence(audioData: Float32Array, threshold: number = 0.01): boolean {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    const average = sum / audioData.length;
    return average < threshold;
  }
};

const ImprovedLiveTranscriptPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'transcript'|'commands'>('transcript')
  const [engineStatus, setEngineStatus] = useState<string>('Stopped')

  // Transcript state
  const [transcript, setTranscript] = useState<string>("")
  const [history, setHistory] = useState<Array<{ text: string; start: number; end: number }>>([])
  const [commands, setCommands] = useState<ActionCommand[]>([])

  // Streaming capture
  const mediaStreamRef = useRef<MediaStream|null>(null)
  const audioCtxRef = useRef<AudioContext|null>(null)
  const processorRef = useRef<ScriptProcessorNode|null>(null)
  const audioBufferRef = useRef<Float32Array>(new Float32Array(0))
  const sampleRateRef = useRef<number>(48000)
  const totalFramesSentRef = useRef<number>(0)
  const lastSpeechTimeRef = useRef<number>(Date.now())
  const pendingUtteranceRef = useRef<string>("")

  // Performance monitoring
  const [processingStats, setProcessingStats] = useState({
    chunksProcessed: 0,
    avgLatency: 0,
    lastProcessTime: 0
  })

  const resetBuffers = () => {
    audioBufferRef.current = new Float32Array(0)
    totalFramesSentRef.current = 0
  }

  const stopCapture = async () => {
    try {
      processorRef.current?.disconnect()
      processorRef.current = null
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
      resetBuffers()
      
      setEngineStatus('Stopping...')
      await window.electronAPI.stopLiveTranscript()
      setEngineStatus('Stopped')
      setIsRunning(false)
    } catch (error) {
      console.error('Error stopping capture:', error)
      setEngineStatus('Error stopping')
    }
  }

  const startCapture = async () => {
    try {
      setEngineStatus('Starting Moonshine engine...')
      
      // Start Moonshine backend engine
      const started = await window.electronAPI.startLiveTranscript()
      if (!started?.success) {
        throw new Error(started?.error || 'Failed to start Moonshine backend')
      }
      
      setEngineStatus('Requesting audio access...')

      // Request system audio via display media
      const displayStream = await // @ts-ignore - Chromium supports audio in getDisplayMedia
        navigator.mediaDevices.getDisplayMedia({ 
          audio: {
            channelCount: 1, // Request mono audio
            sampleRate: AudioUtils.SAMPLE_RATE, // Request 16kHz if possible
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }, 
          video: false as any 
        })
      
      mediaStreamRef.current = displayStream
      setEngineStatus('Setting up audio processing...')

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = audioCtx
      sampleRateRef.current = audioCtx.sampleRate

      const source = audioCtx.createMediaStreamSource(displayStream)
      // Smaller buffer size for lower latency
      const processor = audioCtx.createScriptProcessor(2048, 2, 2)
      processorRef.current = processor

      processor.onaudioprocess = async (e) => {
        const startTime = performance.now()
        const input = e.inputBuffer
        const channels: Float32Array[] = []
        
        for (let ch = 0; ch < input.numberOfChannels; ch++) {
          const data = new Float32Array(input.length)
          input.copyFromChannel(data, ch, 0)
          channels.push(data)
        }

        // Process audio with optimized pipeline
        const processedAudio = AudioUtils.processAudioChunk(channels, sampleRateRef.current)
        
        // Skip if silent
        if (AudioUtils.detectSilence(processedAudio)) {
          return
        }

        // Append to buffer
        const newBuffer = new Float32Array(audioBufferRef.current.length + processedAudio.length)
        newBuffer.set(audioBufferRef.current, 0)
        newBuffer.set(processedAudio, audioBufferRef.current.length)
        audioBufferRef.current = newBuffer

        // Check if we have enough data for a chunk
        const framesPerChunk = Math.floor(AudioUtils.CHUNK_DURATION * AudioUtils.SAMPLE_RATE)
        
        if (audioBufferRef.current.length >= framesPerChunk) {
          const chunk = audioBufferRef.current.slice(0, framesPerChunk)
          const remainder = audioBufferRef.current.slice(framesPerChunk)
          audioBufferRef.current = remainder

          try {
            const base64 = AudioUtils.encodeWavBase64(chunk, AudioUtils.SAMPLE_RATE)
            const id = `moonshine-${Date.now()}-${totalFramesSentRef.current}`
            
            const res: TranscriptResult = await window.electronAPI.sendTranscriptChunk(id, base64)
            
            const offsetSec = totalFramesSentRef.current / AudioUtils.SAMPLE_RATE
            totalFramesSentRef.current += framesPerChunk

            const words = (res.words || []).map(w => ({ 
              word: w.word, 
              start: w.start + offsetSec, 
              end: w.end + offsetSec 
            }))

            if (res.text && res.text.trim()) {
              lastSpeechTimeRef.current = Date.now()
              setTranscript(prev => (prev ? prev + ' ' : '') + res.text.trim())
              pendingUtteranceRef.current = (pendingUtteranceRef.current ? pendingUtteranceRef.current + ' ' : '') + res.text.trim()
              
              if (words.length > 0) {
                const segStart = words[0].start
                const segEnd = words[words.length - 1].end
                setHistory(prev => [...prev, { text: res.text.trim(), start: segStart, end: segEnd }])
              }
            }

            // Update performance stats
            const processingTime = performance.now() - startTime
            setProcessingStats(prev => ({
              chunksProcessed: prev.chunksProcessed + 1,
              avgLatency: (prev.avgLatency + processingTime) / 2,
              lastProcessTime: processingTime
            }))

          } catch (error) {
            console.error('Error processing audio chunk:', error)
          }
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)

      setIsRunning(true)
      setEngineStatus('Live transcription active')
      lastSpeechTimeRef.current = Date.now()

    } catch (err) {
      console.error('Start capture failed:', err)
      setEngineStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      await stopCapture()
    }
  }

  // Pause detection and command extraction
  useEffect(() => {
    if (!isRunning) return
    
    const interval = setInterval(async () => {
      const now = Date.now()
      const silenceThreshold = 2500 // Reduced from 3000ms for faster response
      
      if (now - lastSpeechTimeRef.current >= silenceThreshold && pendingUtteranceRef.current.trim().length > 0) {
        const utterance = pendingUtteranceRef.current.trim()
        const timestampISO = new Date().toISOString()
        
        try {
          const cmds = await window.electronAPI.extractCommands(utterance, timestampISO)
          if (cmds && Array.isArray(cmds) && cmds.length > 0) {
            setCommands(prev => [...cmds, ...prev])
          }
        } catch (error) {
          console.error('Error extracting commands:', error)
        }
        
        // Reset pending utterance
        pendingUtteranceRef.current = ""
        lastSpeechTimeRef.current = now + 999999 // Block until new speech
      }
    }, 500) // Check more frequently for better responsiveness
    
    return () => clearInterval(interval)
  }, [isRunning])

  const handlePolish = async (idx: number) => {
    const cmd = commands[idx]
    const contextWindow = transcript.slice(-1200)
    
    try {
      const result = await window.electronAPI.polishCommandResponse(cmd.command_text, {
        transcriptWindow: contextWindow,
        timestamp: cmd.timestamp,
        who: cmd.who_said_it
      })
      
      setCommands(prev => prev.map((c, i) => 
        i === idx ? { ...c, polished_response: result.text } : c
      ))
      setActiveTab('commands')
    } catch (error) {
      console.error('Error polishing response:', error)
    }
  }

  return (
    <Card className="card-floating border-border bg-card">
      <CardHeader className="pb-4 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-foreground">
            Moonshine Live Transcription
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Fast, local speech recognition • {engineStatus}
          </CardDescription>
          {isRunning && (
            <div className="text-xs text-muted-foreground mt-1">
              Processed: {processingStats.chunksProcessed} chunks • 
              Avg latency: {processingStats.avgLatency.toFixed(1)}ms
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeTab==='transcript'? 'default':'outline'} 
            size="sm" 
            onClick={() => setActiveTab('transcript')}
          >
            Transcript
          </Button>
          <Button 
            variant={activeTab==='commands'? 'default':'outline'} 
            size="sm" 
            onClick={() => setActiveTab('commands')}
          >
            Commands ({commands.length})
          </Button>
          {!isRunning ? (
            <Button size="sm" onClick={startCapture}>
              Start Moonshine
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={stopCapture}>
              Stop
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'transcript' ? (
          <div className="space-y-2">
            <div className="min-h-[160px] max-h-[280px] overflow-y-auto bg-secondary/30 rounded-lg p-3 border border-border">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {transcript || (isRunning ? 'Listening with Moonshine...' : 'Press Start to begin live transcription.')}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {commands.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No commands detected yet. They will appear here in real time.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {commands.map((cmd, idx) => (
                <div key={idx} className="card-premium p-3 animate-cmd-enter">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{cmd.command_text}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {cmd.timestamp} • {cmd.who_said_it}
                      </div>
                      {cmd.polished_response && (
                        <div className="mt-2 p-2 bg-secondary/30 rounded-md p-2 border border-border">
                          <div className="text-xs text-muted-foreground mb-1">Response:</div>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">{cmd.polished_response}</div>
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={() => handlePolish(idx)}>
                      Polish Response
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ImprovedLiveTranscriptPanel;

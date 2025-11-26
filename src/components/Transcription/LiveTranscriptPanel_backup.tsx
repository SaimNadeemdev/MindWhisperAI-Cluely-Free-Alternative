import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
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

const LiveTranscriptPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'transcript'|'commands'>('transcript')
  const [captureSource, setCaptureSource] = useState<'speaker'|'microphone'|'system'>('speaker')
  const [statusMsg, setStatusMsg] = useState<string>("")
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>("")
  
  // Whisper model selection
  const [whisperModel, setWhisperModel] = useState<string>("large-v3")
  const [whisperEngine, setWhisperEngine] = useState<string>("openai")

  // Transcript state
  const [transcript, setTranscript] = useState<string>("")
  const [history, setHistory] = useState<Array<{ text: string; start: number; end: number }>>([])
  const [commands, setCommands] = useState<ActionCommand[]>([])

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
      if (captureSource === 'system') {
        await window.electronAPI.stopLoopbackTranscript()
        if (loopbackUnsubRef.current) {
          loopbackUnsubRef.current()
          loopbackUnsubRef.current = null
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
    try {
      setStatusMsg("")
      let stream: MediaStream | null = null
      if (captureSource === 'system') {
        // Native loopback path handled entirely in backend; set up event listener
        const res = await window.electronAPI.startLoopbackTranscript({ 
          model: whisperModel, 
          engine: whisperEngine 
        })
        if (!res?.success) throw new Error(res?.error || 'Failed to start loopback transcription')
        loopbackUnsubRef.current = window.electronAPI.onLoopbackTranscript((data) => {
          const text = (data?.text || '').trim()
          if (text) {
            setTranscript(prev => (prev ? prev + ' ' : '') + text)
            pendingUtteranceRef.current = (pendingUtteranceRef.current ? pendingUtteranceRef.current + ' ' : '') + text
            lastSpeechTimeRef.current = Date.now()
          }
        })
        setIsRunning(true)
        setStatusMsg(`Started native system audio capture with ${whisperEngine} Whisper ${whisperModel}`)
        return
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

  // Command extraction from accumulated utterances
  useEffect(() => {
    if (!pendingUtteranceRef.current) return
    
    const checkForCommands = async () => {
      const now = Date.now()
      const timeSinceLastSpeech = now - lastSpeechTimeRef.current
      
      // If 3 seconds of silence, process the accumulated utterance
      if (timeSinceLastSpeech > 3000 && pendingUtteranceRef.current.trim()) {
        try {
          const utterance = pendingUtteranceRef.current.trim()
          const extractedCommands = await window.electronAPI.extractCommands(utterance, new Date().toISOString())
          
          if (extractedCommands && extractedCommands.length > 0) {
            setCommands(prev => [...prev, ...extractedCommands])
          }
          
          // Clear the pending utterance
          pendingUtteranceRef.current = ""
        } catch (error) {
          console.error('Error extracting commands:', error)
        }
      }
    }

    const interval = setInterval(checkForCommands, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll transcript
  const transcriptDisplayText = useMemo(() => {
    if (!transcript) return isRunning ? 'Listening…' : 'Press Start to begin live transcription.'
    return transcript
  }, [transcript, isRunning])

  return (
    <Card className="card-premium">
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Live Transcription</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Real-time speech-to-text with command extraction
              </CardDescription>
            </div>
            {statusMsg && (
              <div className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
                {statusMsg}
              </div>
            )}
          </div>
          
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-1 items-center mr-2">
              <Button variant={captureSource==='speaker'? 'default':'outline'} size="sm" onClick={() => setCaptureSource('speaker')}>Speaker</Button>
              <Button variant={captureSource==='microphone'? 'default':'outline'} size="sm" onClick={() => setCaptureSource('microphone')}>Mic</Button>
              <Button variant={captureSource==='system'? 'default':'outline'} size="sm" onClick={() => setCaptureSource('system')}>Speaker (Native)</Button>
            </div>
            
            {/* Device selector (microphones, including Stereo Mix) */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Device</label>
              <select
                className="input-premium h-8 w-56 text-xs"
                value={selectedMicId}
                onChange={(e) => setSelectedMicId(e.target.value)}
              >
                <option value="">System Default</option>
                {audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                ))}
              </select>
            </div>
            
            {/* Whisper Model Selection for Native Speaker mode */}
            {captureSource === 'system' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Model</label>
                <select
                  className="input-premium h-8 w-40 text-xs"
                  value={`${whisperEngine}-${whisperModel}`}
                  onChange={(e) => {
                    const [engine, model] = e.target.value.split('-', 2)
                    setWhisperEngine(engine)
                    setWhisperModel(model)
                  }}
                >
                  <option value="openai-large-v3">Whisper Large-v3</option>
                  <option value="faster-large-v3">Faster Whisper Large-v3</option>
                  <option value="openai-base">Whisper Base</option>
                  <option value="faster-base">Faster Whisper Base</option>
                </select>
              </div>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const devices = await navigator.mediaDevices.enumerateDevices()
                  const inputs = devices.filter(d => d.kind === 'audioinput')
                  setAudioInputs(inputs)
                } catch {}
              }}
            >
              Refresh
            </Button>
          </div>
          
          <div className="flex gap-2 items-center">
            <Button variant={activeTab==='transcript'? 'default':'outline'} size="sm" onClick={() => setActiveTab('transcript')}>Transcript</Button>
            <Button variant={activeTab==='commands'? 'default':'outline'} size="sm" onClick={() => setActiveTab('commands')}>Actionable Commands</Button>
            {!isRunning ? (
              <Button size="sm" onClick={startCapture}>Start Live Transcript</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={stopCapture}>Stop</Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {activeTab === 'transcript' ? (
          <div className="space-y-2">
            <div className="min-h-[160px] max-h-[280px] overflow-y-auto bg-secondary/30 rounded-lg p-3 border border-border">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{transcriptDisplayText}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {commands.length === 0 && (
              <p className="text-xs text-muted-foreground">No commands detected yet. They will appear here in real time.</p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {commands.map((cmd, idx) => (
                <div key={idx} className="card-premium p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{cmd.command_text}</div>
                      <div className="text-xs text-muted-foreground mt-1">{cmd.timestamp} • {cmd.who_said_it}</div>
                      <div className="text-xs text-foreground mt-2">Suggestion: {cmd.suggested_response}</div>
                    </div>
                    <Button size="sm" onClick={() => handlePolish(idx)}>Polish Response</Button>
                  </div>
                  {cmd.polished_response && (
                    <div className="mt-2 bg-secondary/30 rounded-md p-2 border border-border">
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">{cmd.polished_response}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default LiveTranscriptPanel;

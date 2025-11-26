import React, { useState, useRef, useEffect } from 'react'
import { RiPlayFill, RiPauseFill, RiDownloadLine, RiVoiceprintLine } from 'react-icons/ri'
import { Button } from './button'

interface InteractiveAudioMessageProps {
  audioData: {
    duration: string
    timestamp: string
    size: string
    audioBlob?: Blob
    audioUrl?: string
  }
  className?: string
}

const InteractiveAudioMessage: React.FC<InteractiveAudioMessageProps> = ({
  audioData,
  className = ""
}) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  // Create audio URL from blob if provided
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    if (audioData.audioBlob) {
      const url = URL.createObjectURL(audioData.audioBlob)
      setAudioUrl(url)
      return () => URL.revokeObjectURL(url)
    } else if (audioData.audioUrl) {
      setAudioUrl(audioData.audioUrl)
    }
  }, [audioData.audioBlob, audioData.audioUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration)
      setIsLoaded(true)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleCanPlay = () => {
      setIsLoaded(true)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [audioUrl])

  const togglePlayPause = async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        await audio.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const progressBar = progressRef.current
    if (!audio || !progressBar || !isLoaded) return

    const rect = progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const width = rect.width
    const percentage = clickX / width
    const newTime = percentage * totalDuration

    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const downloadAudio = () => {
    if (audioUrl) {
      const a = document.createElement('a')
      a.href = audioUrl
      a.download = `voice-message-${audioData.timestamp}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const progressPercentage = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  return (
    <div className={`border border-white/30 rounded-xl p-4 min-w-[280px] shadow-lg backdrop-blur-xl ${className}`} 
         style={{backgroundColor: `rgba(0, 0, 0, var(--stealth-opacity, 0.95))`}}>
      
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shadow-lg">
          <RiVoiceprintLine className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm text-white mb-1">Voice Message</div>
          <div className="text-xs text-white/70">Sent at {audioData.timestamp}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={downloadAudio}
          className="h-10 w-10 p-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 transition-all duration-300 hover:scale-110"
          title="Download audio"
        >
          <RiDownloadLine className="w-5 h-5 text-white" />
        </Button>
      </div>

      {/* Audio Controls */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={togglePlayPause}
          disabled={!isLoaded}
          className="h-14 w-14 p-0 rounded-full bg-white/20 text-white hover:bg-white/30 disabled:bg-white/10 disabled:text-white/40 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl disabled:hover:scale-100 disabled:cursor-not-allowed flex-shrink-0 border border-white/30"
        >
          {isPlaying ? (
            <RiPauseFill className="w-7 h-7" />
          ) : (
            <RiPlayFill className="w-7 h-7 ml-0.5" />
          )}
        </Button>

        {/* Waveform/Progress Area */}
        <div className="flex-1">
          {/* Progress Bar */}
          <div 
            ref={progressRef}
            className="relative h-8 bg-white/10 rounded-full cursor-pointer overflow-hidden mb-2 hover:bg-white/15 transition-all duration-300"
            onClick={handleProgressClick}
          >
            {/* Progress Fill */}
            <div 
              className="absolute left-0 top-0 h-full bg-white rounded-full transition-all duration-200 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
            
            {/* Waveform Visualization (Static for now) */}
            <div className="absolute inset-0 flex items-center justify-center gap-0.5 px-2">
              {Array.from({ length: 40 }, (_, i) => (
                <div
                  key={i}
                  className={`w-0.5 rounded-full transition-all duration-200 ${
                    (i / 40) * 100 <= progressPercentage ? 'bg-white' : 'bg-white/30'
                  }`}
                  style={{
                    height: `${Math.random() * 16 + 8}px`,
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </div>

            {/* Playhead */}
            {isLoaded && (
              <div 
                className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow-lg transform -translate-y-1/2 transition-all duration-200 ease-out"
                style={{ left: `calc(${progressPercentage}% - 6px)` }}
              />
            )}
          </div>

          {/* Time Display */}
          <div className="flex items-center justify-between text-xs text-white/70">
            <span className="font-mono">
              {isLoaded ? formatTime(currentTime) : '0:00'}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono">
                {isLoaded ? formatTime(totalDuration) : audioData.duration}
              </span>
              <span className="text-white/50">•</span>
              <span>{audioData.size}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {!isLoaded && audioUrl && (
        <div className="mt-2 flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
          </div>
          <span className="ml-2 text-xs text-white/60">Loading audio...</span>
        </div>
      )}
    </div>
  )
}

export default InteractiveAudioMessage

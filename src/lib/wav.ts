// Simple WAV encoder for Float32 PCM -> 16-bit PCM WAV base64
export function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const buffer = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    let s = Math.max(-1, Math.min(1, float32[i]))
    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

export function encodeWavBase64(channels: Float32Array[], sampleRate: number): string {
  const numChannels = channels.length
  const numFrames = channels[0]?.length || 0

  // Interleave if stereo; for mono, just that channel
  let interleaved: Float32Array
  if (numChannels === 1) {
    interleaved = channels[0]
  } else {
    interleaved = new Float32Array(numFrames * numChannels)
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        interleaved[i * numChannels + ch] = channels[ch][i]
      }
    }
  }

  const pcm16 = floatTo16BitPCM(interleaved)
  const blockAlign = numChannels * 2 // 16-bit
  const byteRate = sampleRate * blockAlign
  const dataSize = pcm16.length * 2

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM
  view.setUint16(20, 1, true) // Linear PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // PCM data
  let offset = 44
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true)
  }

  // Convert to base64
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

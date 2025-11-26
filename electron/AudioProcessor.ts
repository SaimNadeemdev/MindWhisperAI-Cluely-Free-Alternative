/**
 * Optimized Audio Processing Helper for Moonshine Live Transcription
 * Reduces latency and improves reliability compared to the original Whisper implementation
 */

export class AudioProcessor {
  private static readonly SAMPLE_RATE = 16000; // Moonshine expects 16kHz
  private static readonly CHUNK_SIZE = 1024; // Smaller chunks for lower latency
  private static readonly BUFFER_DURATION = 1.5; // Reduced from 2.0 seconds

  /**
   * Convert multi-channel audio to mono and resample to 16kHz
   */
  public static processAudioChunk(channels: Float32Array[], originalSampleRate: number): Float32Array {
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
  }

  /**
   * Simple linear interpolation resampling
   */
  private static resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
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
  }

  /**
   * Convert Float32Array to WAV format base64 string
   */
  public static encodeWavBase64(audioData: Float32Array, sampleRate: number = this.SAMPLE_RATE): string {
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
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
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
  }

  /**
   * Detect silence in audio data
   */
  public static detectSilence(audioData: Float32Array, threshold: number = 0.01): boolean {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    const average = sum / audioData.length;
    return average < threshold;
  }

  /**
   * Apply noise gate to reduce background noise
   */
  public static applyNoiseGate(audioData: Float32Array, threshold: number = 0.005): Float32Array {
    const output = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      output[i] = Math.abs(audioData[i]) > threshold ? audioData[i] : 0;
    }
    return output;
  }

  /**
   * Get optimal chunk duration for processing
   */
  public static getChunkDuration(): number {
    return this.BUFFER_DURATION;
  }

  /**
   * Get target sample rate
   */
  public static getSampleRate(): number {
    return this.SAMPLE_RATE;
  }

  /**
   * Calculate frames per chunk based on sample rate
   */
  public static getFramesPerChunk(sampleRate: number): number {
    return Math.floor(this.BUFFER_DURATION * sampleRate);
  }
}

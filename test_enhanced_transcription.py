import pyaudiowpatch as pyaudio
import numpy as np
import time
import json
from scipy import signal
import noisereduce as nr

# Import our enhanced functions
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'worker-script', 'python'))

def enhance_audio_for_speech(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Enhanced audio preprocessing for better speech transcription accuracy"""
    if len(audio) == 0:
        return audio
    
    # 1. Normalize audio to prevent clipping
    if np.max(np.abs(audio)) > 0:
        audio = audio / np.max(np.abs(audio)) * 0.95
    
    # 2. Apply high-pass filter to remove low-frequency noise (< 80Hz)
    nyquist = sample_rate / 2
    low_cutoff = 80 / nyquist
    if low_cutoff < 1.0:
        b, a = signal.butter(4, low_cutoff, btype='high')
        audio = signal.filtfilt(b, a, audio)
    
    # 3. Apply low-pass filter to remove high-frequency noise (> 8000Hz)
    high_cutoff = min(8000 / nyquist, 0.95)
    b, a = signal.butter(4, high_cutoff, btype='low')
    audio = signal.filtfilt(b, a, audio)
    
    # 4. Noise reduction using spectral gating
    try:
        if len(audio) > sample_rate * 0.5:
            audio = nr.reduce_noise(
                y=audio, 
                sr=sample_rate,
                stationary=False,
                prop_decrease=0.8,
                n_grad_freq=2,
                n_grad_time=4
            )
    except Exception:
        # Fallback: simple noise gate
        noise_threshold = np.percentile(np.abs(audio), 10)
        audio = np.where(np.abs(audio) > noise_threshold * 2, audio, audio * 0.1)
    
    # 5. Dynamic range compression for consistent volume
    threshold = 0.3
    ratio = 4.0
    above_threshold = np.abs(audio) > threshold
    compressed = np.where(
        above_threshold,
        np.sign(audio) * (threshold + (np.abs(audio) - threshold) / ratio),
        audio
    )
    audio = compressed
    
    # 6. Apply pre-emphasis filter (common in speech processing)
    pre_emphasis = 0.97
    audio = np.append(audio[0], audio[1:] - pre_emphasis * audio[:-1])
    
    # 7. Final normalization
    if np.max(np.abs(audio)) > 0:
        audio = audio / np.max(np.abs(audio)) * 0.8
    
    return audio.astype(np.float32)

def detect_speech_activity(audio: np.ndarray, sample_rate: int) -> bool:
    """Detect if audio contains speech activity"""
    if len(audio) == 0:
        return False
    
    # Calculate energy
    energy = np.mean(audio ** 2)
    
    # Calculate zero crossing rate (speech has moderate ZCR)
    zero_crossings = np.sum(np.abs(np.diff(np.sign(audio)))) / (2 * len(audio))
    
    # Calculate spectral centroid (speech has characteristic frequency distribution)
    fft = np.abs(np.fft.fft(audio))
    freqs = np.fft.fftfreq(len(audio), 1/sample_rate)
    spectral_centroid = np.sum(freqs[:len(freqs)//2] * fft[:len(fft)//2]) / np.sum(fft[:len(fft)//2])
    
    # Speech detection thresholds
    energy_threshold = 0.001
    zcr_min, zcr_max = 0.01, 0.3
    centroid_min, centroid_max = 200, 4000
    
    has_energy = energy > energy_threshold
    has_speech_zcr = zcr_min < zero_crossings < zcr_max
    has_speech_spectrum = centroid_min < spectral_centroid < centroid_max
    
    return has_energy and (has_speech_zcr or has_speech_spectrum)

def test_enhanced_audio_processing():
    pa = pyaudio.PyAudio()
    
    # Find WASAPI loopback device
    wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
    default_output_device = pa.get_device_info_by_index(wasapi_info['defaultOutputDevice'])
    default_output_name = default_output_device['name']
    
    # Find corresponding loopback device
    loopback_index = None
    for i in range(pa.get_device_count()):
        di = pa.get_device_info_by_index(i)
        if (di.get('isLoopbackDevice', False) and 
            di.get('hostApi') == wasapi_info['index'] and
            default_output_name in di['name']):
            loopback_index = i
            break
    
    if loopback_index is None:
        print("No loopback device found!")
        pa.terminate()
        return
    
    # Test audio capture with enhancement
    dev_info = pa.get_device_info_by_index(loopback_index)
    sample_rate = int(dev_info['defaultSampleRate'])
    
    stream = pa.open(
        format=pyaudio.paFloat32,
        channels=2,
        rate=sample_rate,
        input=True,
        input_device_index=loopback_index,
        frames_per_buffer=1024,
    )
    
    print("Testing enhanced audio processing...")
    print("Play some speech audio and watch the analysis...")
    
    try:
        audio_buffer = []
        target_sr = 16000
        
        for i in range(100):  # Test for 10 seconds
            data = stream.read(1024, exception_on_overflow=False)
            audio = np.frombuffer(data, dtype=np.float32)
            
            # Convert stereo to mono
            audio = audio.reshape(-1, 2).mean(axis=1)
            
            # Simple resampling to 16kHz
            if sample_rate != target_sr:
                ratio = target_sr / sample_rate
                new_length = int(len(audio) * ratio)
                audio = np.interp(np.linspace(0, len(audio), new_length), np.arange(len(audio)), audio)
            
            audio_buffer.extend(audio)
            
            # Process when we have 2 seconds of audio
            if len(audio_buffer) >= target_sr * 2:
                process_audio = np.array(audio_buffer[-target_sr * 2:])
                
                # Test speech detection
                has_speech = detect_speech_activity(process_audio, target_sr)
                
                if has_speech:
                    # Test audio enhancement
                    original_rms = np.sqrt(np.mean(process_audio**2))
                    enhanced = enhance_audio_for_speech(process_audio, target_sr)
                    enhanced_rms = np.sqrt(np.mean(enhanced**2))
                    
                    print(f"Speech detected! Original RMS: {original_rms:.4f}, Enhanced RMS: {enhanced_rms:.4f}")
                else:
                    rms = np.sqrt(np.mean(process_audio**2))
                    print(f"No speech detected. RMS: {rms:.4f}")
                
                # Keep buffer manageable
                audio_buffer = audio_buffer[-target_sr:]
            
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("Stopped by user")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()

if __name__ == "__main__":
    test_enhanced_audio_processing()

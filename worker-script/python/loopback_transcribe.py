import os
import sys

# CRITICAL: Add bundled site-packages to sys.path BEFORE any imports
paths_added = []

# Strategy 1: sys.executable
if hasattr(sys, 'executable') and sys.executable:
    python_dir = os.path.dirname(sys.executable)
    for path_to_add in [
        os.path.join(python_dir, 'Lib', 'site-packages'),
        os.path.join(python_dir, 'Lib'),
        os.path.join(python_dir, 'DLLs'),
        python_dir
    ]:
        if os.path.exists(path_to_add) and path_to_add not in sys.path:
            sys.path.insert(0, path_to_add)
            paths_added.append(path_to_add)

# Strategy 2: PYTHONHOME env
if len(paths_added) == 0 and 'PYTHONHOME' in os.environ:
    python_home = os.environ['PYTHONHOME']
    for path_to_add in [
        os.path.join(python_home, 'Lib', 'site-packages'),
        os.path.join(python_home, 'Lib'),
        os.path.join(python_home, 'DLLs'),
        python_home
    ]:
        if os.path.exists(path_to_add) and path_to_add not in sys.path:
            sys.path.insert(0, path_to_add)
            paths_added.append(path_to_add)

# Strategy 3: Relative to script
if len(paths_added) == 0:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for python_dir_rel in ['..\\..\\python-portable', '..\\..\\resources\\python-portable']:
        python_dir = os.path.abspath(os.path.join(script_dir, python_dir_rel))
        if os.path.exists(python_dir):
            for path_to_add in [
                os.path.join(python_dir, 'Lib', 'site-packages'),
                os.path.join(python_dir, 'Lib'),
                os.path.join(python_dir, 'DLLs'),
                python_dir
            ]:
                if os.path.exists(path_to_add) and path_to_add not in sys.path:
                    sys.path.insert(0, path_to_add)
                    paths_added.append(path_to_add)

import json
import time
import base64
import io
import wave
import numpy as np
import pyaudiowpatch as pyaudio
from scipy import signal
from scipy.ndimage import median_filter
import noisereduce as nr

# Import Whisper models
try:
    import whisper
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({"type": "error", "error": "Whisper not installed. Run: pip install openai-whisper faster-whisper"}))
    sys.exit(1)

# Get Whisper model and engine from environment variables
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "medium")
WHISPER_ENGINE = os.getenv("WHISPER_ENGINE", "openai")

# Debug: Print what we received
print(json.dumps({"type": "debug", "message": f"Python received env vars: WHISPER_MODEL={WHISPER_MODEL}, WHISPER_ENGINE={WHISPER_ENGINE}"}))
sys.stdout.flush()
TARGET_SR = 16000
CHUNK_SECONDS = 1.0

# Initialize Whisper model based on engine choice
model = None
faster_model = None

def get_optimal_device():
    """Detect the best available device for Whisper inference"""
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
            print(json.dumps({"type": "debug", "message": f"CUDA detected: {torch.cuda.get_device_name(0)}"}))
        else:
            device = "cpu"
            compute_type = "int8"
            print(json.dumps({"type": "debug", "message": "CUDA not available, using CPU"}))
        sys.stdout.flush()
        return device, compute_type
    except ImportError:
        print(json.dumps({"type": "debug", "message": "PyTorch not available, defaulting to CPU"}))
        sys.stdout.flush()
        return "cpu", "int8"

def initialize_whisper_model():
    global model, faster_model
    try:
        device, compute_type = get_optimal_device()
        
        print(json.dumps({"type": "status", "message": f"Loading {WHISPER_ENGINE} Whisper model: {WHISPER_MODEL} on {device.upper()}"}))
        sys.stdout.flush()
        
        if WHISPER_ENGINE == "faster":
            # Use faster-whisper for better performance - Force CPU mode due to CUDA library issues
            print(json.dumps({"type": "status", "message": "Initializing faster-whisper on CPU (CUDA libraries incompatible)..."}))
            sys.stdout.flush()
            
            # Debug: Force CPU mode
            print(json.dumps({"type": "debug", "message": f"Loading faster-whisper model: {WHISPER_MODEL} on CPU (forced due to cublas issues)"}))
            sys.stdout.flush()
            
            # Always use CPU for faster-whisper to avoid CUDA library conflicts
            faster_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
            device = "cpu"
            
            # Test the model by doing a quick transcription
            test_audio = np.zeros(16000, dtype=np.float32)  # 1 second of silence
            try:
                segments, info = faster_model.transcribe(test_audio, language="en")
                print(json.dumps({"type": "debug", "message": f"Model test successful for {WHISPER_MODEL} on {device.upper()}"}))
                sys.stdout.flush()
            except Exception as test_error:
                print(json.dumps({"type": "error", "error": f"Model test failed for {WHISPER_MODEL}: {test_error}"}))
                sys.stdout.flush()
                raise test_error
            
            print(json.dumps({"type": "ready", "model": f"faster-whisper-{WHISPER_MODEL}", "engine": "faster", "device": "cpu"}))
        else:
            # Use OpenAI Whisper
            print(json.dumps({"type": "status", "message": f"Initializing OpenAI Whisper on {device.upper()}..."}))
            sys.stdout.flush()
            
            # Debug: Check available models
            print(json.dumps({"type": "debug", "message": f"Attempting to load OpenAI Whisper model: {WHISPER_MODEL}"}))
            sys.stdout.flush()
            
            model = whisper.load_model(WHISPER_MODEL, device=device)
            
            # Test the model by doing a quick transcription
            test_audio = np.zeros(16000, dtype=np.float32)  # 1 second of silence
            try:
                # Use fp16=False for CPU, fp16=True for GPU
                fp16_enabled = device == "cuda"
                result = model.transcribe(test_audio, language="en", fp16=fp16_enabled)
                print(json.dumps({"type": "debug", "message": f"Model test successful for {WHISPER_MODEL} on {device.upper()}"}))
                sys.stdout.flush()
            except Exception as test_error:
                print(json.dumps({"type": "error", "error": f"Model test failed for {WHISPER_MODEL}: {test_error}"}))
                sys.stdout.flush()
                raise test_error
            
            print(json.dumps({"type": "ready", "model": f"openai-whisper-{WHISPER_MODEL}", "engine": "openai", "device": device}))
        
        sys.stdout.flush()
        
    except Exception as e:
        error_msg = f"Failed to load Whisper model {WHISPER_MODEL} with engine {WHISPER_ENGINE}: {str(e)}"
        print(json.dumps({"type": "error", "error": error_msg}))
        print(json.dumps({"type": "debug", "message": f"Full error details: {repr(e)}"}))
        sys.stdout.flush()
        
        # Try fallback to base model for ANY failed model (not just large-v3)
        if WHISPER_MODEL != "base":
            try:
                print(json.dumps({"type": "status", "message": f"Falling back from {WHISPER_MODEL} to base model..."}))
                sys.stdout.flush()
                if WHISPER_ENGINE == "faster":
                    print(json.dumps({"type": "debug", "message": "Loading faster-whisper base model as fallback"}))
                    sys.stdout.flush()
                    faster_model = WhisperModel("base", device="cpu", compute_type="int8")
                    
                    # Test fallback model
                    test_audio = np.zeros(16000, dtype=np.float32)
                    segments, info = faster_model.transcribe(test_audio, language="en")
                    
                    print(json.dumps({"type": "ready", "model": "faster-whisper-base", "engine": "faster", "fallback": True}))
                else:
                    print(json.dumps({"type": "debug", "message": "Loading OpenAI Whisper base model as fallback"}))
                    sys.stdout.flush()
                    model = whisper.load_model("base")
                    
                    # Test fallback model
                    test_audio = np.zeros(16000, dtype=np.float32)
                    result = model.transcribe(test_audio, language="en", fp16=False)
                    
                    print(json.dumps({"type": "ready", "model": "openai-whisper-base", "engine": "openai", "fallback": True}))
                sys.stdout.flush()
                return
            except Exception as fallback_error:
                print(json.dumps({"type": "error", "error": f"Fallback to base model also failed: {fallback_error}"}))
                print(json.dumps({"type": "debug", "message": f"Fallback error details: {repr(fallback_error)}"}))
                sys.stdout.flush()
        
        sys.exit(1)

# WASAPI loopback via PyAudioWPatch (PortAudio fork with WASAPI loopback)
try:
    import pyaudiowpatch as pyaudio  # pip install PyAudioWPatch
except ImportError:
    print(json.dumps({
        "type": "error",
        "error": "PyAudioWPatch not installed. Run: pip install PyAudioWPatch",
    }))
    sys.exit(1)

MODEL_NAME = os.environ.get("MOONSHINE_MODEL", "moonshine/base")
TARGET_SR = 16000
CHUNK_SECONDS = 1.0


def resample_linear(data: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return data
    ratio = dst_sr / src_sr
    dst_len = int(len(data) * ratio)
    if dst_len <= 1 or len(data) <= 1:
        return np.zeros((dst_len,), dtype=np.float32)
    x_old = np.linspace(0, 1, num=len(data), endpoint=False)
    x_new = np.linspace(0, 1, num=dst_len, endpoint=False)
    return np.interp(x_new, x_old, data).astype(np.float32)


def enhance_audio_for_speech(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Whisper-optimized audio preprocessing for maximum transcription accuracy"""
    if len(audio) == 0:
        return audio
    
    # 1. Remove DC offset
    audio = audio - np.mean(audio)
    
    # 2. Whisper-specific normalization (expects audio in range [-1, 1])
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.95
    
    # 3. Apply high-pass filter to remove low-frequency noise (< 85Hz for speech)
    nyquist = sample_rate / 2
    low_cutoff = 85 / nyquist
    if low_cutoff < 1.0:
        b, a = signal.butter(5, low_cutoff, btype='high')
        audio = signal.filtfilt(b, a, audio)
    
    # 4. Apply low-pass filter optimized for speech (< 7500Hz)
    high_cutoff = min(7500 / nyquist, 0.95)
    b, a = signal.butter(5, high_cutoff, btype='low')
    audio = signal.filtfilt(b, a, audio)
    
    # 5. Light noise reduction (preserve speech content)
    try:
        if len(audio) > sample_rate * 0.5:
            # Very conservative noise reduction to preserve speech
            audio = nr.reduce_noise(
                y=audio, 
                sr=sample_rate,
                stationary=False,
                prop_decrease=0.3,  # Much lighter noise reduction
                n_grad_freq=1,
                n_grad_time=2
            )
    except Exception:
        # Simple noise gate only for very quiet background
        noise_floor = np.percentile(np.abs(audio), 10)
        audio = np.where(np.abs(audio) > noise_floor * 1.5, audio, audio * 0.8)
    
    # 6. Light dynamic range compression (preserve natural speech dynamics)
    threshold = 0.4  # Higher threshold to preserve quieter speech
    ratio = 2.0      # Gentler compression ratio
    
    audio_abs = np.abs(audio)
    above_threshold = audio_abs > threshold
    
    # Simple compression without knee - preserve more natural dynamics
    compressed = np.copy(audio)
    compressed[above_threshold] = np.sign(audio[above_threshold]) * (
        threshold + (audio_abs[above_threshold] - threshold) / ratio
    )
    
    audio = compressed
    
    # 8. Whisper-specific pre-emphasis (less aggressive than traditional)
    pre_emphasis = 0.95
    audio = np.append(audio[0], audio[1:] - pre_emphasis * audio[:-1])
    
    # 9. Final normalization with headroom for Whisper
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.85  # Leave more headroom
    
    # 10. Ensure audio length is optimal for Whisper (pad if too short)
    min_length = int(sample_rate * 0.5)  # 0.5 seconds minimum
    if len(audio) < min_length:
        padding = min_length - len(audio)
        audio = np.pad(audio, (0, padding), mode='constant', constant_values=0)
    
    return audio.astype(np.float32)


def detect_speech_activity(audio: np.ndarray, sample_rate: int) -> bool:
    """
    Detect if audio contains speech activity
    """
    if len(audio) == 0:
        return False
    
    # Calculate energy
    energy = np.mean(audio ** 2)
    
    # Calculate zero crossing rate (speech has moderate ZCR)
    zero_crossings = np.sum(np.abs(np.diff(np.sign(audio)))) / (2 * len(audio))
    
    # Calculate spectral centroid (speech has characteristic frequency distribution)
    fft = np.abs(np.fft.fft(audio))
    freqs = np.fft.fftfreq(len(audio), 1/sample_rate)
    fft_sum = np.sum(fft[:len(fft)//2])
    if fft_sum > 0:
        spectral_centroid = np.sum(freqs[:len(freqs)//2] * fft[:len(fft)//2]) / fft_sum
    else:
        spectral_centroid = 0
    
    # Speech detection thresholds
    energy_threshold = 0.001
    zcr_min, zcr_max = 0.01, 0.3
    centroid_min, centroid_max = 200, 4000
    
    has_energy = energy > energy_threshold
    has_speech_zcr = zcr_min < zero_crossings < zcr_max
    has_speech_spectrum = centroid_min < spectral_centroid < centroid_max
    
    return has_energy and (has_speech_zcr or has_speech_spectrum)


def float_to_wav_base64(mono_float32: np.ndarray, sample_rate: int) -> str:
    # clamp and convert to int16
    mono_float32 = np.clip(mono_float32, -1.0, 1.0)
    pcm16 = (mono_float32 * 32767.0).astype(np.int16)
    with io.BytesIO() as buf:
        with wave.open(buf, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm16.tobytes())
        return base64.b64encode(buf.getvalue()).decode('ascii')


def transcribe_wav_base64(b64_data: str) -> dict:
    """Transcribe base64-encoded WAV data using Whisper with optimized parameters"""
    global faster_model  # Declare global at function start
    try:
        wav_bytes = base64.b64decode(b64_data)
        
        # Convert bytes to numpy array
        audio_int16 = np.frombuffer(wav_bytes[44:], dtype=np.int16)  # Skip WAV header
        audio_float = audio_int16.astype(np.float32) / 32768.0
        
        # Apply Whisper-optimized preprocessing
        audio_enhanced = enhance_audio_for_speech(audio_float, TARGET_SR)
        
        if WHISPER_ENGINE == "faster":
            # Use faster-whisper with speed-optimized parameters
            try:
                segments, info = faster_model.transcribe(
                    audio_enhanced, 
                    language="en",
                    beam_size=5,  # Valid beam size
                    temperature=0.0,  # Greedy decoding for speed
                    compression_ratio_threshold=2.4,
                    log_prob_threshold=-1.0,
                    no_speech_threshold=0.5,  # Lower threshold for faster detection
                    condition_on_previous_text=False,
                    word_timestamps=False,  # Disabled for speed
                    vad_filter=False,  # Disabled for speed
                    initial_prompt="",
                    suppress_blank=True
                )
            except Exception as transcribe_error:
                # This shouldn't happen since we're using CPU mode, but keep as safety net
                print(json.dumps({"type": "error", "message": f"Unexpected faster-whisper error: {transcribe_error}"}))
                sys.stdout.flush()
                raise transcribe_error
            text_segments = []
            words = []
            
            for segment in segments:
                text_segments.append(segment.text)
                if hasattr(segment, 'words') and segment.words:
                    for word in segment.words:
                        words.append({
                            "word": word.word,
                            "start": word.start,
                            "end": word.end,
                            "probability": word.probability
                        })
            
            return {
                "text": " ".join(text_segments).strip(),
                "words": words,
                "language": info.language,
                "language_probability": info.language_probability
            }
        else:
            # Use OpenAI Whisper with optimized parameters
            # Get device info to determine fp16 setting
            device_name = next(model.parameters()).device
            fp16_enabled = str(device_name) == "cuda"
            
            result = model.transcribe(
                audio_enhanced, 
                language="en",
                word_timestamps=False,  # Disabled for speed
                fp16=fp16_enabled,
                temperature=0.0,  # Greedy decoding for speed
                condition_on_previous_text=False,
                compression_ratio_threshold=2.4,
                logprob_threshold=-1.0,
                no_speech_threshold=0.5  # Lower threshold
            )
            
            words = []
            if 'segments' in result:
                for segment in result['segments']:
                    if 'words' in segment:
                        for word in segment['words']:
                            words.append({
                                "word": word.get('word', ''),
                                "start": word.get('start', 0),
                                "end": word.get('end', 0),
                                "probability": word.get('probability', 0)
                            })
            
            return {
                "text": result.get("text", "").strip(),
                "words": words,
                "language": result.get("language", "en")
            }
            
    except Exception as e:
        return {"text": "", "words": [], "error": str(e)}


def main():
    # Initialize Whisper model first
    initialize_whisper_model()
    sys.stdout.flush()

    pa = pyaudio.PyAudio()

    # Find default WASAPI loopback device
    wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
    if wasapi_info.get('defaultOutputDevice', -1) == -1:
        print(json.dumps({"type": "error", "error": "WASAPI not available or no default output device."}))
        sys.stdout.flush()
        return

    default_output_device = pa.get_device_info_by_index(wasapi_info['defaultOutputDevice'])
    default_output_name = default_output_device['name']

    # Find the corresponding loopback device for the default output
    loopback_index = None
    for i in range(pa.get_device_count()):
        di = pa.get_device_info_by_index(i)
        if (di.get('isLoopbackDevice', False) and 
            di.get('hostApi') == wasapi_info['index'] and
            default_output_name in di['name']):
            loopback_index = i
            break
    
    # Fallback: find any WASAPI loopback device
    if loopback_index is None:
        for i in range(pa.get_device_count()):
            di = pa.get_device_info_by_index(i)
            if di.get('isLoopbackDevice', False) and di.get('hostApi') == wasapi_info['index']:
                loopback_index = i
                break
    
    if loopback_index is None:
        print(json.dumps({"type": "error", "error": "No WASAPI loopback device found. Install/enable Stereo Mix or ensure WASAPI is available."}))
        sys.stdout.flush()
        return
    
    device_index = loopback_index

    dev_info = pa.get_device_info_by_index(device_index)
    src_sr = int(dev_info.get('defaultSampleRate', 48000))
    channels = 2 if dev_info.get('maxInputChannels', 0) >= 2 else 1

    frames_per_chunk = int(src_sr * CHUNK_SECONDS)

    stream = pa.open(
        format=pyaudio.paFloat32,
        channels=channels,
        rate=src_sr,
        input=True,
        input_device_index=device_index,
        frames_per_buffer=frames_per_chunk,
    )

    # Intelligent audio processing for sentence continuity
    audio_buffer = []
    buffer_duration = 5.0  # Longer buffer to capture complete sentences
    max_buffer_samples = int(TARGET_SR * buffer_duration)
    
    # Smart processing with overlap for context preservation
    process_interval = 1.0  # Process every 1 second for better sentence capture
    process_samples = int(TARGET_SR * process_interval)
    
    # Sentence boundary detection
    last_transcription_time = 0
    silence_threshold = 0.001
    min_silence_duration = 0.3  # 300ms of silence indicates sentence boundary
    
    try:
        while True:
            data = stream.read(frames_per_chunk, exception_on_overflow=False)
            audio = np.frombuffer(data, dtype=np.float32)
            
            # Convert stereo to mono
            if channels > 1:
                audio = audio.reshape(-1, channels).mean(axis=1)
            
            # Resample to target sample rate
            mono16k = resample_linear(audio, src_sr, TARGET_SR)
            
            # Add to buffer
            audio_buffer.extend(mono16k)
            
            # Keep buffer at maximum size
            if len(audio_buffer) > max_buffer_samples:
                audio_buffer = audio_buffer[-max_buffer_samples:]
            
            # Smart processing with sentence boundary detection
            if len(audio_buffer) >= process_samples:
                # Detect silence periods for sentence boundaries
                recent_audio = np.array(audio_buffer[-process_samples:])
                energy = np.mean(recent_audio ** 2)
                
                print(json.dumps({"type": "debug", "message": f"Audio energy: {energy:.6f}, threshold: {silence_threshold}"}))
                sys.stdout.flush()
                
                # Use adaptive window size based on speech patterns
                if energy > silence_threshold:
                    # Speech detected - use longer window for complete sentences
                    window_size = min(int(TARGET_SR * 3.0), len(audio_buffer))  # Up to 3 seconds
                    overlap_size = int(TARGET_SR * 0.5)  # 500ms overlap for context
                    
                    if len(audio_buffer) >= window_size:
                        # Use overlapping window to preserve sentence continuity
                        process_audio = np.array(audio_buffer[-window_size:])
                        
                        print(json.dumps({"type": "debug", "message": "Speech activity detected, processing..."}))
                        sys.stdout.flush()
                        
                        # Apply enhanced preprocessing for better accuracy
                        enhanced_audio = enhance_audio_for_speech(process_audio, TARGET_SR)
                        
                        # Only transcribe if audio has sufficient volume
                        max_audio_val = np.max(np.abs(enhanced_audio))
                        print(json.dumps({"type": "debug", "message": f"Max audio value: {max_audio_val:.4f}, threshold: 0.01"}))
                        sys.stdout.flush()
                        
                        if max_audio_val > 0.01:
                            print(json.dumps({"type": "debug", "message": "Audio volume sufficient, transcribing..."}))
                            sys.stdout.flush()
                            
                            b64 = float_to_wav_base64(enhanced_audio, TARGET_SR)
                            result = transcribe_wav_base64(b64)
                            
                            print(json.dumps({"type": "debug", "message": f"Transcription result: {result}"}))
                            sys.stdout.flush()
                            
                            # Enhanced text filtering with sentence completion
                            text = result.get("text", "").strip()
                            if text and len(text) > 2:  # Require at least 3 characters
                                print(json.dumps({"type": "debug", "message": f"Valid text found: '{text}'"}))
                                sys.stdout.flush()
                                
                                print(json.dumps({
                                    "type": "transcription", 
                                    "id": str(int(time.time()*1000)), 
                                    "text": text, 
                                    "words": result.get("words", []),
                                    "confidence": result.get("language_probability", 0.9)
                                }))
                                sys.stdout.flush()
                                
                                last_transcription_time = time.time()
                            else:
                                print(json.dumps({"type": "debug", "message": f"No valid text: '{text}' (length: {len(text) if text else 0})"}))
                                sys.stdout.flush()
                        else:
                            print(json.dumps({"type": "debug", "message": "Audio volume too low, skipping transcription"}))
                            sys.stdout.flush()
                        
                        # Smart buffer management - remove only processed portion with overlap
                        remove_samples = window_size - overlap_size
                        if len(audio_buffer) > remove_samples:
                            audio_buffer = audio_buffer[remove_samples:]
                else:
                    # Silence detected - smaller cleanup
                    remove_samples = int(TARGET_SR * 0.5)  # Remove 0.5 seconds during silence
                    if len(audio_buffer) > remove_samples:
                        audio_buffer = audio_buffer[remove_samples:]
                
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Loopback capture failed: {e}"}))
        sys.stdout.flush()
    finally:
        try:
            stream.stop_stream()
            stream.close()
        except Exception:
            pass
        pa.terminate()


if __name__ == '__main__':
    main()

import os
import sys
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

# Safe import of Whisper models - only import if actually needed
whisper = None
WhisperModel = None
WHISPER_AVAILABLE = False

def import_whisper_if_needed():
    """Import Whisper only when actually needed"""
    global whisper, WhisperModel, WHISPER_AVAILABLE
    
    if WHISPER_AVAILABLE:
        return True
        
    try:
        import whisper as whisper_module
        from faster_whisper import WhisperModel as FasterWhisperModel
        
        whisper = whisper_module
        WhisperModel = FasterWhisperModel
        WHISPER_AVAILABLE = True
        
        print(json.dumps({"type": "debug", "message": "Whisper models imported successfully"}))
        sys.stdout.flush()
        return True
        
    except ImportError as e:
        print(json.dumps({
            "type": "error", 
            "error": f"Whisper not available: {str(e)}. This build only supports Deepgram transcription."
        }))
        sys.stdout.flush()
        return False

# Get Whisper model and engine from environment variables
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "medium")
WHISPER_ENGINE = os.getenv("WHISPER_ENGINE", "openai")

# Debug: Print what we received
print(json.dumps({"type": "debug", "message": f"Python received env vars: WHISPER_MODEL={WHISPER_MODEL}, WHISPER_ENGINE={WHISPER_ENGINE}"}))
sys.stdout.flush()

# Check if this is a Deepgram-only build
if not import_whisper_if_needed():
    print(json.dumps({
        "type": "error", 
        "error": "This is a Deepgram-only build. Whisper transcription is not available. Please use Deepgram transcription instead."
    }))
    sys.stdout.flush()
    sys.exit(1)

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

def load_whisper_model():
    """Load the appropriate Whisper model"""
    global model, faster_model
    
    if not WHISPER_AVAILABLE:
        raise ImportError("Whisper not available in this build")
    
    device, compute_type = get_optimal_device()
    
    print(json.dumps({"type": "status", "message": f"Loading {WHISPER_ENGINE} Whisper model: {WHISPER_MODEL}"}))
    sys.stdout.flush()
    
    try:
        if WHISPER_ENGINE == "faster":
            # Use faster-whisper
            try:
                faster_model = WhisperModel(WHISPER_MODEL, device=device, compute_type=compute_type)
                actual_device = device
                print(json.dumps({"type": "status", "message": f"faster-whisper {WHISPER_MODEL} loaded on {actual_device.upper()}"}))
            except Exception as gpu_error:
                if device == "cuda":
                    print(json.dumps({"type": "fallback", "message": f"GPU loading failed, falling back to CPU", "fallbackModel": f"{WHISPER_MODEL}-cpu"}))
                    faster_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
                    actual_device = "cpu"
                else:
                    raise gpu_error
        else:
            # Use OpenAI Whisper
            model = whisper.load_model(WHISPER_MODEL, device=device)
            print(json.dumps({"type": "status", "message": f"OpenAI Whisper {WHISPER_MODEL} loaded on {device.upper()}"}))
        
        sys.stdout.flush()
        
    except Exception as e:
        error_msg = f"Failed to load {WHISPER_ENGINE} model {WHISPER_MODEL}: {str(e)}"
        print(json.dumps({"type": "error", "error": error_msg}))
        sys.stdout.flush()
        raise

def find_loopback_device():
    """Find the WASAPI loopback device for system audio capture"""
    p = pyaudio.PyAudio()
    
    try:
        # Look for WASAPI loopback device
        wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
        default_speakers = p.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
        
        if not default_speakers["isLoopbackDevice"]:
            for loopback in p.get_loopback_device_info_generator():
                if default_speakers["name"] in loopback["name"]:
                    return loopback["index"]
        else:
            return default_speakers["index"]
            
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Failed to find loopback device: {str(e)}"}))
        sys.stdout.flush()
    finally:
        p.terminate()
    
    return None

def preprocess_audio_for_whisper(audio_data, sample_rate):
    """Enhanced audio preprocessing optimized for Whisper"""
    try:
        # Convert to float32 if needed
        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32)
        
        # Normalize to [-1, 1] range
        if np.max(np.abs(audio_data)) > 0:
            audio_data = audio_data / np.max(np.abs(audio_data))
        
        # Apply noise reduction (light)
        try:
            audio_data = nr.reduce_noise(y=audio_data, sr=sample_rate, prop_decrease=0.6)
        except:
            pass  # Skip if noise reduction fails
        
        # Apply pre-emphasis filter (helps with high frequencies)
        pre_emphasis = 0.97
        audio_data = np.append(audio_data[0], audio_data[1:] - pre_emphasis * audio_data[:-1])
        
        # Light compression to even out volume levels
        threshold = 0.3
        ratio = 4.0
        audio_data = np.where(
            np.abs(audio_data) > threshold,
            threshold + (np.abs(audio_data) - threshold) / ratio * np.sign(audio_data),
            audio_data
        )
        
        # Resample to 16kHz if needed (Whisper's expected sample rate)
        if sample_rate != TARGET_SR:
            num_samples = int(len(audio_data) * TARGET_SR / sample_rate)
            audio_data = signal.resample(audio_data, num_samples)
        
        # Apply median filter to remove impulse noise
        audio_data = median_filter(audio_data, size=3)
        
        # Final normalization
        if np.max(np.abs(audio_data)) > 0:
            audio_data = audio_data / np.max(np.abs(audio_data)) * 0.9
        
        return audio_data.astype(np.float32)
        
    except Exception as e:
        print(json.dumps({"type": "debug", "message": f"Audio preprocessing error: {str(e)}"}))
        sys.stdout.flush()
        return audio_data

def transcribe_audio(audio_data):
    """Transcribe audio using the loaded Whisper model"""
    try:
        if WHISPER_ENGINE == "faster" and faster_model:
            # Use faster-whisper
            segments, info = faster_model.transcribe(
                audio_data,
                language="en",
                beam_size=1,  # Faster inference
                best_of=1,    # Faster inference
                temperature=0.0,
                condition_on_previous_text=False,
                vad_filter=True,  # Voice activity detection
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Extract text from segments
            text = " ".join([segment.text for segment in segments]).strip()
            return text
            
        elif model:
            # Use OpenAI Whisper
            result = model.transcribe(
                audio_data,
                language="en",
                fp16=False,  # More stable
                condition_on_previous_text=False,
                temperature=0.0
            )
            return result["text"].strip()
        else:
            return ""
            
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Transcription failed: {str(e)}"}))
        sys.stdout.flush()
        return ""

def main():
    """Main transcription loop"""
    try:
        # Load Whisper model
        load_whisper_model()
        
        # Find loopback device
        loopback_device_index = find_loopback_device()
        if loopback_device_index is None:
            raise Exception("No loopback device found")
        
        print(json.dumps({"type": "status", "message": "Starting system audio capture..."}))
        sys.stdout.flush()
        
        # Initialize PyAudio
        p = pyaudio.PyAudio()
        
        # Audio stream parameters
        chunk_size = int(TARGET_SR * CHUNK_SECONDS)
        
        stream = p.open(
            format=pyaudio.paFloat32,
            channels=1,
            rate=TARGET_SR,
            input=True,
            input_device_index=loopback_device_index,
            frames_per_buffer=chunk_size
        )
        
        print(json.dumps({"type": "status", "message": "Audio capture started successfully"}))
        sys.stdout.flush()
        
        # Transcription loop
        while True:
            try:
                # Read audio data
                audio_data = stream.read(chunk_size, exception_on_overflow=False)
                audio_array = np.frombuffer(audio_data, dtype=np.float32)
                
                # Skip if audio is too quiet
                if np.max(np.abs(audio_array)) < 0.01:
                    continue
                
                # Preprocess audio
                processed_audio = preprocess_audio_for_whisper(audio_array, TARGET_SR)
                
                # Transcribe
                text = transcribe_audio(processed_audio)
                
                if text:
                    print(json.dumps({
                        "type": "transcription",
                        "text": text,
                        "timestamp": time.time()
                    }))
                    sys.stdout.flush()
                    
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(json.dumps({"type": "error", "error": f"Processing error: {str(e)}"}))
                sys.stdout.flush()
                time.sleep(0.1)  # Brief pause before continuing
        
        # Cleanup
        stream.stop_stream()
        stream.close()
        p.terminate()
        
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Fatal error: {str(e)}"}))
        sys.stdout.flush()
        sys.exit(1)

if __name__ == "__main__":
    main()

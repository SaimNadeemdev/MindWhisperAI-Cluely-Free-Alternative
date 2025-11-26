#!/usr/bin/env python3
"""
Deepgram Live Audio Transcription Worker
Real-time system audio capture and transcription using Deepgram's streaming API
"""

import os
import sys

# CRITICAL: Add bundled site-packages to sys.path BEFORE any imports
paths_added = []
paths_checked = []

# Strategy 1: Use sys.executable location
if hasattr(sys, 'executable') and sys.executable:
    python_dir = os.path.dirname(sys.executable)
    candidates = [
        os.path.join(python_dir, 'Lib', 'site-packages'),
        os.path.join(python_dir, 'Lib'),
        os.path.join(python_dir, 'DLLs'),
        python_dir
    ]
    
    for path_to_add in candidates:
        paths_checked.append(path_to_add)
        if os.path.exists(path_to_add) and path_to_add not in sys.path:
            sys.path.insert(0, path_to_add)
            paths_added.append(path_to_add)

# Strategy 2: Use PYTHONHOME environment variable if set
if len(paths_added) == 0 and 'PYTHONHOME' in os.environ:
    python_home = os.environ['PYTHONHOME']
    candidates = [
        os.path.join(python_home, 'Lib', 'site-packages'),
        os.path.join(python_home, 'Lib'),
        os.path.join(python_home, 'DLLs'),
        python_home
    ]
    
    for path_to_add in candidates:
        paths_checked.append(path_to_add)
        if os.path.exists(path_to_add) and path_to_add not in sys.path:
            sys.path.insert(0, path_to_add)
            paths_added.append(path_to_add)

# Strategy 3: Look relative to script location
if len(paths_added) == 0:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up from worker-script/python to find python-portable
    potential_python_dirs = [
        os.path.join(script_dir, '..', '..', 'python-portable'),
        os.path.join(script_dir, '..', '..', 'resources', 'python-portable'),
    ]
    
    for python_dir in potential_python_dirs:
        python_dir = os.path.abspath(python_dir)
        if os.path.exists(python_dir):
            candidates = [
                os.path.join(python_dir, 'Lib', 'site-packages'),
                os.path.join(python_dir, 'Lib'),
                os.path.join(python_dir, 'DLLs'),
                python_dir
            ]
            
            for path_to_add in candidates:
                paths_checked.append(path_to_add)
                if os.path.exists(path_to_add) and path_to_add not in sys.path:
                    sys.path.insert(0, path_to_add)
                    paths_added.append(path_to_add)

# Debug log
import json as _json
print(_json.dumps({
    "type": "debug",
    "message": f"Python sys.path configured: Added {len(paths_added)} paths",
    "data": {
        "python_executable": sys.executable if hasattr(sys, 'executable') else None,
        "pythonhome_env": os.environ.get('PYTHONHOME'),
        "script_location": os.path.abspath(__file__) if '__file__' in dir() else None,
        "paths_checked": paths_checked[:10],
        "paths_added": paths_added,
        "first_10_syspath": sys.path[:10]
    }
}))
sys.stdout.flush()

import json
import time
import asyncio
import threading
import numpy as np
import pyaudiowpatch as pyaudio
from deepgram.core.events import EventType
"""
Optional scientific libs (SciPy / noisereduce) are not required for Deepgram.
Guard imports to avoid startup crashes when these are not bundled.
"""
try:
    from scipy import signal  # type: ignore
    import noisereduce as nr  # type: ignore
    _HAS_SCI_LIBS = True
except Exception:
    _HAS_SCI_LIBS = False

# Import Deepgram SDK
# Emit a status message before attempting import so the UI can trace progress
print(_json.dumps({"type": "status", "message": "Importing Deepgram SDK..."}))
sys.stdout.flush()
try:
    from deepgram import (
        DeepgramClient,
    )
    # Success indicator for the frontend
    print(_json.dumps({"type": "status", "message": "Deepgram SDK import OK"}))
    sys.stdout.flush()
except ImportError as e:
    # Surface the real missing dependency/module to the frontend
    print(_json.dumps({
        "type": "error",
        "error": f"Failed to import Deepgram SDK: {str(e)}",
        "data": {
            "python_executable": sys.executable if hasattr(sys, 'executable') else None,
            "pythonhome_env": os.environ.get('PYTHONHOME'),
            "site_packages_head": [p for p in sys.path[:5]],
        },
        "hint": "If a sub-dependency like httpx/pydantic/typing_extensions is missing, rebuild or install it into bundled Python."
    }))
    sys.stdout.flush()
    sys.exit(1)

# Get configuration from environment variables
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
DEEPGRAM_MODEL = os.getenv("DEEPGRAM_MODEL", "nova-2")
TARGET_SR = 16000
CHUNK_MS = 20  # 20ms chunks for ultra-low latency real-time streaming

if not DEEPGRAM_API_KEY:
    print(json.dumps({"type": "error", "error": "DEEPGRAM_API_KEY environment variable not set"}))
    sys.exit(1)

# Global variables
deepgram_client = None
connection = None
audio_queue = asyncio.Queue(maxsize=5)  # Small queue to prevent latency buildup
is_running = False
last_transcript = ""  # Track last transcript to avoid duplicates
connection_ready = threading.Event()  # Event to signal when connection is ready
stdout_lock = threading.Lock()  # Lock for thread-safe stdout writing
audio_streaming_started = threading.Event()  # Event to signal when real audio streaming starts
keepalive_thread = None  # Keepalive thread reference
audio_device_info_global = None  # Pre-initialized audio device info
audio_thread = None  # Audio streaming thread reference

def debug_log(message):
    """Send debug message to stdout"""
    with stdout_lock:
        print(json.dumps({"type": "debug", "message": message}), flush=True)

def status_log(message):
    """Send status message to stdout"""
    with stdout_lock:
        print(json.dumps({"type": "status", "message": message}), flush=True)

def error_log(error):
    """Send error message to stdout"""
    with stdout_lock:
        print(json.dumps({"type": "error", "error": str(error)}), flush=True)

def transcription_log(text, confidence=0.9):
    """Send transcription result to stdout"""
    with stdout_lock:
        print(json.dumps({
            "type": "transcription", 
            "id": str(int(time.time() * 1000)), 
            "text": text,
            "confidence": confidence
        }), flush=True)

def keepalive_loop():
    """Send periodic silent audio to keep Deepgram connection alive during initialization"""
    global connection, audio_streaming_started
    
    # Wait a moment for connection to fully establish
    time.sleep(0.3)
    
    silent_audio = np.zeros(1600, dtype=np.int16)  # 100ms of silence at 16kHz
    count = 0
    
    while not audio_streaming_started.is_set():
        try:
            if connection:
                # Prefer official binary send helper
                try:
                    connection.send_media(silent_audio.tobytes())  # type: ignore[attr-defined]
                except AttributeError:
                    # Fallback: use internal _send if exposed
                    if hasattr(connection, '_send'):
                        connection._send(silent_audio.tobytes())  # type: ignore[attr-defined]
                
                count += 1
                # Only log every 2 seconds to reduce spam
                if count % 4 == 0:
                    debug_log(f"Keepalive active ({count * 0.5}s)")
            time.sleep(0.5)  # Send keepalive every 500ms
        except Exception as e:
            # Don't break on errors, just log and continue
            if count == 0:
                # Only log first error to avoid spam
                debug_log(f"Keepalive warning (continuing): {e}")
            break
    
    debug_log(f"Keepalive stopped after {count * 0.5}s - real audio streaming started")

def resample_linear(data: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    """Linear resampling for audio data"""
    if src_sr == dst_sr:
        return data
    ratio = dst_sr / src_sr
    dst_len = int(len(data) * ratio)
    if dst_len <= 1 or len(data) <= 1:
        return np.zeros((dst_len,), dtype=np.float32)
    x_old = np.linspace(0, 1, num=len(data), endpoint=False)
    x_new = np.linspace(0, 1, num=dst_len, endpoint=False)
    return np.interp(x_new, x_old, data).astype(np.float32)

def enhance_audio_for_deepgram(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Deepgram-optimized audio preprocessing"""
    if len(audio) == 0:
        return audio
    # If optional libs are unavailable, return normalized float32 to keep pipeline running
    if not _HAS_SCI_LIBS:
        # Minimal normalization without SciPy/noisereduce
        audio = audio - np.mean(audio)
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val * 0.95
        return audio.astype(np.float32)
    
    # 1. Remove DC offset
    audio = audio - np.mean(audio)
    
    # 2. Normalize to [-1, 1] range
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.95
    
    # 3. Apply high-pass filter to remove low-frequency noise
    nyquist = sample_rate / 2
    low_cutoff = 80 / nyquist
    if low_cutoff < 1.0:
        b, a = signal.butter(4, low_cutoff, btype='high')
        audio = signal.filtfilt(b, a, audio)
    
    # 4. Apply low-pass filter for speech optimization
    high_cutoff = min(8000 / nyquist, 0.95)
    b, a = signal.butter(4, high_cutoff, btype='low')
    audio = signal.filtfilt(b, a, audio)
    
    # 5. Light noise reduction
    try:
        if len(audio) > sample_rate * 0.3:
            audio = nr.reduce_noise(
                y=audio, 
                sr=sample_rate,
                stationary=False,
                prop_decrease=0.2,
                n_grad_freq=1,
                n_grad_time=1
            )
    except Exception:
        # Simple noise gate fallback
        noise_floor = np.percentile(np.abs(audio), 5)
        audio = np.where(np.abs(audio) > noise_floor * 2, audio, audio * 0.7)
    
    # 6. Final normalization
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.9
    
    return audio.astype(np.float32)

def convert_to_pcm16(audio_float32: np.ndarray) -> bytes:
    """Convert float32 audio to PCM16 bytes for Deepgram"""
    # Clamp to [-1, 1] and convert to int16
    audio_clamped = np.clip(audio_float32, -1.0, 1.0)
    pcm16 = (audio_clamped * 32767.0).astype(np.int16)
    return pcm16.tobytes()

async def initialize_deepgram():
    """Initialize Deepgram client and connection"""
    global deepgram_client, connection
    
    try:
        status_log(f"Initializing Deepgram with model: {DEEPGRAM_MODEL}")
        
        # Validate API key format
        if not DEEPGRAM_API_KEY or len(DEEPGRAM_API_KEY) < 10:
            raise Exception(f"Invalid Deepgram API key format. Length: {len(DEEPGRAM_API_KEY) if DEEPGRAM_API_KEY else 0}")
        
        # Create Deepgram client
        deepgram_client = DeepgramClient(DEEPGRAM_API_KEY)
        
        # Create live connection using proper SDK method
        connection = deepgram_client.listen.live({
            "model": DEEPGRAM_MODEL,
            "language": "en-US",
            "smart_format": True,
            "encoding": "linear16",
            "sample_rate": TARGET_SR,
            "channels": 1,
            "interim_results": True,
            "endpointing": 200,
            "utterance_end_ms": 800
        })
        
        # Define event handlers (non-async for live connection)
        def on_open():
            status_log("Deepgram connection opened")
            print(json.dumps({"type": "ready", "model": f"deepgram-{DEEPGRAM_MODEL}", "engine": "deepgram"}))
            sys.stdout.flush()
        
        def handle_transcript(data):
            sentence = data.channel.alternatives[0].transcript
            if len(sentence) == 0:
                return
            
            confidence = getattr(data.channel.alternatives[0], 'confidence', 0.9)
            
            # Process both interim and final results for real-time response
            if hasattr(data, 'is_final') and data.is_final:
                transcription_log(sentence.strip(), confidence)
            else:
                # Show interim results immediately for real-time feel
                if len(sentence.strip()) > 1:
                    transcription_log(sentence.strip(), confidence)
        
        def on_error(error):
            error_log(f"Deepgram error: {error}")
        
        def on_metadata(metadata):
            debug_log(f"Deepgram metadata: {metadata}")
        
        def on_close():
            status_log("Deepgram connection closed")
        
        # Register event handlers using proper live connection events
        connection.on(LiveTranscriptionEvents.Open, on_open)
        connection.on(LiveTranscriptionEvents.Transcript, handle_transcript)
        connection.on(LiveTranscriptionEvents.Error, on_error)
        connection.on(LiveTranscriptionEvents.Metadata, on_metadata)
        connection.on(LiveTranscriptionEvents.Close, on_close)
            
        status_log("Deepgram connection initialized successfully")
        
    except Exception as e:
        error_log(f"Failed to initialize Deepgram: {e}")
        sys.exit(1)

def preinitialize_audio_device():
    """Find and verify audio device before connecting to Deepgram"""
    try:
        pa = pyaudio.PyAudio()
        
        # Find WASAPI loopback device
        wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
        if wasapi_info.get('defaultOutputDevice', -1) == -1:
            error_log("WASAPI not available or no default output device")
            pa.terminate()
            return None
        
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
        
        # Fallback: find any WASAPI loopback device
        if loopback_index is None:
            for i in range(pa.get_device_count()):
                di = pa.get_device_info_by_index(i)
                if di.get('isLoopbackDevice', False) and di.get('hostApi') == wasapi_info['index']:
                    loopback_index = i
                    break
        
        if loopback_index is None:
            error_log("No WASAPI loopback device found")
            pa.terminate()
            return None
        
        dev_info = pa.get_device_info_by_index(loopback_index)
        src_sr = int(dev_info.get('defaultSampleRate', 48000))
        channels = 2 if dev_info.get('maxInputChannels', 0) >= 2 else 1
        
        pa.terminate()
        
        return {
            'device_index': loopback_index,
            'sample_rate': src_sr,
            'channels': channels,
            'frames_per_buffer': 8192
        }
    except Exception as e:
        error_log(f"Audio device pre-initialization error: {e}")
        return None

def audio_capture_and_stream(device_info):
    """Direct audio capture and streaming to Deepgram - no queues or chunking"""
    global is_running, connection
    
    try:
        pa = pyaudio.PyAudio()
        
        device_index = device_info['device_index']
        src_sr = device_info['sample_rate']
        channels = device_info['channels']
        frames_per_buffer = device_info['frames_per_buffer']
        
        status_log(f"Starting direct audio streaming: {src_sr}Hz, {channels} channels")
        
        stream = pa.open(
            format=pyaudio.paFloat32,
            channels=channels,
            rate=src_sr,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=frames_per_buffer,
        )
        
        debug_log("Audio stream opened successfully")
        
        # Audio buffering to ensure continuous stream
        audio_buffer = np.array([], dtype=np.float32)
        min_send_samples = TARGET_SR // 10  # 100ms worth of samples at 16kHz (1600 samples) - larger chunks for better transcription
        
        while is_running and connection:
            try:
                # Read audio data
                data = stream.read(frames_per_buffer, exception_on_overflow=False)
                audio = np.frombuffer(data, dtype=np.float32)
                
                # Convert stereo to mono
                if channels > 1:
                    audio = audio.reshape(-1, channels).mean(axis=1)
                
                # Resample to 16kHz if needed
                if src_sr != TARGET_SR:
                    resampled = resample_linear(audio, src_sr, TARGET_SR)
                else:
                    resampled = audio
                
                # Add to buffer
                audio_buffer = np.concatenate([audio_buffer, resampled])
                
                # Send in consistent chunks to avoid gaps
                while len(audio_buffer) >= min_send_samples:
                    # Extract chunk
                    chunk = audio_buffer[:min_send_samples]
                    audio_buffer = audio_buffer[min_send_samples:]
                    
                    # Convert to PCM16 format
                    pcm_data = (chunk * 32767).astype(np.int16).tobytes()
                    
                    # Send to Deepgram
                    if len(pcm_data) > 0 and connection:
                        try:
                            # Use the proper send method from Deepgram SDK
                            connection.send_media(pcm_data)  # type: ignore[attr-defined]
                            # Mark that real audio streaming has begun (stop keepalive)
                            if not audio_streaming_started.is_set():
                                audio_streaming_started.set()
                            # Log first few sends to verify it's working
                            if not hasattr(audio_capture_and_stream, 'send_count'):
                                audio_capture_and_stream.send_count = 0
                            audio_capture_and_stream.send_count += 1
                            if audio_capture_and_stream.send_count <= 5 or audio_capture_and_stream.send_count % 100 == 0:
                                debug_log(f"Sent {len(pcm_data)} bytes to Deepgram (count: {audio_capture_and_stream.send_count})")
                        except AttributeError as ae:
                            error_log(f"Connection.send_media() method not found: {ae}")
                            error_log(f"Connection type: {type(connection)}, methods: {dir(connection)}")
                            break
                        except Exception as e:
                            error_log(f"Failed to send audio to Deepgram: {e}")
                            break
                
            except Exception as e:
                debug_log(f"Audio capture error: {e}")
                break
        
        stream.stop_stream()
        stream.close()
        pa.terminate()
        
    except Exception as e:
        error_log(f"Audio capture error: {e}")

def main():
    """Main function with direct streaming"""
    global is_running, audio_device_info_global
    
    try:
        debug_log("Main function started")
        
        # PRE-INITIALIZE audio device BEFORE connecting to Deepgram
        debug_log("Pre-initializing audio device...")
        audio_device_info_global = preinitialize_audio_device()
        if not audio_device_info_global:
            error_log("Failed to pre-initialize audio device")
            return
        debug_log(f"Audio device ready: {audio_device_info_global['sample_rate']}Hz, {audio_device_info_global['channels']} channels")
        
        # Set running flag
        is_running = True
        
        # Initialize and stream with proper context management
        debug_log("Starting Deepgram connection and streaming...")
        initialize_deepgram_and_stream()
        
    except Exception as e:
        error_log(f"Main error: {type(e).__name__}: {e}")
        import traceback
        error_log(f"Main traceback: {traceback.format_exc()}")
    finally:
        is_running = False
        status_log("Deepgram transcription stopped")

def initialize_deepgram_and_stream():
    """Initialize Deepgram and start streaming in proper context"""
    global deepgram_client, connection, is_running, audio_device_info_global
    
    try:
        status_log(f"Initializing Deepgram with model: {DEEPGRAM_MODEL}")
        
        # Validate API key format
        if not DEEPGRAM_API_KEY or len(DEEPGRAM_API_KEY) < 32:
            error_log(f"Invalid Deepgram API key format. Length: {len(DEEPGRAM_API_KEY) if DEEPGRAM_API_KEY else 0}")
            raise Exception("Invalid Deepgram API key format")
        
        debug_log(f"API Key validated. Length: {len(DEEPGRAM_API_KEY)}, First 8 chars: {DEEPGRAM_API_KEY[:8]}...")
        
        # Test connectivity to Deepgram API
        try:
            import socket
            debug_log("Testing DNS resolution for api.deepgram.com...")
            ip = socket.gethostbyname("api.deepgram.com")
            debug_log(f"DNS resolution successful: api.deepgram.com -> {ip}")
            
            # Test TCP connectivity
            debug_log("Testing TCP connectivity to api.deepgram.com:443...")
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            result = sock.connect_ex((ip, 443))
            sock.close()
            if result == 0:
                debug_log("TCP connection to api.deepgram.com:443 successful")
            else:
                debug_log(f"TCP connection failed with error code: {result}")
        except Exception as test_error:
            debug_log(f"Connectivity test warning: {test_error}")
        
        # Create Deepgram client with proper configuration (keyword-only args)
        debug_log("Creating DeepgramClient...")
        deepgram_client = DeepgramClient(api_key=DEEPGRAM_API_KEY)
        debug_log("DeepgramClient created successfully")
        
        # Create WebSocket connection using SDK v5 connect interface
        # Keep the context open by manually entering the context manager
        debug_log(f"Creating WebSocket connection with params: model={DEEPGRAM_MODEL}, sample_rate={TARGET_SR}")
        
        # Log the exact parameters being sent
        # Note: Using only valid Deepgram streaming API parameters
        connection_params = {
            "model": DEEPGRAM_MODEL,
            "language": "en-US",
            "encoding": "linear16",
            "sample_rate": TARGET_SR,
            "channels": 1,
            "interim_results": True,
            "smart_format": True,
            "vad_events": True,  # Voice Activity Detection events
        }
        debug_log(f"Connection params types: {[(k, type(v).__name__, v) for k, v in connection_params.items()]}")
        
        try:
            # Configure SSL context with proper timeout and settings
            import ssl
            import websockets.sync.client as ws_client
            
            # Create SSL context with better compatibility
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = True
            ssl_context.verify_mode = ssl.CERT_REQUIRED
            
            # Set socket default timeout globally for SSL operations
            import socket as socket_module
            socket_module.setdefaulttimeout(30)  # 30 second timeout
            
            # Monkey-patch to add SSL context and timeout
            original_connect = ws_client.connect
            def logged_connect(uri, *args, **kwargs):
                debug_log(f"WebSocket URI being requested: {uri}")
                debug_log(f"WebSocket headers: {kwargs.get('additional_headers', {})}")
                # Add SSL context and increase timeout
                kwargs['ssl'] = ssl_context
                kwargs['open_timeout'] = 30  # 30 second timeout for SSL handshake
                kwargs['close_timeout'] = 10
                debug_log(f"SSL context configured with timeout=30s")
                return original_connect(uri, *args, **kwargs)
            ws_client.connect = logged_connect
            
            # Use WITH statement for proper context management
            debug_log("Opening Deepgram connection with proper context...")
            with deepgram_client.listen.v1.connect(**connection_params) as ws_connection:
                debug_log("Connection established via WITH statement")
                
                # Store connection globally for audio streaming
                global connection
                connection = ws_connection
                debug_log(f"Connection stored globally: type={type(connection)}")
                
                # Define event handlers
                def on_open(_):
                    status_log("Deepgram connection opened")
                    global connection_ready
                    connection_ready.set()
                    with stdout_lock:
                        print(json.dumps({"type": "ready", "model": f"deepgram-{DEEPGRAM_MODEL}", "engine": "deepgram"}), flush=True)
                
                def handle_transcript(result):
                    try:
                        # Skip if this is a metadata event, not a transcript
                        if not hasattr(result, 'channel') or not hasattr(result.channel, 'alternatives'):
                            return
                        
                        sentence = result.channel.alternatives[0].transcript
                        if len(sentence) == 0:
                            return
                        
                        confidence = getattr(result.channel.alternatives[0], 'confidence', 0.9)
                        is_final = hasattr(result, 'is_final') and result.is_final
                        speech_final = hasattr(result, 'speech_final') and result.speech_final
                        
                        # Send ALL transcripts (interim and final) - let frontend handle accumulation
                        clean_text = sentence.strip()
                        if clean_text:  # Only send non-empty transcripts
                            transcription_log(clean_text, confidence)
                            # Reduce debug spam - only log final transcripts
                            if is_final or speech_final:
                                debug_log(f"Final: {clean_text[:50]}...")
                        
                    except Exception as e:
                        error_log(f"Error processing transcript: {e}")
                
                def on_error(error):
                    error_log(f"Deepgram error type: {type(error).__name__}")
                    error_log(f"Deepgram error: {error}")
                    # Log additional error attributes if available
                    if hasattr(error, 'args'):
                        error_log(f"Error args: {error.args}")
                    if hasattr(error, '__dict__'):
                        error_log(f"Error attributes: {error.__dict__}")
                
                def on_close(_):
                    status_log("Deepgram connection closed")
                
                # Register event handlers (SDK v5 EventType)
                connection.on(EventType.OPEN, on_open)
                connection.on(EventType.MESSAGE, handle_transcript)
                connection.on(EventType.ERROR, on_error)
                connection.on(EventType.CLOSE, on_close)
                
                # Start the listener in a background thread so we can stream audio concurrently
                debug_log("Starting listener thread...")
                listener_thread = threading.Thread(target=connection.start_listening, daemon=True)
                listener_thread.start()
                debug_log("Listener thread started")
                
                # Wait for connection to open before proceeding
                debug_log("Waiting for WebSocket connection to open...")
                if not connection_ready.wait(timeout=5):
                    error_log("Timeout waiting for WebSocket to open")
                    return
                debug_log("WebSocket connection confirmed ready")
                
                status_log("Deepgram connection initialized successfully (v1.connect)")
                
                # Start keepalive to hold socket open until real audio begins
                try:
                    global keepalive_thread
                    keepalive_thread = threading.Thread(target=keepalive_loop, daemon=True)
                    keepalive_thread.start()
                except Exception as _:
                    pass

                # START AUDIO STREAMING IN BACKGROUND THREAD
                # This way the with block stays open until user stops
                debug_log("Starting audio capture thread...")
                audio_thread = threading.Thread(
                    target=audio_capture_and_stream,
                    args=(audio_device_info_global,),
                    daemon=True
                )
                audio_thread.start()
                debug_log("Audio streaming thread started")
                
                # KEEP THE WITH BLOCK OPEN until is_running becomes False
                # This keeps the WebSocket connection alive
                debug_log("Connection open - waiting for user to stop...")
                while is_running:
                    time.sleep(0.5)
                
                debug_log("User stopped - closing connection...")
        
        except Exception as e:
            error_log(f"Failed to initialize Deepgram: {type(e).__name__}: {str(e)}")
            import traceback
            error_log(f"Full traceback: {traceback.format_exc()}")
            sys.exit(1)
    
    except Exception as e:
        error_log(f"Outer error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        status_log("Transcription stopped by user")
    except Exception as e:
        error_log(f"Fatal error: {e}")
        sys.exit(1)

import sys
import json
import base64
import io
import os
import time
import numpy as np
import tempfile
import wave
from pathlib import Path

try:
    import moonshine_onnx
except ImportError:
    print(json.dumps({"type": "error", "error": "moonshine_onnx not installed. Run: pip install git+https://github.com/moonshine-ai/moonshine.git#subdirectory=moonshine-onnx"}))
    sys.exit(1)

# Config
MODEL_NAME = os.environ.get("MOONSHINE_MODEL", "moonshine/base")
SAMPLE_RATE = 16000  # Moonshine expects 16kHz

# Notify ready
print(json.dumps({"type": "ready", "model": MODEL_NAME}))
sys.stdout.flush()

def read_stdin_line_blocking():
    """Read a single line from stdin. If stdin is closed/empty, wait and retry to keep the process alive."""
    line = sys.stdin.readline()
    if not line:
        # No data available (EOF or not yet connected). Sleep briefly and indicate no line.
        time.sleep(0.1)
        return None
    return line.strip()

def decode_wav_base64(b64: str):
    """Decode base64 WAV data and convert to format expected by Moonshine"""
    try:
        data = base64.b64decode(b64)
        
        # Check if it's a WAV file with header
        if len(data) >= 44 and data[:4] == b'RIFF' and data[8:12] == b'WAVE':
            # Create temporary WAV file for moonshine_onnx
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                tmp_file.write(data)
                tmp_path = tmp_file.name
            return tmp_path
        else:
            # Raw PCM data - convert to WAV format
            try:
                # Assume 16-bit PCM, convert to float32 and normalize
                if len(data) % 2 != 0:
                    data = data[:-1]  # Remove odd byte
                
                audio_int16 = np.frombuffer(data, dtype=np.int16)
                audio_float32 = audio_int16.astype(np.float32) / 32768.0
                
                # Create WAV file
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                    with wave.open(tmp_file.name, 'wb') as wav_file:
                        wav_file.setnchannels(1)  # Mono
                        wav_file.setsampwidth(2)  # 16-bit
                        wav_file.setframerate(SAMPLE_RATE)
                        wav_file.writeframes(audio_int16.tobytes())
                    tmp_path = tmp_file.name
                return tmp_path
            except Exception as e:
                print(json.dumps({"type": "error", "error": f"PCM conversion failed: {e}"}))
                return None
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Base64 decode failed: {e}"}))
        return None

def cleanup_temp_file(file_path):
    """Clean up temporary file"""
    try:
        if file_path and os.path.exists(file_path):
            os.unlink(file_path)
    except:
        pass

def transcribe_audio(audio_path: str):
    """Transcribe audio using Moonshine"""
    try:
        # Use moonshine_onnx for transcription
        result = moonshine_onnx.transcribe(audio_path, MODEL_NAME)
        
        if isinstance(result, list) and len(result) > 0:
            # Moonshine returns a list of transcriptions
            text = " ".join(result).strip()
            
            # For now, we don't have word-level timestamps from moonshine_onnx
            # This is a limitation compared to Whisper, but the speed improvement is significant
            words = []
            if text:
                # Create simple word objects without timestamps for compatibility
                word_list = text.split()
                words = [{"word": word, "start": 0.0, "end": 0.0} for word in word_list]
            
            return {
                "text": text,
                "words": words
            }
        else:
            return {"text": "", "words": []}
            
    except Exception as e:
        raise Exception(f"Moonshine transcription failed: {e}")

"""Main processing loop
Keep the process alive even if stdin is not yet connected or closes unexpectedly by polling with sleep.
"""
while True:
    raw = read_stdin_line_blocking()
    if raw is None:
        continue
    try:
        msg = json.loads(raw)
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Invalid JSON: {e}"}))
        sys.stdout.flush()
        continue

    mtype = msg.get("type")
    if mtype == "shutdown":
        break
    if mtype == "keepalive":
        # No-op to keep stdin active
        continue

    if mtype == "transcribe":
        uid = msg.get("id", "")
        b64 = msg.get("audio_base64")
        
        if not b64:
            print(json.dumps({"type": "error", "id": uid, "error": "Missing audio_base64"}))
            sys.stdout.flush()
            continue

        audio_path = None
        try:
            # Decode base64 to temporary WAV file
            audio_path = decode_wav_base64(b64)
            if not audio_path:
                print(json.dumps({"type": "result", "id": uid, "text": "", "words": []}))
                sys.stdout.flush()
                continue

            # Transcribe with Moonshine
            result = transcribe_audio(audio_path)
            
            output = {
                "type": "result",
                "id": uid,
                "text": result["text"],
                "words": result["words"]
            }
            
            print(json.dumps(output))
            sys.stdout.flush()
            
        except Exception as e:
            print(json.dumps({"type": "error", "id": uid, "error": str(e)}))
            sys.stdout.flush()
        finally:
            # Always cleanup temporary file
            cleanup_temp_file(audio_path)

# Graceful shutdown
sys.exit(0)

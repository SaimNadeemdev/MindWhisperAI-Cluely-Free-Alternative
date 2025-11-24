import pyaudiowpatch as pyaudio
import json
import time
import numpy as np

def test_loopback_capture():
    pa = pyaudio.PyAudio()
    
    # Find WASAPI loopback device
    wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
    default_output_device = pa.get_device_info_by_index(wasapi_info['defaultOutputDevice'])
    default_output_name = default_output_device['name']
    
    print(f"Default output device: {default_output_name}")
    
    # Find corresponding loopback device
    loopback_index = None
    for i in range(pa.get_device_count()):
        di = pa.get_device_info_by_index(i)
        if (di.get('isLoopbackDevice', False) and 
            di.get('hostApi') == wasapi_info['index'] and
            default_output_name in di['name']):
            loopback_index = i
            print(f"Found matching loopback device: {di['name']} (Index: {i})")
            break
    
    if loopback_index is None:
        print("No matching loopback device found!")
        pa.terminate()
        return
    
    # Test audio capture
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
    
    print(f"Starting audio capture from device {loopback_index}...")
    print("Play some audio (YouTube video) and watch for audio level detection...")
    
    try:
        for i in range(50):  # Test for 5 seconds
            data = stream.read(1024, exception_on_overflow=False)
            audio = np.frombuffer(data, dtype=np.float32)
            
            # Calculate RMS (volume level)
            rms = np.sqrt(np.mean(audio**2))
            
            if rms > 0.001:  # If there's audio above noise floor
                print(f"Audio detected! RMS: {rms:.6f}")
            else:
                print(f"Silence... RMS: {rms:.6f}")
            
            time.sleep(0.1)
            
    except KeyboardInterrupt:
        print("Stopped by user")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()

if __name__ == "__main__":
    test_loopback_capture()

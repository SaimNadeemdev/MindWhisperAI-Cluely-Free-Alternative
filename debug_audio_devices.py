import pyaudiowpatch as pyaudio
import json

def debug_audio_devices():
    pa = pyaudio.PyAudio()
    
    print("=== Audio Device Debug Information ===\n")
    
    # Get WASAPI host API info
    try:
        wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
        print(f"WASAPI Host API Index: {wasapi_info['index']}")
        print(f"WASAPI Default Input Device: {wasapi_info.get('defaultInputDevice', 'None')}")
        print(f"WASAPI Default Output Device: {wasapi_info.get('defaultOutputDevice', 'None')}")
        print(f"WASAPI Device Count: {wasapi_info.get('deviceCount', 0)}")
        print()
    except Exception as e:
        print(f"ERROR: WASAPI not available: {e}")
        pa.terminate()
        return
    
    # List all audio devices
    print("=== All Audio Devices ===")
    device_count = pa.get_device_count()
    loopback_devices = []
    
    for i in range(device_count):
        try:
            device_info = pa.get_device_info_by_index(i)
            host_api_info = pa.get_host_api_info_by_index(device_info['hostApi'])
            
            is_loopback = device_info.get('isLoopbackDevice', False)
            is_wasapi = host_api_info['type'] == pyaudio.paWASAPI
            
            print(f"Device {i}: {device_info['name']}")
            print(f"  Host API: {host_api_info['name']} (Type: {host_api_info['type']})")
            print(f"  Max Input Channels: {device_info['maxInputChannels']}")
            print(f"  Max Output Channels: {device_info['maxOutputChannels']}")
            print(f"  Default Sample Rate: {device_info['defaultSampleRate']}")
            print(f"  Is Loopback Device: {is_loopback}")
            print(f"  Is WASAPI: {is_wasapi}")
            
            if is_loopback and is_wasapi:
                loopback_devices.append(i)
                print(f"  *** LOOPBACK DEVICE FOUND ***")
            print()
            
        except Exception as e:
            print(f"Device {i}: ERROR - {e}")
            print()
    
    print("=== Loopback Device Summary ===")
    if loopback_devices:
        print(f"Found {len(loopback_devices)} WASAPI loopback devices:")
        for idx in loopback_devices:
            device_info = pa.get_device_info_by_index(idx)
            print(f"  Device {idx}: {device_info['name']}")
    else:
        print("NO WASAPI loopback devices found!")
        print("\nTroubleshooting:")
        print("1. Enable 'Stereo Mix' in Windows Sound settings")
        print("2. Check if Windows audio is working")
        print("3. Try running as administrator")
    
    # Test default output device
    if wasapi_info.get('defaultOutputDevice', -1) != -1:
        try:
            default_out = pa.get_device_info_by_index(wasapi_info['defaultOutputDevice'])
            print(f"\nDefault Output Device: {default_out['name']}")
            print(f"Channels: {default_out['maxOutputChannels']}")
            print(f"Sample Rate: {default_out['defaultSampleRate']}")
        except Exception as e:
            print(f"Error getting default output device: {e}")
    
    pa.terminate()

if __name__ == "__main__":
    debug_audio_devices()

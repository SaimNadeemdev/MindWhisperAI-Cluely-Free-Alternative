#!/usr/bin/env python3
"""
Standalone test script to debug Whisper model loading issues
Run this to test each model combination independently
"""

import os
import sys
import json
import numpy as np

# Test each model combination
models_to_test = [
    ("base", "openai"),
    ("base", "faster"),
    ("small", "openai"), 
    ("small", "faster"),
    ("medium", "openai"),
    ("medium", "faster"),
    ("large-v3", "openai"),
    ("large-v3", "faster")
]

def get_optimal_device():
    """Detect the best available device for Whisper inference"""
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
            print(f"   🚀 CUDA detected: {torch.cuda.get_device_name(0)}")
        else:
            device = "cpu"
            compute_type = "int8"
            print("   💻 CUDA not available, using CPU")
        return device, compute_type
    except ImportError:
        print("   ⚠️  PyTorch not available, defaulting to CPU")
        return "cpu", "int8"

def test_model(model_name, engine):
    print(f"\n{'='*50}")
    print(f"Testing {engine} Whisper model: {model_name}")
    print(f"{'='*50}")
    
    device, compute_type = get_optimal_device()
    
    try:
        if engine == "faster":
            from faster_whisper import WhisperModel
            print(f"Loading faster-whisper {model_name} on {device.upper()}...")
            
            try:
                model = WhisperModel(model_name, device=device, compute_type=compute_type)
                actual_device = device
            except Exception as gpu_error:
                if device == "cuda":
                    print(f"   ⚠️  GPU loading failed, falling back to CPU: {gpu_error}")
                    model = WhisperModel(model_name, device="cpu", compute_type="int8")
                    actual_device = "cpu"
                else:
                    raise gpu_error
            
            # Test transcription
            print("Testing transcription...")
            test_audio = np.zeros(16000, dtype=np.float32)
            segments, info = model.transcribe(test_audio, language="en")
            
            print(f"✅ SUCCESS: faster-whisper {model_name} loaded and tested successfully on {actual_device.upper()}")
            print(f"   Language detected: {info.language}")
            print(f"   Device used: {actual_device}")
            return True
            
        else:
            import whisper
            print(f"Loading OpenAI Whisper {model_name} on {device.upper()}...")
            model = whisper.load_model(model_name, device=device)
            
            # Test transcription
            print("Testing transcription...")
            test_audio = np.zeros(16000, dtype=np.float32)
            fp16_enabled = device == "cuda"
            result = model.transcribe(test_audio, language="en", fp16=fp16_enabled)
            
            print(f"✅ SUCCESS: OpenAI Whisper {model_name} loaded and tested successfully on {device.upper()}")
            print(f"   Language detected: {result.get('language', 'unknown')}")
            print(f"   Device used: {device}")
            print(f"   FP16 enabled: {fp16_enabled}")
            return True
            
    except Exception as e:
        print(f"❌ FAILED: {engine} Whisper {model_name}")
        print(f"   Error: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Full details: {repr(e)}")
        return False

def main():
    print("Whisper Model Compatibility Test")
    print("This will test all model combinations to identify issues")
    
    # Check if required packages are installed
    try:
        import whisper
        print("✅ OpenAI Whisper installed")
    except ImportError:
        print("❌ OpenAI Whisper not installed")
        
    try:
        from faster_whisper import WhisperModel
        print("✅ faster-whisper installed")
    except ImportError:
        print("❌ faster-whisper not installed")
    
    results = {}
    
    for model_name, engine in models_to_test:
        success = test_model(model_name, engine)
        results[f"{engine}-{model_name}"] = success
    
    print(f"\n{'='*50}")
    print("SUMMARY RESULTS")
    print(f"{'='*50}")
    
    for combo, success in results.items():
        status = "✅ WORKS" if success else "❌ FAILS"
        print(f"{combo:20} {status}")
    
    working_models = [combo for combo, success in results.items() if success]
    print(f"\nWorking models: {len(working_models)}/{len(models_to_test)}")
    
    if working_models:
        print("✅ Working combinations:")
        for combo in working_models:
            print(f"   - {combo}")
    
    failed_models = [combo for combo, success in results.items() if not success]
    if failed_models:
        print("❌ Failed combinations:")
        for combo in failed_models:
            print(f"   - {combo}")

if __name__ == "__main__":
    main()

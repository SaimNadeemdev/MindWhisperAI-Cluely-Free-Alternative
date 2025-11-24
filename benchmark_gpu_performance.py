#!/usr/bin/env python3
"""
Performance benchmark script to compare CPU vs GPU Whisper performance
"""

import time
import numpy as np
import json

def benchmark_model(model_name, engine, device, compute_type=None):
    """Benchmark a specific model configuration"""
    print(f"\n🔥 Benchmarking {engine} {model_name} on {device.upper()}")
    print("="*60)
    
    try:
        # Load model
        start_time = time.time()
        
        if engine == "faster":
            from faster_whisper import WhisperModel
            if compute_type is None:
                compute_type = "float16" if device == "cuda" else "int8"
            model = WhisperModel(model_name, device=device, compute_type=compute_type)
        else:
            import whisper
            model = whisper.load_model(model_name, device=device)
        
        load_time = time.time() - start_time
        print(f"⏱️  Model loading time: {load_time:.2f}s")
        
        # Create test audio (10 seconds of random noise to simulate real audio)
        test_audio = np.random.normal(0, 0.1, 16000 * 10).astype(np.float32)
        
        # Warm-up run (GPU needs this)
        if engine == "faster":
            segments, info = model.transcribe(test_audio[:16000], language="en")
        else:
            fp16_enabled = device == "cuda"
            result = model.transcribe(test_audio[:16000], language="en", fp16=fp16_enabled)
        
        # Actual benchmark runs
        times = []
        for i in range(3):
            print(f"  Run {i+1}/3...", end=" ")
            start_time = time.time()
            
            if engine == "faster":
                segments, info = model.transcribe(test_audio, language="en")
            else:
                fp16_enabled = device == "cuda"
                result = model.transcribe(test_audio, language="en", fp16=fp16_enabled)
            
            transcribe_time = time.time() - start_time
            times.append(transcribe_time)
            print(f"{transcribe_time:.2f}s")
        
        avg_time = sum(times) / len(times)
        min_time = min(times)
        
        print(f"📊 Results:")
        print(f"   Average time: {avg_time:.2f}s")
        print(f"   Best time: {min_time:.2f}s")
        print(f"   Audio length: 10.0s")
        print(f"   Real-time factor: {avg_time/10.0:.2f}x")
        
        return {
            "model": f"{engine}-{model_name}",
            "device": device,
            "load_time": load_time,
            "avg_transcribe_time": avg_time,
            "min_transcribe_time": min_time,
            "real_time_factor": avg_time/10.0
        }
        
    except Exception as e:
        print(f"❌ Failed: {e}")
        return None

def main():
    print("🚀 Whisper GPU vs CPU Performance Benchmark")
    print("This will test the same models on both CPU and GPU")
    print("="*60)
    
    # Test configurations
    test_configs = [
        ("base", "faster"),
        ("medium", "faster"),
        ("base", "openai"),
        ("medium", "openai")
    ]
    
    results = []
    
    for model_name, engine in test_configs:
        # Test on GPU
        gpu_result = benchmark_model(model_name, engine, "cuda")
        if gpu_result:
            results.append(gpu_result)
        
        # Test on CPU
        cpu_result = benchmark_model(model_name, engine, "cpu")
        if cpu_result:
            results.append(cpu_result)
    
    # Summary
    print(f"\n{'='*60}")
    print("📈 PERFORMANCE SUMMARY")
    print(f"{'='*60}")
    
    print(f"{'Model':<20} {'Device':<6} {'Load Time':<10} {'Transcribe':<10} {'RT Factor':<10}")
    print("-" * 60)
    
    for result in results:
        print(f"{result['model']:<20} {result['device'].upper():<6} "
              f"{result['load_time']:.2f}s{'':<4} {result['avg_transcribe_time']:.2f}s{'':<4} "
              f"{result['real_time_factor']:.2f}x")
    
    # Calculate speedups
    print(f"\n🚀 GPU SPEEDUP ANALYSIS:")
    gpu_results = {r['model']: r for r in results if r['device'] == 'cuda'}
    cpu_results = {r['model']: r for r in results if r['device'] == 'cpu'}
    
    for model in gpu_results:
        if model in cpu_results:
            speedup = cpu_results[model]['avg_transcribe_time'] / gpu_results[model]['avg_transcribe_time']
            print(f"   {model}: {speedup:.1f}x faster on GPU")

if __name__ == "__main__":
    main()

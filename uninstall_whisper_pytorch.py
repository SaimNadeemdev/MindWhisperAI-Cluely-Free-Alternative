#!/usr/bin/env python3
"""
Whisper and PyTorch Uninstall Script for MindWhisper AI
This script removes all Whisper and PyTorch related packages to free up space
and avoid conflicts when using only Deepgram transcription.

Usage:
    python uninstall_whisper_pytorch.py
    
Or with confirmation prompts:
    python uninstall_whisper_pytorch.py --interactive
"""

import subprocess
import sys
import argparse
import json
from typing import List, Set

# Comprehensive list of Whisper and PyTorch related packages
WHISPER_PACKAGES = [
    # OpenAI Whisper
    "openai-whisper",
    "whisper",
    
    # Faster Whisper
    "faster-whisper",
    "ctranslate2",
    
    # Whisper variants and related
    "whisper-timestamped",
    "stable-ts",
    "whisperx",
    "insanely-fast-whisper",
]

PYTORCH_PACKAGES = [
    # Core PyTorch
    "torch",
    "torchvision", 
    "torchaudio",
    "pytorch",
    
    # PyTorch ecosystem
    "torchtext",
    "torchdata",
    "pytorch-lightning",
    "lightning",
    "pytorch-ignite",
    "ignite",
    
    # CUDA versions
    "torch-audio",
    "torch-vision",
]

# Additional ML/AI packages that might be unused
OPTIONAL_ML_PACKAGES = [
    # Transformers ecosystem
    "transformers",
    "tokenizers",
    "datasets",
    "accelerate",
    "safetensors",
    
    # Other ML frameworks
    "tensorflow",
    "tensorflow-gpu",
    "keras",
    "jax",
    "jaxlib",
    
    # Audio processing (heavy)
    "librosa",
    "soundfile",
    "audioread",
    "resampy",
    
    # Computer vision
    "opencv-python",
    "opencv-contrib-python",
    "pillow-simd",
    
    # Scientific computing (large)
    "scikit-learn",
    "pandas",
    "matplotlib",
    "seaborn",
]

def run_command(cmd: List[str], capture_output: bool = True) -> tuple:
    """Run a command and return success status and output"""
    try:
        result = subprocess.run(
            cmd, 
            capture_output=capture_output, 
            text=True, 
            check=False
        )
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

def get_installed_packages() -> Set[str]:
    """Get list of currently installed packages"""
    success, stdout, stderr = run_command([sys.executable, "-m", "pip", "list", "--format=json"])
    
    if not success:
        print(f"❌ Failed to get package list: {stderr}")
        return set()
    
    try:
        packages = json.loads(stdout)
        return {pkg["name"].lower() for pkg in packages}
    except json.JSONDecodeError:
        print("❌ Failed to parse package list")
        return set()

def uninstall_packages(packages: List[str], category: str, interactive: bool = False) -> int:
    """Uninstall a list of packages"""
    installed = get_installed_packages()
    to_uninstall = [pkg for pkg in packages if pkg.lower() in installed]
    
    if not to_uninstall:
        print(f"✅ No {category} packages found to uninstall")
        return 0
    
    print(f"\n📦 Found {category} packages to uninstall:")
    for pkg in to_uninstall:
        print(f"   - {pkg}")
    
    if interactive:
        response = input(f"\nUninstall {len(to_uninstall)} {category} packages? (y/N): ")
        if response.lower() not in ['y', 'yes']:
            print(f"⏭️  Skipping {category} packages")
            return 0
    
    print(f"\n🗑️  Uninstalling {category} packages...")
    
    # Uninstall packages one by one for better error handling
    failed_count = 0
    for pkg in to_uninstall:
        print(f"   Removing {pkg}...", end=" ")
        success, stdout, stderr = run_command([
            sys.executable, "-m", "pip", "uninstall", pkg, "-y"
        ])
        
        if success:
            print("✅")
        else:
            print("❌")
            print(f"      Error: {stderr.strip()}")
            failed_count += 1
    
    successful = len(to_uninstall) - failed_count
    print(f"\n📊 {category} Results: {successful}/{len(to_uninstall)} packages removed")
    return failed_count

def clean_pip_cache():
    """Clean pip cache to free up space"""
    print("\n🧹 Cleaning pip cache...")
    success, stdout, stderr = run_command([sys.executable, "-m", "pip", "cache", "purge"])
    
    if success:
        print("✅ Pip cache cleaned")
    else:
        print(f"❌ Failed to clean pip cache: {stderr}")

def check_space_freed():
    """Estimate space that will be freed"""
    print("\n💾 Estimating space usage...")
    
    # Get package sizes (approximate)
    installed = get_installed_packages()
    
    # Rough size estimates in MB
    size_estimates = {
        "torch": 2000,
        "torchvision": 500,
        "torchaudio": 300,
        "transformers": 200,
        "tensorflow": 1500,
        "opencv-python": 150,
        "librosa": 100,
        "whisper": 50,
        "faster-whisper": 30,
        "ctranslate2": 100,
    }
    
    total_size = 0
    packages_found = []
    
    for pkg in WHISPER_PACKAGES + PYTORCH_PACKAGES:
        if pkg.lower() in installed:
            size = size_estimates.get(pkg.lower(), 10)  # Default 10MB
            total_size += size
            packages_found.append(f"{pkg} (~{size}MB)")
    
    if packages_found:
        print(f"📦 Packages that will be removed:")
        for pkg in packages_found:
            print(f"   - {pkg}")
        print(f"\n💾 Estimated space to be freed: ~{total_size}MB ({total_size/1024:.1f}GB)")
    else:
        print("✅ No target packages found installed")

def main():
    parser = argparse.ArgumentParser(description="Uninstall Whisper and PyTorch packages")
    parser.add_argument("--interactive", "-i", action="store_true", 
                       help="Ask for confirmation before each category")
    parser.add_argument("--include-optional", action="store_true",
                       help="Also remove optional ML packages")
    parser.add_argument("--dry-run", action="store_true",
                       help="Show what would be removed without actually removing")
    
    args = parser.parse_args()
    
    print("🚀 MindWhisper AI - Whisper & PyTorch Uninstaller")
    print("=" * 50)
    
    if args.dry_run:
        print("🔍 DRY RUN MODE - No packages will be actually removed")
        check_space_freed()
        return
    
    # Check current environment
    check_space_freed()
    
    if args.interactive:
        response = input("\nProceed with uninstallation? (y/N): ")
        if response.lower() not in ['y', 'yes']:
            print("❌ Uninstallation cancelled")
            return
    
    total_failures = 0
    
    # Uninstall Whisper packages
    total_failures += uninstall_packages(
        WHISPER_PACKAGES, 
        "Whisper", 
        args.interactive
    )
    
    # Uninstall PyTorch packages
    total_failures += uninstall_packages(
        PYTORCH_PACKAGES, 
        "PyTorch", 
        args.interactive
    )
    
    # Optionally uninstall other ML packages
    if args.include_optional:
        total_failures += uninstall_packages(
            OPTIONAL_ML_PACKAGES, 
            "Optional ML", 
            args.interactive
        )
    
    # Clean up
    clean_pip_cache()
    
    # Final summary
    print("\n" + "=" * 50)
    print("🎉 UNINSTALLATION COMPLETE")
    print("=" * 50)
    
    if total_failures == 0:
        print("✅ All packages removed successfully!")
        print("🔧 Your MindWhisper AI is now optimized for Deepgram-only usage")
        print("\n📝 Note: You can still use all Deepgram transcription features")
        print("   The app will work exactly the same with Deepgram transcription")
    else:
        print(f"⚠️  {total_failures} packages failed to uninstall")
        print("   You may need to remove them manually or run as administrator")
    
    print("\n🚀 Restart your MindWhisper AI application to see the changes")

if __name__ == "__main__":
    main()

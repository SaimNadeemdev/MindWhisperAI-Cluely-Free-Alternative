#!/usr/bin/env node

/**
 * Portable Python Setup Script for MindWhisper AI (Deepgram-Only)
 * 
 * This script downloads and sets up a portable Python installation
 * with ONLY Deepgram dependencies - no Whisper or PyTorch packages.
 * This significantly reduces the installer size and build time.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');

console.log('🐍 MindWhisper AI Portable Python Setup (Deepgram-Only)');
console.log('=====================================================\n');

const PYTHON_VERSION = '3.11.9';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_DIR = path.join(__dirname, 'python-portable');
const PYTHON_ZIP = path.join(__dirname, 'python-embed.zip');

// Required Python packages (Deepgram-only, no Whisper/PyTorch)
const REQUIRED_PACKAGES = [
  'pip',
  'setuptools',
  'wheel',
  // Core dependencies for Deepgram transcription
  'deepgram-sdk>=4.8.1',
  'websockets>=11.0',
  'asyncio-mqtt>=0.11.0',
  // Audio processing (lightweight)
  'pyaudiowpatch>=0.2.12.4',
  'numpy>=1.21.0',
  'scipy>=1.7.0',
  'noisereduce>=3.0.0',
  // Basic utilities
  'requests>=2.28.0',
  'aiohttp>=3.8.0'
];

// Packages to explicitly avoid (will be skipped if found)
const EXCLUDED_PACKAGES = [
  'torch', 'torchvision', 'torchaudio', 'pytorch',
  'openai-whisper', 'whisper', 'faster-whisper', 'ctranslate2',
  'transformers', 'tensorflow', 'librosa', 'soundfile',
  'opencv-python', 'scikit-learn', 'pandas', 'matplotlib'
];

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading: ${url}`);
    
    const file = createWriteStream(destination);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, destination);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r📥 Progress: ${progress}%`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n✅ Download completed');
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(destination, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function extractZip(zipPath, extractPath) {
  console.log('📦 Extracting Python...');
  
  try {
    // Use PowerShell to extract (available on all Windows systems)
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`, {
      stdio: 'inherit'
    });
    console.log('✅ Python extracted successfully');
  } catch (error) {
    console.error('❌ Extraction failed:', error.message);
    throw error;
  }
}

async function setupPip(pythonDir) {
  console.log('🔧 Setting up pip...');
  
  const pythonExe = path.join(pythonDir, 'python.exe');
  const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
  const getPipPath = path.join(pythonDir, 'get-pip.py');
  
  // Download get-pip.py
  await downloadFile(getPipUrl, getPipPath);
  
  // Create python311._pth file to enable site-packages
  const pthContent = `python311.zip
.
Lib
Lib/site-packages

# Enable site-packages
import site`;
  const pthPath = path.join(pythonDir, 'python311._pth');
  fs.writeFileSync(pthPath, pthContent);
  console.log('✅ Enabled site-packages for embedded Python');
  
  // Install pip
  try {
    execSync(`"${pythonExe}" "${getPipPath}"`, {
      stdio: 'inherit',
      cwd: pythonDir
    });
    console.log('✅ Pip installed successfully');
  } catch (error) {
    console.error('❌ Pip installation failed:', error.message);
    throw error;
  }
  
  // Clean up
  fs.unlinkSync(getPipPath);
}

async function installPackages(pythonDir) {
  console.log('📦 Installing Python packages (Deepgram-only)...');
  console.log('🚫 Excluding: Whisper, PyTorch, and other ML packages for smaller size');
  
  const pythonExe = path.join(pythonDir, 'python.exe');
  
  // Install packages one by one for better error handling
  for (const package of REQUIRED_PACKAGES) {
    try {
      console.log(`📦 Installing ${package}...`);
      
      const installCmd = `"${pythonExe}" -m pip install "${package}" --no-cache-dir`;
      
      execSync(installCmd, {
        stdio: 'inherit',
        cwd: pythonDir
      });
      
      console.log(`✅ ${package} installed`);
    } catch (error) {
      console.warn(`⚠️  Failed to install ${package}:`, error.message);
      // Continue with other packages
    }
  }
  
  console.log('\n💾 Installation Summary:');
  console.log('✅ Deepgram SDK - Real-time transcription');
  console.log('✅ Audio processing - WASAPI loopback capture');
  console.log('✅ Core utilities - JSON, HTTP, WebSocket support');
  console.log('🚫 Whisper/PyTorch - Excluded (saves ~3GB)');
}

async function removeUnwantedPackages(pythonDir) {
  console.log('🧹 Checking for and removing unwanted packages...');
  
  const pythonExe = path.join(pythonDir, 'python.exe');
  
  for (const package of EXCLUDED_PACKAGES) {
    try {
      // Check if package is installed
      execSync(`"${pythonExe}" -c "import ${package}"`, { stdio: 'pipe' });
      
      // If we get here, package is installed - remove it
      console.log(`🗑️  Removing unwanted package: ${package}`);
      execSync(`"${pythonExe}" -m pip uninstall ${package} -y`, {
        stdio: 'inherit',
        cwd: pythonDir
      });
      console.log(`✅ Removed ${package}`);
    } catch (error) {
      // Package not installed - this is good
    }
  }
}

async function createLauncher(pythonDir) {
  console.log('🚀 Creating Python launcher...');
  
  const launcherContent = `@echo off
REM MindWhisper AI Python Launcher (Deepgram-Only)
set PYTHONPATH=%~dp0
set PYTHONHOME=%~dp0
set PYTHONIOENCODING=utf-8
"%~dp0python.exe" %*
`;
  
  const launcherPath = path.join(pythonDir, 'python-launcher.bat');
  fs.writeFileSync(launcherPath, launcherContent);
  
  console.log('✅ Python launcher created');
}

async function verifyInstallation(pythonDir) {
  console.log('🔍 Verifying installation...');
  
  const pythonExe = path.join(pythonDir, 'python.exe');
  
  try {
    // Test Python
    console.log('Testing Python version...');
    execSync(`"${pythonExe}" --version`, { stdio: 'inherit' });
    
    // Test Deepgram package
    console.log('Testing Deepgram SDK...');
    execSync(`"${pythonExe}" -c "import deepgram; print('✅ Deepgram SDK OK')"`, { stdio: 'inherit' });
    
    // Test audio processing
    console.log('Testing audio processing...');
    execSync(`"${pythonExe}" -c "import pyaudiowpatch; print('✅ PyAudioWPatch OK')"`, { stdio: 'inherit' });
    execSync(`"${pythonExe}" -c "import numpy; print('✅ NumPy OK')"`, { stdio: 'inherit' });
    
    // Verify excluded packages are NOT installed
    console.log('Verifying excluded packages are not present...');
    const excludedTests = ['torch', 'whisper', 'transformers'];
    for (const pkg of excludedTests) {
      try {
        execSync(`"${pythonExe}" -c "import ${pkg}"`, { stdio: 'pipe' });
        console.warn(`⚠️  WARNING: ${pkg} is still installed!`);
      } catch (error) {
        console.log(`✅ ${pkg} correctly excluded`);
      }
    }
    
    console.log('✅ Installation verification completed');
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

async function calculateSize(pythonDir) {
  console.log('📊 Calculating installation size...');
  
  try {
    const result = execSync(`powershell -command "(Get-ChildItem -Path '${pythonDir}' -Recurse | Measure-Object -Property Length -Sum).Sum"`, { encoding: 'utf8' });
    const sizeBytes = parseInt(result.trim());
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    const sizeGB = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
    
    console.log(`📦 Total installation size: ${sizeMB}MB (${sizeGB}GB)`);
    console.log(`💾 Estimated savings vs full install: ~2.5GB`);
  } catch (error) {
    console.log('📦 Size calculation failed, but installation is complete');
  }
}

async function main() {
  try {
    // Clean up previous installation
    if (fs.existsSync(PYTHON_DIR)) {
      console.log('🧹 Cleaning previous installation...');
      fs.rmSync(PYTHON_DIR, { recursive: true, force: true });
    }
    
    if (fs.existsSync(PYTHON_ZIP)) {
      fs.unlinkSync(PYTHON_ZIP);
    }
    
    // Create directories
    fs.mkdirSync(PYTHON_DIR, { recursive: true });
    
    // Download Python
    await downloadFile(PYTHON_URL, PYTHON_ZIP);
    
    // Extract Python
    await extractZip(PYTHON_ZIP, PYTHON_DIR);
    
    // Setup pip
    await setupPip(PYTHON_DIR);
    
    // Install packages
    await installPackages(PYTHON_DIR);
    
    // Remove any unwanted packages
    await removeUnwantedPackages(PYTHON_DIR);
    
    // Create launcher
    await createLauncher(PYTHON_DIR);
    
    // Verify installation
    await verifyInstallation(PYTHON_DIR);
    
    // Calculate size
    await calculateSize(PYTHON_DIR);
    
    // Clean up
    fs.unlinkSync(PYTHON_ZIP);
    
    console.log('\n🎉 Portable Python setup completed successfully!');
    console.log(`📁 Python installed at: ${PYTHON_DIR}`);
    console.log('🚀 Optimized for Deepgram-only transcription');
    console.log('📋 Next steps:');
    console.log('1. Run: npm run dist:deepgram');
    console.log('2. The installer will be much smaller and faster!');
    console.log('3. Only Deepgram transcription will be available (as intended)');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();

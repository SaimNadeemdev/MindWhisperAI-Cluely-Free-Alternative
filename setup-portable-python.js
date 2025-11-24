#!/usr/bin/env node

/**
 * Portable Python Setup Script for MindWhisper AI
 * 
 * This script downloads and sets up a portable Python installation
 * with all required dependencies for the app to work standalone.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createWriteStream } = require('fs');

console.log('🐍 MindWhisper AI Portable Python Setup');
console.log('=====================================\n');

const PYTHON_VERSION = '3.11.9';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_DIR = path.join(__dirname, 'python-portable');
const PYTHON_ZIP = path.join(__dirname, 'python-embed.zip');

// Required Python packages
const REQUIRED_PACKAGES = [
  'pip',
  'setuptools',
  'wheel',
  'openai-whisper',
  'faster-whisper', 
  'torch',
  'torchvision', 
  'torchaudio',
  'pyaudiowpatch',
  'scipy',
  'numpy',
  'noisereduce',
  'librosa',
  'soundfile',
  'deepgram-sdk',
  'websockets'
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
  console.log('📦 Installing Python packages...');
  
  const pythonExe = path.join(pythonDir, 'python.exe');
  
  // Install packages one by one for better error handling
  for (const package of REQUIRED_PACKAGES) {
    try {
      console.log(`📦 Installing ${package}...`);
      
      let installCmd = `"${pythonExe}" -m pip install ${package}`;
      
      // Special handling for PyTorch (CPU version for smaller size)
      if (['torch', 'torchvision', 'torchaudio'].includes(package)) {
        installCmd += ' --index-url https://download.pytorch.org/whl/cpu';
      }
      
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
}

async function createLauncher(pythonDir) {
  console.log('🚀 Creating Python launcher...');
  
  const launcherContent = `@echo off
set PYTHONPATH=%~dp0
set PYTHONHOME=%~dp0
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
    execSync(`"${pythonExe}" --version`, { stdio: 'inherit' });
    
    // Test key packages
    const testPackages = ['whisper', 'pyaudiowpatch', 'deepgram'];
    for (const pkg of testPackages) {
      try {
        execSync(`"${pythonExe}" -c "import ${pkg}; print('${pkg} OK')"`, { stdio: 'inherit' });
      } catch (error) {
        console.warn(`⚠️  ${pkg} import test failed`);
      }
    }
    
    console.log('✅ Installation verification completed');
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
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
    
    // Create launcher
    await createLauncher(PYTHON_DIR);
    
    // Verify installation
    await verifyInstallation(PYTHON_DIR);
    
    // Clean up
    fs.unlinkSync(PYTHON_ZIP);
    
    console.log('\n🎉 Portable Python setup completed successfully!');
    console.log(`📁 Python installed at: ${PYTHON_DIR}`);
    console.log('📋 Next steps:');
    console.log('1. Run: npm run dist');
    console.log('2. The installer will now be completely self-contained!');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();

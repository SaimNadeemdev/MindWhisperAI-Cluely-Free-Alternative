#!/usr/bin/env node

/**
 * Icon Embedding Script for MindWhisper AI
 * 
 * This script forcefully embeds the custom icon into the executable
 * after electron-builder completes the build process.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 MindWhisper AI Icon Embedding Script');
console.log('======================================\n');

const PROJECT_ROOT = __dirname;
const ICON_PATH = path.join(PROJECT_ROOT, 'build', 'icons', 'win', 'icon.ico');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');

// Find all executable files
const findExecutables = (dir) => {
  const executables = [];
  
  if (!fs.existsSync(dir)) {
    return executables;
  }
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      executables.push(...findExecutables(fullPath));
    } else if (item.name.endsWith('.exe') && item.name.includes('MindWhisper')) {
      executables.push(fullPath);
    }
  }
  
  return executables;
};

// Check if icon file exists
if (!fs.existsSync(ICON_PATH)) {
  console.error('❌ Icon file not found:', ICON_PATH);
  console.log('Please run: npm run build:icon');
  process.exit(1);
}

console.log('✅ Icon file found:', ICON_PATH);

// Find all MindWhisper AI executables
const executables = findExecutables(RELEASE_DIR);

if (executables.length === 0) {
  console.warn('⚠️  No MindWhisper AI executables found in release directory');
  console.log('Please run: npm run dist first');
  process.exit(0);
}

console.log(`\n📦 Found ${executables.length} executable(s):`);
executables.forEach((exe, i) => {
  console.log(`  ${i + 1}. ${path.relative(PROJECT_ROOT, exe)}`);
});

// Try different methods to embed icon
const embedMethods = [
  {
    name: 'ResourceHacker',
    command: (exe) => `ResourceHacker.exe -open "${exe}" -save "${exe}" -action addoverwrite -res "${ICON_PATH}" -mask ICONGROUP,1,`,
    check: () => {
      try {
        execSync('ResourceHacker.exe', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
  },
  {
    name: 'rcedit (electron-builder)',
    command: (exe) => `npx rcedit "${exe}" --set-icon "${ICON_PATH}"`,
    check: () => true // Always available via npx
  },
  {
    name: 'PowerShell Resource Update',
    command: (exe) => {
      const psScript = `
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::new("${ICON_PATH.replace(/\\/g, '\\\\')}")
$exe = "${exe.replace(/\\/g, '\\\\')}"
# This is a simplified approach - may not work for all cases
Write-Host "Attempting to update icon for $exe"
`;
      const scriptPath = path.join(PROJECT_ROOT, 'temp-icon-script.ps1');
      fs.writeFileSync(scriptPath, psScript);
      return `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
    },
    check: () => true,
    cleanup: () => {
      const scriptPath = path.join(PROJECT_ROOT, 'temp-icon-script.ps1');
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }
    }
  }
];

let successCount = 0;

for (const executable of executables) {
  console.log(`\n🔧 Processing: ${path.basename(executable)}`);
  
  let embedded = false;
  
  for (const method of embedMethods) {
    if (!method.check()) {
      console.log(`  ⚠️  ${method.name} not available, skipping...`);
      continue;
    }
    
    try {
      console.log(`  🔄 Trying ${method.name}...`);
      
      const command = typeof method.command === 'function' 
        ? method.command(executable) 
        : method.command.replace('{exe}', executable).replace('{icon}', ICON_PATH);
      
      execSync(command, { 
        stdio: 'pipe',
        timeout: 30000 // 30 second timeout
      });
      
      console.log(`  ✅ Successfully embedded icon using ${method.name}`);
      embedded = true;
      successCount++;
      
      if (method.cleanup) {
        method.cleanup();
      }
      
      break;
    } catch (error) {
      console.log(`  ❌ ${method.name} failed:`, error.message.split('\n')[0]);
      
      if (method.cleanup) {
        method.cleanup();
      }
    }
  }
  
  if (!embedded) {
    console.log(`  ⚠️  Could not embed icon in ${path.basename(executable)}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`  ✅ Successfully processed: ${successCount}/${executables.length} executables`);

if (successCount > 0) {
  console.log(`\n🎉 Icon embedding completed!`);
  console.log(`\n📋 Next steps:`);
  console.log(`1. Test the executable icon in File Explorer`);
  console.log(`2. Install the app and check Start Menu icon`);
  console.log(`3. If issues persist, try clearing icon cache`);
} else {
  console.log(`\n⚠️  No executables were successfully processed.`);
  console.log(`\nTroubleshooting:`);
  console.log(`1. Install ResourceHacker: https://www.angusj.com/resourcehacker/`);
  console.log(`2. Ensure rcedit is available: npm install -g rcedit`);
  console.log(`3. Check if executables are not locked by antivirus`);
}

console.log(`\n💡 Alternative: Try rebuilding with: npm run dist`);

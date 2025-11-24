#!/usr/bin/env node

/**
 * Fix Icons Script for MindWhisper AI
 * 
 * This script regenerates icons and verifies the build configuration
 * to ensure the app shows the correct custom icon instead of the default Electron icon.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 MindWhisper AI Icon Fix Script');
console.log('================================\n');

// Check if source logo exists
const logoPath = path.join(__dirname, 'logo mindwhisperai.png');
if (!fs.existsSync(logoPath)) {
  console.error('❌ Source logo not found: logo mindwhisperai.png');
  console.log('Please ensure the logo file exists in the project root.');
  process.exit(1);
}

console.log('✅ Source logo found');

// Clean old icons
const buildIconsDir = path.join(__dirname, 'build', 'icons', 'win');
const tmpIconsDir = path.join(__dirname, 'build', 'tmp-icons');

try {
  if (fs.existsSync(buildIconsDir)) {
    fs.rmSync(buildIconsDir, { recursive: true, force: true });
    console.log('🧹 Cleaned old icons');
  }
  if (fs.existsSync(tmpIconsDir)) {
    fs.rmSync(tmpIconsDir, { recursive: true, force: true });
    console.log('🧹 Cleaned temporary icons');
  }
} catch (error) {
  console.warn('⚠️  Warning: Could not clean old icons:', error.message);
}

// Regenerate icons
console.log('\n📦 Regenerating icons...');
try {
  execSync('npm run build:icon', { stdio: 'inherit' });
  console.log('✅ Icons regenerated successfully');
} catch (error) {
  console.error('❌ Failed to regenerate icons:', error.message);
  process.exit(1);
}

// Verify icon files
const requiredIcons = [
  'icon.ico',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-64.png',
  'icon-128.png',
  'icon-256.png'
];

console.log('\n🔍 Verifying generated icons...');
let allIconsPresent = true;

for (const iconFile of requiredIcons) {
  const iconPath = path.join(buildIconsDir, iconFile);
  if (fs.existsSync(iconPath)) {
    const stats = fs.statSync(iconPath);
    console.log(`✅ ${iconFile} (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    console.log(`❌ Missing: ${iconFile}`);
    allIconsPresent = false;
  }
}

if (!allIconsPresent) {
  console.error('\n❌ Some icons are missing. Please check the icon generation process.');
  process.exit(1);
}

// Verify package.json configuration
console.log('\n🔍 Verifying package.json configuration...');
const packagePath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const expectedConfig = {
  'build.directories.buildResources': 'build',
  'build.win.icon': 'build/icons/win/icon.ico',
  'build.nsis.installerIcon': 'build/icons/win/icon.ico',
  'build.nsis.uninstallerIcon': 'build/icons/win/icon.ico',
  'build.nsis.installerHeaderIcon': 'build/icons/win/icon.ico'
};

let configCorrect = true;
for (const [key, expectedValue] of Object.entries(expectedConfig)) {
  const keys = key.split('.');
  let current = packageJson;
  
  for (const k of keys) {
    current = current?.[k];
  }
  
  if (current === expectedValue) {
    console.log(`✅ ${key}: ${expectedValue}`);
  } else {
    console.log(`❌ ${key}: expected "${expectedValue}", got "${current}"`);
    configCorrect = false;
  }
}

if (!configCorrect) {
  console.error('\n❌ Package.json configuration needs fixing. Please check the build settings.');
  process.exit(1);
}

console.log('\n🎉 Icon fix completed successfully!');
console.log('\n📋 Next steps:');
console.log('1. Run: npm run dist');
console.log('2. Install the generated .exe file');
console.log('3. Install Python dependencies (see PYTHON_SETUP.md)');
console.log('4. Search for "MindWhisper AI" in Windows - it should show your custom icon');
console.log('\n⚠️  IMPORTANT: For transcription to work in installed version:');
console.log('- Install system Python with required packages (see PYTHON_SETUP.md)');
console.log('- The unpacked version works because it uses your dev environment');
console.log('- The installed version needs system Python dependencies');
console.log('\n💡 If the icon still doesn\'t appear:');
console.log('- Clear Windows icon cache: ie4uinit.exe -show');
console.log('- Restart Windows Explorer');
console.log('- Check the console logs during app startup for icon loading messages');

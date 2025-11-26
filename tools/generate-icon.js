/*
  Generate Windows .ico from a source image with a solid white background.
  - Input: ../logo mindwhisperai.png
  - Output: ../build/icons/win/icon.ico
*/
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function generate() {
  const projectRoot = __dirname + '/..';
  const inputPath = path.resolve(projectRoot, 'logo mindwhisperai.png');
  const outDir = path.resolve(projectRoot, 'build/icons/win');
  await ensureDir(outDir);

  const tmpDir = path.resolve(projectRoot, 'build/tmp-icons');
  await ensureDir(tmpDir);

  // Sizes recommended for Windows ICO (including more sizes for better compatibility)
  const sizes = [256, 128, 96, 64, 48, 32, 24, 16];

  // Convert source to PNGs with transparent background (preserve original design)
  const pngPaths = [];
  for (const size of sizes) {
    const outPng = path.join(tmpDir, `icon-${size}.png`);
    await sharp(inputPath)
      .resize(size, size, { 
        fit: 'contain', 
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: sharp.kernel.lanczos3 // Better quality scaling
      })
      .png({ 
        compressionLevel: 9,
        quality: 100,
        palette: false // Ensure full color depth
      })
      .toFile(outPng);
    pngPaths.push(outPng);
  }

  // Create ICO with proper Windows format
  const icoBuffer = await pngToIco(pngPaths);
  const outIco = path.join(outDir, 'icon.ico');
  await fs.writeFile(outIco, icoBuffer);
  
  // Create additional ICO files for different Windows contexts
  const appIco = path.join(outDir, 'app.ico');
  const installerIco = path.join(outDir, 'installer.ico');
  await fs.writeFile(appIco, icoBuffer);
  await fs.writeFile(installerIco, icoBuffer);

  // Also create individual PNG files for different platforms
  for (const size of sizes) {
    const sourcePng = path.join(tmpDir, `icon-${size}.png`);
    const outPng = path.join(outDir, `icon-${size}.png`);
    await fs.copyFile(sourcePng, outPng);
  }

  console.log(`✅ High-quality ICO generated: ${outIco}`);
  console.log(`✅ Additional ICO files created for Windows compatibility`);
  console.log(`✅ PNG icons generated in: ${outDir}`);
  console.log(`✅ Icon sizes created: ${sizes.join(', ')}px`);
  
  // Verify the ICO file was created successfully
  try {
    const stats = await fs.stat(outIco);
    console.log(`✅ ICO file size: ${(stats.size / 1024).toFixed(1)} KB`);
    
    // Verify icon format
    const icoHeader = await fs.readFile(outIco, { start: 0, end: 6 });
    if (icoHeader[0] === 0x00 && icoHeader[1] === 0x00 && icoHeader[2] === 0x01 && icoHeader[3] === 0x00) {
      console.log(`✅ ICO format verified - proper Windows icon file`);
    } else {
      console.warn('⚠️  ICO format may be invalid');
    }
  } catch (error) {
    console.warn('⚠️  Could not verify ICO file:', error.message);
  }
  
  console.log('\n📝 To fix icon cache issues:');
  console.log('1. Run: clear-icon-cache.bat (as Administrator)');
  console.log('2. Or manually: ie4uinit.exe -show');
  console.log('3. Restart Windows Explorer if needed');
}

generate().catch((err) => {
  console.error('Failed to generate icon:', err);
  process.exit(1);
});

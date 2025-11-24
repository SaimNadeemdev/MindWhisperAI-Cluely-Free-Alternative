#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const srcDir = './src';
const fileExtensions = ['.tsx', '.ts', '.jsx', '.js', '.css', '.scss'];

// Patterns to find and replace
const replacementPatterns = [
  // Tailwind bg-black and variants -> use bg-background which is mapped in src/index.css to stealth var
  {
    pattern: /(\b(?:hover:|focus:|active:|disabled:|group-hover:)?bg-black\b)/g,
    replacement: (m) => m.replace('bg-black', 'bg-background'),
    description: 'Replace Tailwind bg-black (incl. variants) with bg-background'
  },
  // Arbitrary opacity variants bg-black/NN -> simplify to bg-background (stealth opacity system controls)
  {
    pattern: /(\b(?:hover:|focus:|active:|disabled:|group-hover:)?bg-black\/)\d+\b/g,
    replacement: (m) => m.replace(/bg-black\/\d+/, 'bg-background'),
    description: 'Replace bg-black/NN with bg-background'
  },
  // Plain class attributes using different quote types containing bg-black
  {
    pattern: /(class(?:Name)?=)(["'`])([^\2]*?)(?<!:)\bbg-black\b([^\2]*?)\2/g,
    replacement: (match, attr, quote, before, after) => {
      const tokens = `${before} ${after}`.split(/\s+/).filter(Boolean).filter(t => t !== 'bg-black');
      // Ensure bg-background exists once
      if (!tokens.includes('bg-background')) tokens.push('bg-background');
      return `${attr}${quote}${tokens.join(' ')}${quote}`;
    },
    description: 'Normalize className/class with bg-black to bg-background'
  },
  // Hover/focus prefixed within class strings (robust)
  {
    pattern: /(class(?:Name)?=)(["'`])([^\2]*?)\b(hover:bg-black|focus:bg-black|active:bg-black)\b([^\2]*?)\2/g,
    replacement: (match, attr, quote, before, variant, after) => {
      const normalized = variant.replace('bg-black', 'bg-background');
      return `${attr}${quote}${before}${normalized}${after}${quote}`;
    },
    description: 'Normalize prefixed hover/focus/active bg-black to bg-background'
  },
  // Convert CSS hex blacks to stealth rgba
  {
    pattern: /#000000\b/gi,
    replacement: 'rgba(0, 0, 0, var(--stealth-opacity, 0.95))',
    description: 'Replace #000000 with stealth rgba'
  },
  {
    pattern: /#000\b/gi,
    replacement: 'rgba(0, 0, 0, var(--stealth-opacity, 0.95))',
    description: 'Replace #000 with stealth rgba'
  },
  // Convert hardcoded rgb(0,0,0) to stealth rgba
  {
    pattern: /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi,
    replacement: 'rgba(0, 0, 0, var(--stealth-opacity, 0.95))',
    description: 'Replace rgb(0,0,0) with stealth rgba'
  },
  // Convert hardcoded rgba black to use stealth opacity multiplier if not already using var
  {
    pattern: /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0?\.\d+|1(?:\.0+)?)\s*\)/gi,
    replacement: (match, alpha) => {
      if (/var\(\s*--stealth-opacity/.test(match)) return match;
      return `rgba(0, 0, 0, calc(var(--stealth-opacity, 0.95) * ${alpha}))`;
    },
    description: 'Convert rgba(0,0,0,alpha) to use stealth opacity variable'
  },
  // CSS background properties set to black
  {
    pattern: /background:\s*black\b/gi,
    replacement: 'background: rgba(0, 0, 0, var(--stealth-opacity, 0.95))',
    description: 'Replace CSS background: black'
  },
  {
    pattern: /background-color:\s*black\b/gi,
    replacement: 'background-color: rgba(0, 0, 0, var(--stealth-opacity, 0.95))',
    description: 'Replace CSS background-color: black'
  },
  // Inline React style backgroundColor: 'black' or "black"
  {
    pattern: /backgroundColor:\s*["']black["']/gi,
    replacement: "backgroundColor: 'rgba(0, 0, 0, var(--stealth-opacity, 0.95))'",
    description: 'Replace inline style black with stealth rgba'
  }
];

// Special cases that may need manual review (logged only)
const specialCases = [
  {
    pattern: /bg-black\s*[:?]{/g,
    replacement: null,
    note: 'Dynamic class assembly detected; review manually'
  }
];

function getAllFiles(dir, extensions) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other build directories
      if (!['node_modules', 'dist', 'build', '.git'].includes(file)) {
        results = results.concat(getAllFiles(filePath, extensions));
      }
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        results.push(filePath);
      }
    }
  });
  
  return results;
}

function processFile(filePath) {
  console.log(`\n📁 Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changes = [];
  
  // Apply each replacement pattern
  replacementPatterns.forEach(({ pattern, replacement, description }) => {
    const matches = content.match(pattern);
    if (matches) {
      console.log(`  🔍 Found ${matches.length} instances: ${description}`);
      changes.push(`${description}: ${matches.length} instances`);
      
      if (typeof replacement === 'function') {
        content = content.replace(pattern, replacement);
      } else {
        content = content.replace(pattern, replacement);
      }
      modified = true;
    }
  });
  
  // Write back if modified
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✅ Updated successfully`);
    return changes;
  } else {
    console.log(`  ⏭️  No changes needed`);
    return [];
  }
}

function main() {
  console.log('🚀 Starting Black Background Stealth Opacity Conversion Script');
  console.log('==============================================================\n');
  
  const files = getAllFiles(srcDir, fileExtensions);
  console.log(`📊 Found ${files.length} files to process\n`);
  
  let totalChanges = 0;
  let modifiedFiles = 0;
  const summary = {};
  
  files.forEach(filePath => {
    const changes = processFile(filePath);
    if (changes.length > 0) {
      modifiedFiles++;
      totalChanges += changes.length;
      summary[filePath] = changes;
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY REPORT');
  console.log('='.repeat(60));
  console.log(`📁 Files processed: ${files.length}`);
  console.log(`✏️  Files modified: ${modifiedFiles}`);
  console.log(`🔄 Total changes: ${totalChanges}`);
  
  if (Object.keys(summary).length > 0) {
    console.log('\n📋 DETAILED CHANGES:');
    Object.entries(summary).forEach(([file, changes]) => {
      console.log(`\n📄 ${file}:`);
      changes.forEach(change => console.log(`   • ${change}`));
    });
  }
  
  console.log('\n🎉 Script completed successfully!');
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Test the application to ensure all components render correctly');
  console.log('2. Verify stealth opacity controls work uniformly across all elements');
  console.log('3. Check for any remaining hardcoded black backgrounds manually');
  console.log('4. Consider adding CSS custom properties for commonly used opacity values');
}

// Run the script
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

module.exports = { getAllFiles, processFile, replacementPatterns };

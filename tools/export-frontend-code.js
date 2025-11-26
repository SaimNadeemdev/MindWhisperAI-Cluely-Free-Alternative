#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputFile = path.join(projectRoot, "frontend_code_bundle.txt");
const includeExtensions = new Set([
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".css",
  ".scss",
  ".html"
]);

const includeDirectories = [
  "src",
  path.join("renderer", "src"),
  path.join("renderer", "public")
];

const extraFiles = [
  "index.html"
];

function collectFiles(directory, accumulator) {
  if (!fs.existsSync(directory)) {
    return;
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(projectRoot, absolutePath);

    if (entry.isDirectory()) {
      // Skip common build/output or dependency directories if encountered.
      if (["node_modules", "dist", "dist-electron", "release", "build", ".git", ".venv", "Lib"].includes(entry.name)) {
        continue;
      }
      collectFiles(absolutePath, accumulator);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (includeExtensions.has(ext)) {
        accumulator.push(relativePath);
      }
    }
  }
}

function main() {
  const collectedFiles = [];

  for (const dir of includeDirectories) {
    const absoluteDir = path.join(projectRoot, dir);
    collectFiles(absoluteDir, collectedFiles);
  }

  for (const extra of extraFiles) {
    const absolutePath = path.join(projectRoot, extra);
    if (fs.existsSync(absolutePath) && includeExtensions.has(path.extname(extra))) {
      collectedFiles.push(path.relative(projectRoot, absolutePath));
    }
  }

  const uniqueFiles = Array.from(new Set(collectedFiles));
  uniqueFiles.sort();

  let output = "";

  for (const relativePath of uniqueFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    const content = fs.readFileSync(absolutePath, "utf8");

    output += `===== BEGIN FILE: ${relativePath} =====\n`;
    output += `${content}\n`;
    output += `===== END FILE: ${relativePath} =====\n\n`;
  }

  fs.writeFileSync(outputFile, output, "utf8");
  console.log(`Exported ${uniqueFiles.length} frontend files to ${outputFile}`);
}

main();

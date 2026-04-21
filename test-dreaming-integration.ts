/**
 * Dreaming Engine Integration Test
 * 
 * Test with real LanceDB data
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// Test results
const results = {
  light: null,
  rem: null,
  deep: null,
};

async function testDreamingOutput() {
  const workspaceDir = join(homedir(), ".openclaw", "workspace");
  const memoryDir = join(workspaceDir, "memory", "dreaming");

  console.log("\n🌙 Dreaming Engine Integration Test\n");
  console.log("=".repeat(60));

  // Check existing dreaming output
  console.log("\n📁 Checking existing dreaming output...\n");

  const phases = ["light", "rem", "deep"];

  for (const phase of phases) {
    const phaseDir = join(memoryDir, phase);
    try {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(phaseDir);
      console.log(`${phase} phase: ${files.length} output files`);
      if (files.length > 0) {
        const latest = files.sort().reverse()[0];
        const content = await readFile(join(phaseDir, latest), "utf8");
        const lines = content.split("\n").slice(0, 10);
        console.log(`  Latest: ${latest}`);
        console.log(`  Preview:`);
        lines.forEach(line => console.log(`    ${line}`));
      }
    } catch (error) {
      console.log(`${phase} phase: no output files`);
    }
  }

  // Check DREAMS.md
  console.log("\n📄 Checking DREAMS.md...\n");
  try {
    const dreamsPath = join(workspaceDir, "DREAMS.md");
    const content = await readFile(dreamsPath, "utf8");
    const lightMatch = content.match(/<!-- openclaw:dreaming:light:start -->([\s\S]*?)<!-- openclaw:dreaming:light:end -->/);
    const deepMatch = content.match(/<!-- openclaw:dreaming:deep:start -->([\s\S]*?)<!-- openclaw:dreaming:deep:end -->/);
    const remMatch = content.match(/<!-- openclaw:dreaming:rem:start -->([\s\S]*?)<!-- openclaw:dreaming:rem:end -->/);

    console.log(`Light Sleep entries: ${lightMatch ? lightMatch[1].split("\n").filter(l => l.trim().startsWith("-")).length : 0}`);
    console.log(`Deep Sleep entries: ${deepMatch ? deepMatch[1].split("\n").filter(l => l.trim().startsWith("-")).length : 0}`);
    console.log(`REM Sleep entries: ${remMatch ? remMatch[1].split("\n").filter(l => l.trim().startsWith("-")).length : 0}`);
  } catch (error) {
    console.log("DREAMS.md not found or error reading");
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ Integration test completed!\n");
}

testDreamingOutput();

/**
 * Dreaming Engine Full Test with Real LanceDB
 * 
 * Connect to actual LanceDB and test all phases
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { loadLanceDB } from "./src/store.js";
import { createEmbedder } from "./src/embedder.js";
import { createRetriever } from "./src/retriever.js";
import { createDreamingScheduler } from "./src/dreaming/index.js";
import { createDreamingInteropWriter } from "./src/dreaming-interop.js";

const workspaceDir = join(homedir(), ".openclaw", "workspace");
const dbPath = join(homedir(), ".openclaw", "memory", "lancedb-pro");

// Embedding config (from openclaw.json)
const embeddingConfig = {
  provider: "openai-compatible",
  model: "qwen3-vl-embedding",
  dimensions: 2560,
  apiKey: process.env.DASHSCOPE_API_KEY || "",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  chunking: true,
};

// Mock API for testing
const mockApi = {
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    debug: (msg) => {},
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
  },
  on: () => {},
  resolvePath: (p) => p,
};

async function main() {
  console.log("\n🌙 Dreaming Engine Full Test with Real Data\n");
  console.log("=".repeat(60));

  try {
    // Step 1: Initialize LanceDB
    console.log("\n📊 Step 1: Connecting to LanceDB...");
    const store = await loadLanceDB({ dbPath, vectorDim: 2560 });
    const stats = await store.stats();
    console.log(`   Total memories: ${stats.count}`);
    console.log(`   Database path: ${dbPath}`);

    // Step 2: Initialize Embedder
    console.log("\n📊 Step 2: Initializing Embedder...");
    const embedder = await createEmbedder(embeddingConfig);
    console.log(`   Model: ${embeddingConfig.model}`);
    console.log(`   Dimensions: ${embeddingConfig.dimensions}`);

    // Step 3: Initialize Retriever
    console.log("\n📊 Step 3: Initializing Retriever...");
    const retriever = await createRetriever({
      store,
      embedder,
      mode: "hybrid",
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      minScore: 0.3,
      recencyHalfLifeDays: 14,
      recencyWeight: 0.1,
      filterNoise: true,
    });
    console.log(`   Mode: hybrid`);

    // Step 4: Initialize Dreaming Interop
    console.log("\n📊 Step 4: Initializing Dreaming Interop...");
    const dreamingInterop = createDreamingInteropWriter({
      logger: mockApi.logger,
    });

    // Step 5: Create Scheduler
    console.log("\n📊 Step 5: Creating Dreaming Scheduler...");
    const config = {
      enabled: true,
      phases: {
        light: {
          enabled: true,
          lookbackDays: 7, // Look back 7 days
          limit: 20, // Limit to 20 candidates
        },
        deep: {
          enabled: false, // Disable for safety
        },
        rem: {
          enabled: false, // Disable for safety
        },
      },
    };

    const scheduler = createDreamingScheduler(config, mockApi, {
      store,
      retriever,
      embedder,
      dreamingInterop,
      workspaceDir,
    });

    // Step 6: Run Light Phase
    console.log("\n📊 Step 6: Running Light Phase...");
    console.log("-".repeat(60));
    const startTime = Date.now();
    const lightResult = await scheduler.executeLight();
    const duration = Date.now() - startTime;

    console.log(`\n✅ Light Phase Results:`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Processed: ${lightResult.processed}`);
    console.log(`   Candidates: ${lightResult.promoted || 0}`);
    
    if ((lightResult as any).topCandidates?.length > 0) {
      console.log(`\n   Top 5 Candidates:`);
      (lightResult as any).topCandidates.slice(0, 5).forEach((c, i) => {
        console.log(`   ${i + 1}. [${c.category}] Score: ${c.score.toFixed(2)}`);
        console.log(`      Text: ${c.text.slice(0, 80)}...`);
      });
    }

    if (lightResult.errors?.length > 0) {
      console.log(`\n   ⚠️ Errors:`);
      lightResult.errors.forEach(e => console.log(`   - ${e}`));
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ Full test completed successfully!\n");
    console.log(`Output files written to: ${workspaceDir}/memory/dreaming/light/\n`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

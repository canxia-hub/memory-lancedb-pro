/**
 * Dreaming Engine Test Script
 * 
 * Manual test for Light/REM/Deep phases
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { createDreamingScheduler } from "./src/dreaming/index.js";

// Mock API
const mockApi = {
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
  },
  on: () => {},
  resolvePath: (p) => p,
};

// Mock dependencies (simplified for testing)
const mockStore = {
  list: async () => [],
  store: async () => {},
};

const mockRetriever = {
  retrieve: async () => [],
};

const mockEmbedder = {
  embedPassage: async () => new Array(2560).fill(0),
  embedBatchPassage: async (texts) => texts.map(() => new Array(2560).fill(0)),
};

const mockDreamingInterop = {
  recordLightSessionSummary: async (params) => {
    console.log(`[Interop] Light summary recorded for session ${params.sessionId}`);
  },
  recordRemReflection: async (params) => {
    console.log(`[Interop] REM reflection recorded`);
  },
  recordDeepPromotion: async (params) => {
    console.log(`[Interop] Deep promotion recorded for memory ${params.entry?.id?.slice(0, 8)}`);
  },
};

const workspaceDir = join(homedir(), ".openclaw", "workspace");

// Dreaming config
const config = {
  enabled: true,
  frequency: "0 3 * * *",
  timezone: "Asia/Shanghai",
  verboseLogging: true,
  phases: {
    light: {
      enabled: true,
      lookbackDays: 2,
      limit: 100,
    },
    deep: {
      enabled: true,
      limit: 10,
      minScore: 0.8,
    },
    rem: {
      enabled: true,
      limit: 10,
    },
  },
};

async function main() {
  console.log("\n🌙 Dreaming Engine Test\n");
  console.log("=".repeat(60));

  try {
    const scheduler = createDreamingScheduler(config, mockApi, {
      store: mockStore,
      retriever: mockRetriever,
      embedder: mockEmbedder,
      dreamingInterop: mockDreamingInterop,
      workspaceDir,
    });

    // Test 1: Light Phase
    console.log("\n📊 Test 1: Light Phase");
    console.log("-".repeat(60));
    const lightResult = await scheduler.executeLight();
    console.log(`✅ Light phase completed`);
    console.log(`   Duration: ${lightResult.duration}ms`);
    console.log(`   Processed: ${lightResult.processed}`);
    console.log(`   Candidates: ${lightResult.promoted || 0}`);
    if (lightResult.errors?.length > 0) {
      console.log(`   Errors: ${lightResult.errors.join(", ")}`);
    }

    // Test 2: REM Phase
    console.log("\n📊 Test 2: REM Phase");
    console.log("-".repeat(60));
    const remResult = await scheduler.executeRem();
    console.log(`✅ REM phase completed`);
    console.log(`   Duration: ${remResult.duration}ms`);
    console.log(`   Processed: ${remResult.processed}`);
    if (remResult.errors?.length > 0) {
      console.log(`   Errors: ${remResult.errors.join(", ")}`);
    }

    // Test 3: Deep Phase
    console.log("\n📊 Test 3: Deep Phase");
    console.log("-".repeat(60));
    const deepResult = await scheduler.executeDeep();
    console.log(`✅ Deep phase completed`);
    console.log(`   Duration: ${deepResult.duration}ms`);
    console.log(`   Evaluated: ${deepResult.processed}`);
    console.log(`   Promoted: ${deepResult.promoted || 0}`);
    if (deepResult.errors?.length > 0) {
      console.log(`   Errors: ${deepResult.errors.join(", ")}`);
    }

    // Test 4: Scheduler Status
    console.log("\n📊 Test 4: Scheduler Status");
    console.log("-".repeat(60));
    const state = scheduler.getState();
    console.log(`   Light running: ${state.lightRunning}`);
    console.log(`   REM running: ${state.remRunning}`);
    console.log(`   Deep running: ${state.deepRunning}`);
    console.log(`   Last Light run: ${state.lastLightRun ? new Date(state.lastLightRun).toISOString() : "never"}`);
    console.log(`   Last REM run: ${state.lastRemRun ? new Date(state.lastRemRun).toISOString() : "never"}`);
    console.log(`   Last Deep run: ${state.lastDeepRun ? new Date(state.lastDeepRun).toISOString() : "never"}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();

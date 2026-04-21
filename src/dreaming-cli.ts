/**
 * Dreaming CLI Commands
 * 
 * Manual triggers for Light/REM/Deep phases
 */

import type { Command } from "commander";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDreamingScheduler } from "./dreaming/index.js";
import type { DreamingConfig } from "./dreaming/types.js";
import type { MemoryStore } from "./store.js";
import type { Retriever } from "./retriever.js";
import type { Embedder } from "./embedder.js";
import type { DreamingInteropWriter } from "./dreaming-interop.js";

interface DreamingCLIContext {
  store: MemoryStore;
  retriever: Retriever;
  embedder: Embedder;
  dreamingInterop: DreamingInteropWriter;
  pluginConfig?: Record<string, unknown>;
}

/**
 * Register Dreaming CLI commands
 */
export function registerDreamingCLI(program: Command, context: DreamingCLIContext): void {
  const workspaceDir = join(homedir(), ".openclaw", "workspace");

  // Get dreaming config from plugin config
  const dreamingConfig: DreamingConfig = {
    enabled: true,
    ...(context.pluginConfig?.dreaming as Partial<DreamingConfig>),
    phases: {
      light: {
        enabled: true,
        lookbackDays: 2,
        limit: 100,
        ...(context.pluginConfig?.dreaming as any)?.phases?.light,
      },
      deep: {
        enabled: true,
        limit: 10,
        minScore: 0.8,
        ...(context.pluginConfig?.dreaming as any)?.phases?.deep,
      },
      rem: {
        enabled: true,
        limit: 10,
        ...(context.pluginConfig?.dreaming as any)?.phases?.rem,
      },
    },
  };

  // dreaming: Main command group
  const dreaming = program
    .command("dreaming")
    .description("Dreaming engine for memory consolidation");

  // dreaming light
  dreaming
    .command("light")
    .description("Run Light phase - scan and score recent memories")
    .option("--verbose", "Show detailed output")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        console.log("🌙 Starting Light phase...");

        // Create scheduler with only light phase enabled
        const config: DreamingConfig = {
          ...dreamingConfig,
          phases: {
            light: dreamingConfig.phases.light,
            deep: { enabled: false },
            rem: { enabled: false },
          },
        };

        const scheduler = createDreamingScheduler(config, createMockApi(), {
          store: context.store,
          retriever: context.retriever,
          embedder: context.embedder,
          dreamingInterop: context.dreamingInterop,
          workspaceDir,
        });

        const result = await scheduler.executeLight();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("\n✅ Light phase completed");
          console.log(`   Duration: ${result.duration}ms`);
          console.log(`   Processed: ${result.processed}`);
          console.log(`   Candidates: ${result.promoted || 0}`);

          if (result.errors && result.errors.length > 0) {
            console.log("\n⚠️  Errors:");
            result.errors.forEach((e) => console.log(`   - ${e}`));
          }
        }
      } catch (error) {
        console.error("❌ Light phase failed:", error);
        process.exit(1);
      }
    });

  // dreaming rem
  dreaming
    .command("rem")
    .description("Run REM phase - identify patterns and generate reflections")
    .option("--verbose", "Show detailed output")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        console.log("🌙 Starting REM phase...");

        const config: DreamingConfig = {
          ...dreamingConfig,
          phases: {
            light: { enabled: false },
            deep: { enabled: false },
            rem: dreamingConfig.phases.rem,
          },
        };

        const scheduler = createDreamingScheduler(config, createMockApi(), {
          store: context.store,
          retriever: context.retriever,
          embedder: context.embedder,
          dreamingInterop: context.dreamingInterop,
          workspaceDir,
        });

        const result = await scheduler.executeRem();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("\n✅ REM phase completed");
          console.log(`   Duration: ${result.duration}ms`);
          console.log(`   Processed: ${result.processed}`);
          console.log(`   Patterns: ${(result as any).patternsIdentified || 0}`);
          console.log(`   Reflections: ${(result as any).reflectionsGenerated || 0}`);

          if (result.errors && result.errors.length > 0) {
            console.log("\n⚠️  Errors:");
            result.errors.forEach((e) => console.log(`   - ${e}`));
          }
        }
      } catch (error) {
        console.error("❌ REM phase failed:", error);
        process.exit(1);
      }
    });

  // dreaming deep
  dreaming
    .command("deep")
    .description("Run Deep phase - promote memories to durable layer")
    .option("--verbose", "Show detailed output")
    .option("--json", "Output as JSON")
    .option("--dry-run", "Show what would be promoted without actually promoting")
    .action(async (options) => {
      try {
        console.log("🌙 Starting Deep phase...");

        const config: DreamingConfig = {
          ...dreamingConfig,
          phases: {
            light: { enabled: false },
            deep: {
              ...dreamingConfig.phases.deep,
              limit: options.dryRun ? 0 : dreamingConfig.phases.deep?.limit,
            },
            rem: { enabled: false },
          },
        };

        const scheduler = createDreamingScheduler(config, createMockApi(), {
          store: context.store,
          retriever: context.retriever,
          embedder: context.embedder,
          dreamingInterop: context.dreamingInterop,
          workspaceDir,
        });

        if (options.dryRun) {
          console.log("\n⚠️  DRY RUN - No memories will be promoted");
        }

        const result = await scheduler.executeDeep();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("\n✅ Deep phase completed");
          console.log(`   Duration: ${result.duration}ms`);
          console.log(`   Evaluated: ${(result as any).candidatesEvaluated || 0}`);
          console.log(`   Promoted: ${result.promoted || 0}`);

          if ((result as any).promotions && (result as any).promotions.length > 0) {
            console.log("\n📋 Promoted memories:");
            (result as any).promotions.forEach((p: any, i: number) => {
              console.log(`   ${i + 1}. [${p.candidate.category}] ${p.candidate.text.slice(0, 60)}...`);
              console.log(`      Score: ${p.candidate.score.toFixed(2)}, ID: ${p.memoryId.slice(0, 8)}`);
            });
          }

          if (result.errors && result.errors.length > 0) {
            console.log("\n⚠️  Errors:");
            result.errors.forEach((e) => console.log(`   - ${e}`));
          }
        }
      } catch (error) {
        console.error("❌ Deep phase failed:", error);
        process.exit(1);
      }
    });

  // dreaming all
  dreaming
    .command("all")
    .description("Run all three phases in sequence (Light → REM → Deep)")
    .option("--verbose", "Show detailed output")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        console.log("🌙 Starting full Dreaming cycle (Light → REM → Deep)...\n");

        const scheduler = createDreamingScheduler(dreamingConfig, createMockApi(), {
          store: context.store,
          retriever: context.retriever,
          embedder: context.embedder,
          dreamingInterop: context.dreamingInterop,
          workspaceDir,
        });

        const results = {
          light: await scheduler.executeLight(),
          rem: await scheduler.executeRem(),
          deep: await scheduler.executeDeep(),
        };

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log("\n✅ Full Dreaming cycle completed\n");

          console.log("📊 Light Phase:");
          console.log(`   Duration: ${results.light.duration}ms`);
          console.log(`   Candidates: ${results.light.promoted || 0}`);

          console.log("\n📊 REM Phase:");
          console.log(`   Duration: ${results.rem.duration}ms`);
          console.log(`   Patterns: ${(results.rem as any).patternsIdentified || 0}`);

          console.log("\n📊 Deep Phase:");
          console.log(`   Duration: ${results.deep.duration}ms`);
          console.log(`   Promoted: ${results.deep.promoted || 0}`);
        }
      } catch (error) {
        console.error("❌ Dreaming cycle failed:", error);
        process.exit(1);
      }
    });

  // dreaming status
  dreaming
    .command("status")
    .description("Show Dreaming scheduler status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const scheduler = createDreamingScheduler(dreamingConfig, createMockApi(), {
          store: context.store,
          retriever: context.retriever,
          embedder: context.embedder,
          dreamingInterop: context.dreamingInterop,
          workspaceDir,
        });

        const state = scheduler.getState();

        if (options.json) {
          console.log(JSON.stringify(state, null, 2));
        } else {
          console.log("\n📊 Dreaming Scheduler Status\n");

          console.log("Phase Status:");
          console.log(`  Light: ${state.lightRunning ? "🔄 Running" : state.lastLightRun ? "✅ Last run: " + new Date(state.lastLightRun).toISOString() : "⏸️  Never run"}`);
          console.log(`  REM:   ${state.remRunning ? "🔄 Running" : state.lastRemRun ? "✅ Last run: " + new Date(state.lastRemRun).toISOString() : "⏸️  Never run"}`);
          console.log(`  Deep:  ${state.deepRunning ? "🔄 Running" : state.lastDeepRun ? "✅ Last run: " + new Date(state.lastDeepRun).toISOString() : "⏸️  Never run"}`);

          if (state.errors.length > 0) {
            console.log("\n⚠️  Recent Errors:");
            state.errors.slice(-5).forEach((e) => {
              console.log(`  - [${e.phase}] ${new Date(e.timestamp).toISOString()}: ${e.error}`);
            });
          }
        }
      } catch (error) {
        console.error("❌ Failed to get status:", error);
        process.exit(1);
      }
    });
}

/**
 * Create a mock API for CLI usage
 */
function createMockApi(): any {
  return {
    logger: {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      debug: (msg: string) => {}, // Suppress debug in CLI
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`),
    },
    on: () => {}, // No event handling in CLI
    resolvePath: (p: string) => p,
  };
}

/**
 * Factory function for Dreaming CLI
 */
export function createDreamingCLI(context: DreamingCLIContext) {
  return ({ program }: { program: Command }) => registerDreamingCLI(program, context);
}

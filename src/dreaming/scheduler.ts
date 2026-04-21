/**
 * Dreaming Scheduler
 * 
 * Orchestrates the three-phase Dreaming execution:
 * - Monitors system events
 * - Manages cron-based scheduling
 * - Coordinates Light/REM/Deep phase execution
 * - Handles errors and maintains state
 */

import type {
  DreamingConfig,
  DreamingResult,
  DreamingEngineContext,
  SchedulerState,
  DreamingSystemEvent,
} from "./types.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MemoryStore } from "../store.js";
import type { Retriever } from "../retriever.js";
import type { Embedder } from "../embedder.js";
import type { LlmClient } from "../llm-client.js";
import type { DreamingInteropWriter } from "../dreaming-interop.js";

// Phase engines
import { LightPhaseEngine } from "./phases/light.js";
import { RemPhaseEngine } from "./phases/rem.js";
import { DeepPhaseEngine } from "./phases/deep.js";

/**
 * Dreaming Scheduler
 * 
 * Main orchestrator for the Dreaming system. Handles:
 * - System event listening and dispatch
 * - Phase execution coordination
 * - Error handling and recovery
 * - State management
 */
export class DreamingScheduler {
  private config: DreamingConfig;
  private api: OpenClawPluginApi;
  private store: MemoryStore;
  private retriever: Retriever;
  private embedder: Embedder;
  private llmClient?: LlmClient;
  private dreamingInterop: DreamingInteropWriter;
  private workspaceDir: string;

  private state: SchedulerState = {
    lightRunning: false,
    remRunning: false,
    deepRunning: false,
    errors: [],
  };

  // Phase engines
  private lightEngine?: LightPhaseEngine;
  private remEngine?: RemPhaseEngine;
  private deepEngine?: DeepPhaseEngine;

  constructor(
    config: DreamingConfig,
    api: OpenClawPluginApi,
    context: {
      store: MemoryStore;
      retriever: Retriever;
      embedder: Embedder;
      llmClient?: LlmClient;
      dreamingInterop: DreamingInteropWriter;
      workspaceDir: string;
    }
  ) {
    this.config = config;
    this.api = api;
    this.store = context.store;
    this.retriever = context.retriever;
    this.embedder = context.embedder;
    this.llmClient = context.llmClient;
    this.dreamingInterop = context.dreamingInterop;
    this.workspaceDir = context.workspaceDir;

    // Initialize phase engines
    if (this.config.phases.light?.enabled) {
      this.lightEngine = new LightPhaseEngine(this.createEngineContext("light"));
    }
    if (this.config.phases.rem?.enabled) {
      this.remEngine = new RemPhaseEngine(this.createEngineContext("rem"));
    }
    if (this.config.phases.deep?.enabled) {
      this.deepEngine = new DeepPhaseEngine(this.createEngineContext("deep"));
    }

    this.log("info", "DreamingScheduler initialized");
  }

  /**
   * Handle system event from OpenClaw
   * 
   * 注意：这个方法保留用于手动触发和 CLI 调用。
   * 系统事件处理现在由 system-event-handler.ts 处理。
   */
  async handleSystemEvent(event: DreamingSystemEvent): Promise<void> {
    const supportedEvents = new Set([
      "__openclaw_memory_core_short_term_promotion_dream__",
      "__openclaw_memory_lancedb_pro_dreaming__",
      "__openclaw_memory_lancedb_pro_dreaming_light__",
      "__openclaw_memory_lancedb_pro_dreaming_rem__",
    ]);

    if (!supportedEvents.has(event.name)) {
      this.log("debug", `Ignoring non-dreaming system event: ${event.name}`);
      return;
    }

    this.log("info", `Dreaming system event received (trigger: ${event.trigger || "unknown"})`);

    try {
      const phasesToRun = event.phase || "all";

      if (phasesToRun === "all") {
        await this.executeLight();
        await this.executeRem();
        await this.executeDeep();
      } else if (phasesToRun === "light") {
        await this.executeLight();
      } else if (phasesToRun === "rem") {
        await this.executeRem();
      } else if (phasesToRun === "deep") {
        await this.executeDeep();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log("error", `Dreaming execution failed: ${errorMsg}`);
      this.recordError(event.phase === "light" || event.phase === "rem" || event.phase === "deep" ? event.phase : "deep", errorMsg);
    }
  }

  /**
   * Execute Light phase
   */
  async executeLight(): Promise<DreamingResult> {
    if (!this.config.phases.light?.enabled) {
      this.log("debug", "Light phase is disabled, skipping");
      return this.createSkippedResult("light");
    }

    if (this.state.lightRunning) {
      this.log("warn", "Light phase already running, skipping duplicate execution");
      return this.createSkippedResult("light");
    }

    this.state.lightRunning = true;
    const startTime = Date.now();

    try {
      this.log("info", "Starting Light phase execution");

      // Run Light phase engine
      if (this.lightEngine) {
        const result = await this.lightEngine.execute();
        this.state.lastLightRun = Date.now();
        this.log(
          "info",
          `Light phase completed (duration: ${result.duration}ms, processed: ${result.processed})`
        );
        return result;
      } else {
        throw new Error("Light phase engine not initialized");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log("error", `Light phase failed: ${errorMsg}`);
      this.recordError("light", errorMsg);

      return {
        phase: "light",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        processed: 0,
        errors: [errorMsg],
      };
    } finally {
      this.state.lightRunning = false;
    }
  }

  /**
   * Execute REM phase
   */
  async executeRem(): Promise<DreamingResult> {
    if (!this.config.phases.rem?.enabled) {
      this.log("debug", "REM phase is disabled, skipping");
      return this.createSkippedResult("rem");
    }

    if (this.state.remRunning) {
      this.log("warn", "REM phase already running, skipping duplicate execution");
      return this.createSkippedResult("rem");
    }

    this.state.remRunning = true;
    const startTime = Date.now();

    try {
      this.log("info", "Starting REM phase execution");

      // Run REM phase engine
      if (this.remEngine) {
        const result = await this.remEngine.execute();
        this.state.lastRemRun = Date.now();
        this.log(
          "info",
          `REM phase completed (duration: ${result.duration}ms, processed: ${result.processed})`
        );
        return result;
      } else {
        throw new Error("REM phase engine not initialized");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log("error", `REM phase failed: ${errorMsg}`);
      this.recordError("rem", errorMsg);

      return {
        phase: "rem",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        processed: 0,
        errors: [errorMsg],
      };
    } finally {
      this.state.remRunning = false;
    }
  }

  /**
   * Execute Deep phase
   *
   * In true three-phase scheduling, Deep runs independently on its own cron.
   * Cross-phase orchestration is handled by explicit callers, not by implicit chaining here.
   */
  async executeDeep(): Promise<DreamingResult> {
    if (!this.config.phases.deep?.enabled) {
      this.log("debug", "Deep phase is disabled, skipping");
      return this.createSkippedResult("deep");
    }

    if (this.state.deepRunning) {
      this.log("warn", "Deep phase already running, skipping duplicate execution");
      return this.createSkippedResult("deep");
    }

    this.state.deepRunning = true;
    const startTime = Date.now();

    try {
      this.log("info", "Starting Deep phase execution");

      // Run Deep phase engine
      if (this.deepEngine) {
        const result = await this.deepEngine.execute();
        this.state.lastDeepRun = Date.now();
        this.log(
          "info",
          `Deep phase completed (duration: ${result.duration}ms, processed: ${result.processed}, promoted: ${result.promoted || 0})`
        );
        return result;
      } else {
        throw new Error("Deep phase engine not initialized");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log("error", `Deep phase failed: ${errorMsg}`);
      this.recordError("deep", errorMsg);

      return {
        phase: "deep",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        processed: 0,
        errors: [errorMsg],
      };
    } finally {
      this.state.deepRunning = false;
    }
  }

  /**
   * Get current scheduler state
   */
  getState(): SchedulerState {
    return { ...this.state };
  }

  /**
   * Check if Light phase should run before Deep
   */
  private shouldRunLightBeforeDeep(): boolean {
    if (!this.config.phases.light?.enabled) return false;

    const lastRun = this.state.lastLightRun;
    if (!lastRun) return true;

    // Run if last run was more than 6 hours ago
    const sixHours = 6 * 60 * 60 * 1000;
    return Date.now() - lastRun > sixHours;
  }

  /**
   * Check if REM phase should run before Deep
   */
  private shouldRunRemBeforeDeep(): boolean {
    if (!this.config.phases.rem?.enabled) return false;

    const lastRun = this.state.lastRemRun;
    if (!lastRun) return true;

    // Run if last run was more than 7 days ago
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - lastRun > sevenDays;
  }

  /**
   * Create engine context for phase engines
   */
  private createEngineContext(phase: "light" | "rem" | "deep"): DreamingEngineContext {
    return {
      workspaceDir: this.workspaceDir,
      config: this.config,
      store: this.store,
      retriever: this.retriever,
      embedder: this.embedder,
      llmClient: this.llmClient,
      dreamingInterop: this.dreamingInterop,
      logger: {
        info: (msg: string) => this.log("info", `[${phase}] ${msg}`),
        debug: (msg: string) => this.log("debug", `[${phase}] ${msg}`),
        warn: (msg: string) => this.log("warn", `[${phase}] ${msg}`),
        error: (msg: string) => this.log("error", `[${phase}] ${msg}`),
      },
    };
  }

  /**
   * Create a skipped result
   */
  private createSkippedResult(phase: "light" | "rem" | "deep"): DreamingResult {
    return {
      phase,
      timestamp: new Date().toISOString(),
      duration: 0,
      processed: 0,
      summary: "Phase skipped (disabled or already running)",
    };
  }

  /**
   * Record an error in scheduler state
   */
  private recordError(phase: "light" | "rem" | "deep", error: string): void {
    this.state.errors.push({
      phase,
      timestamp: Date.now(),
      error,
    });

    // Keep only last 10 errors
    if (this.state.errors.length > 10) {
      this.state.errors = this.state.errors.slice(-10);
    }
  }

  /**
   * Log with prefix
   */
  private log(level: "info" | "debug" | "warn" | "error", message: string): void {
    const prefix = "dreaming:";
    const logMsg = `${prefix} ${message}`;

    switch (level) {
      case "info":
        this.api.logger.info(logMsg);
        break;
      case "debug":
        this.api.logger.debug?.(logMsg);
        break;
      case "warn":
        this.api.logger.warn?.(logMsg);
        break;
      case "error":
        this.api.logger.error?.(logMsg);
        break;
    }
  }
}

/**
 * Create a Dreaming scheduler instance
 */
export function createDreamingScheduler(
  config: DreamingConfig,
  api: OpenClawPluginApi,
  context: {
    store: MemoryStore;
    retriever: Retriever;
    embedder: Embedder;
    llmClient?: LlmClient;
    dreamingInterop: DreamingInteropWriter;
    workspaceDir: string;
  }
): DreamingScheduler {
  return new DreamingScheduler(config, api, context);
}

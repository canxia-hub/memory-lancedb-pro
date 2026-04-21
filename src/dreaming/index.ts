/**
 * Dreaming Engine - Main Entry Point
 * 
 * Three-phase memory consolidation system for long-term memory management.
 * 
 * Phases:
 * - Light Sleep: Short-term memory organization and candidate marking
 * - REM Sleep: Pattern recognition and reflection generation
 * - Deep Sleep: Long-term memory promotion and consolidation
 * 
 * Usage:
 * ```typescript
 * import { registerDreamingSystemEventHandler } from "./dreaming/index.js";
 * 
 * // Register system event handler (uses correct OpenClaw API)
 * registerDreamingSystemEventHandler(api, config, context);
 * ```
 */

export { DreamingScheduler, createDreamingScheduler } from "./scheduler.js";

// System event handler (correct implementation based on memory-core pattern)
export {
  registerDreamingSystemEventHandler,
  LANCEDB_DREAMING_SYSTEM_EVENT_TEXT,
} from "./system-event-handler.js";

// Phase engines
export { LightPhaseEngine, createLightPhaseEngine } from "./phases/light.js";
export { RemPhaseEngine, createRemPhaseEngine } from "./phases/rem.js";
export { DeepPhaseEngine, createDeepPhaseEngine } from "./phases/deep.js";

// Export all types
export * from "./types.js";

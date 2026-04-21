/**
 * Dreaming Engine Types
 * 
 * Type definitions for the three-phase memory consolidation system:
 * - Light Sleep: Short-term memory organization and candidate marking
 * - REM Sleep: Pattern recognition and reflection generation
 * - Deep Sleep: Long-term memory promotion and consolidation
 */

import type { MemoryEntry } from "../store.js";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Complete Dreaming configuration
 */
export interface DreamingConfig {
  enabled: boolean;
  frequency?: string; // Cron expression for main scheduling
  timezone?: string;
  verboseLogging?: boolean;
  storage?: {
    mode: "inline" | "separate" | "both";
    separateReports?: boolean;
  };
  execution?: {
    speed: "fast" | "balanced" | "slow";
    thinking: "low" | "medium" | "high";
    budget: "cheap" | "medium" | "expensive";
    model?: string; // Override model for REM reflections
  };
  phases: {
    light?: LightPhaseConfig;
    deep?: DeepPhaseConfig;
    rem?: RemPhaseConfig;
  };
}

/**
 * Light Sleep phase configuration
 * - Scans recent short-term memories
 * - Scores and ranks candidates
 * - Deduplicates based on semantic similarity
 */
export interface LightPhaseConfig {
  enabled: boolean;
  cron?: string; // Override scheduling (default: every 6 hours)
  lookbackDays?: number; // How far back to scan (default: 2 days)
  limit?: number; // Max candidates to output (default: 100)
  dedupeSimilarity?: number; // Similarity threshold for deduplication (default: 0.9)
}

/**
 * REM Sleep phase configuration
 * - Identifies patterns across memories
 * - Clusters related memories by topic
 * - Generates reflections using LLM
 */
export interface RemPhaseConfig {
  enabled: boolean;
  cron?: string; // Override scheduling (default: weekly on Sunday 5:00)
  lookbackDays?: number; // How far back to analyze (default: 7 days)
  limit?: number; // Max reflections to generate (default: 10)
  minPatternStrength?: number; // Minimum pattern strength to generate reflection (default: 0.75)
}

/**
 * Deep Sleep phase configuration
 * - Evaluates candidates for promotion
 * - Promotes qualified memories to durable layer
 * - Generates MEMORY.md suggestions
 */
export interface DeepPhaseConfig {
  enabled: boolean;
  cron?: string; // Override scheduling (default: daily at 3:00)
  limit?: number; // Max promotions per run (default: 10)
  minScore?: number; // Minimum score for promotion (default: 0.8)
  minRecallCount?: number; // Minimum recall count (default: 3)
  minUniqueQueries?: number; // Minimum unique query count (default: 3)
  recencyHalfLifeDays?: number; // Recency decay half-life (default: 14 days)
  maxAgeDays?: number; // Maximum age for promotion (default: 30 days)
}

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Result of a Dreaming phase execution
 */
export interface DreamingResult {
  phase: "light" | "rem" | "deep";
  timestamp: string; // ISO 8601
  duration: number; // milliseconds
  processed: number; // Number of items processed
  promoted?: number; // Number of items promoted (deep only)
  errors?: string[];
  summary?: string;
}

/**
 * Light phase detailed result
 */
export interface LightPhaseResult extends DreamingResult {
  phase: "light";
  candidatesGenerated: number;
  dedupedCount: number;
  averageScore: number;
  topCandidates: DreamingCandidate[];
}

/**
 * REM phase detailed result
 */
export interface RemPhaseResult extends DreamingResult {
  phase: "rem";
  patternsIdentified: number;
  reflectionsGenerated: number;
  patterns: Pattern[];
  reflections: Reflection[];
}

/**
 * Deep phase detailed result
 */
export interface DeepPhaseResult extends DreamingResult {
  phase: "deep";
  candidatesEvaluated: number;
  promotions: PromotionRecord[];
  memorySuggestions: MemorySuggestion[];
}

// ============================================================================
// Candidate & Scoring Types
// ============================================================================

/**
 * A memory candidate for promotion
 */
export interface DreamingCandidate {
  id: string;
  category: "preference" | "fact" | "decision" | "entity" | "other";
  scope: string;
  text: string;
  importance: number; // 0-1
  recallCount: number; // Number of times recalled
  uniqueQueries: number; // Number of unique query contexts
  lastRecallAt: number; // Timestamp (ms)
  createdAt: number; // Timestamp (ms)
  score: number; // Composite score (0-1)
  metadata?: Record<string, unknown>;
}

/**
 * Scoring weights for candidate evaluation
 */
export interface ScoringWeights {
  recency: number; // Weight for recency score (default: 0.3)
  importance: number; // Weight for importance score (default: 0.4)
  recall: number; // Weight for recall frequency score (default: 0.3)
}

// ============================================================================
// Pattern & Reflection Types
// ============================================================================

/**
 * A recognized pattern across memories
 */
export interface Pattern {
  id: string;
  name: string; // Human-readable pattern name
  type: "topic" | "association" | "trend" | "anomaly";
  strength: number; // 0-1, confidence/strength of the pattern
  memories: DreamingCandidate[]; // Associated memories
  keywords: string[];
  metadata?: Record<string, unknown>;
}

/**
 * A generated reflection from REM phase
 */
export interface Reflection {
  id: string;
  pattern: Pattern;
  text: string; // Generated reflection text
  timestamp: number; // When generated (ms)
  metadata?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
  };
}

// ============================================================================
// Promotion Types
// ============================================================================

/**
 * Record of a memory promotion
 */
export interface PromotionRecord {
  candidate: DreamingCandidate;
  promotedAt: number; // Timestamp (ms)
  previousState?: string;
  newState: string; // "confirmed"
  previousLayer?: string;
  newLayer: string; // "durable"
  memoryId: string; // ID in LanceDB
}

/**
 * Suggestion for MEMORY.md
 */
export interface MemorySuggestion {
  type: "decision" | "fact" | "invariant";
  title: string;
  text: string;
  source: "dreaming-deep";
  score: number;
  recallCount: number;
  candidateId: string;
  suggestedLocation?: string; // Section in MEMORY.md
}

// ============================================================================
// Engine Context Types
// ============================================================================

/**
 * Context passed to phase engines
 */
export interface DreamingEngineContext {
  workspaceDir: string;
  agentId?: string;
  config: DreamingConfig;
  store: import("../store.js").MemoryStore;
  retriever: import("../retriever.js").Retriever;
  embedder: import("../embedder.js").Embedder;
  llmClient?: import("../llm-client.js").LlmClient;
  dreamingInterop: import("../dreaming-interop.js").DreamingInteropWriter;
  logger: {
    info: (message: string) => void;
    debug?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}

/**
 * Scheduler state
 */
export interface SchedulerState {
  lastLightRun?: number; // Timestamp (ms)
  lastRemRun?: number;
  lastDeepRun?: number;
  lightRunning: boolean;
  remRunning: boolean;
  deepRunning: boolean;
  errors: Array<{
    phase: "light" | "rem" | "deep";
    timestamp: number;
    error: string;
  }>;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * System event payload for dreaming trigger
 */
export interface DreamingSystemEvent {
  name: string; // "__openclaw_memory_core_short_term_promotion_dream__"
  timestamp: string; // ISO 8601
  trigger?: "cron" | "manual" | "system";
  phase?: "light" | "rem" | "deep" | "all"; // Which phase(s) to run
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Date/time utilities
 */
export interface DateTimeParts {
  nowMs: number;
  iso: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  unique: DreamingCandidate[];
  duplicates: Array<{
    kept: DreamingCandidate;
    removed: DreamingCandidate[];
    similarity: number;
  }>;
}

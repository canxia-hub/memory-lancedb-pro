/**
 * Light Phase Engine
 * 
 * Scans recent short-term memories, scores and ranks candidates,
 * deduplicates based on semantic similarity, and generates candidate list
 * for promotion to long-term memory.
 * 
 * Output: memory/dreaming/light/YYYY-MM-DD.md
 */

import type {
  DreamingEngineContext,
  DreamingResult,
  LightPhaseResult,
  DreamingCandidate,
  LightPhaseConfig,
  ScoringWeights,
  DeduplicationResult,
} from "../types.js";
import type { MemoryEntry } from "../../store.js";
import { parseSmartMetadata } from "../../smart-metadata.js";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<LightPhaseConfig> = {
  enabled: true,
  cron: "0 */6 * * *", // Every 6 hours
  lookbackDays: 2,
  limit: 100,
  dedupeSimilarity: 0.9,
};

const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  recency: 0.3,
  importance: 0.4,
  recall: 0.3,
};

// ============================================================================
// Light Phase Engine
// ============================================================================

export class LightPhaseEngine {
  private context: DreamingEngineContext;
  private config: Required<LightPhaseConfig>;

  constructor(context: DreamingEngineContext) {
    this.context = context;
    this.config = {
      ...DEFAULT_CONFIG,
      ...(context.config.phases.light || {}),
    } as Required<LightPhaseConfig>;
  }

  /**
   * Execute Light phase
   */
  async execute(): Promise<LightPhaseResult> {
    const startTime = Date.now();

    this.context.logger.info("Starting Light phase execution");

    try {
      // Step 1: Retrieve recent short-term memories
      const memories = await this.retrieveRecentMemories();
      this.context.logger.info(`Retrieved ${memories.length} recent memories`);

      // Step 2: Score memories
      const scored = this.scoreMemories(memories);
      this.context.logger.info(`Scored ${scored.length} memories`);

      // Step 3: Deduplicate and cluster
      const deduped = await this.dedupeAndCluster(scored);
      this.context.logger.info(`Deduplicated to ${deduped.unique.length} unique candidates`);

      // Step 4: Limit output
      const candidates = deduped.unique.slice(0, this.config.limit);

      // Step 5: Write output
      await this.writeCandidates(candidates);

      // Step 6: Record to dreaming interop
      await this.recordToDreamingInterop(candidates);

      const result: LightPhaseResult = {
        phase: "light",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        processed: memories.length,
        candidatesGenerated: candidates.length,
        dedupedCount: deduped.unique.length,
        averageScore: candidates.length > 0
          ? candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length
          : 0,
        topCandidates: candidates.slice(0, 10),
        summary: `Processed ${memories.length} memories, generated ${candidates.length} candidates`,
      };

      this.context.logger.info(
        `Light phase completed: ${result.duration}ms, ${result.processed} processed, ${result.candidatesGenerated} candidates`
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.context.logger.error?.(`Light phase failed: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Retrieve recent short-term memories from LanceDB
   */
  private async retrieveRecentMemories(): Promise<MemoryEntry[]> {
    const cutoffTime = Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000;

    // Use retriever to scan memories
    // We use a broad query to get all memories, then filter by time and layer
    try {
      const results = await this.context.retriever.retrieve({
        query: "*", // Match all (broad query)
        limit: 1000,
        filters: {
          // Filter by timestamp (recent memories)
          timestamp: { $gte: cutoffTime },
        },
      });

      // Filter for short-term memories:
      // - state = "pending" OR layer = "working"
      // - Exclude durable layer (already promoted)
      const filtered = results.filter((r) => {
        const metadata = parseSmartMetadata(r.entry.metadata);
        const state = metadata.state;
        const layer = metadata.memory_layer;

        // Include pending or working layer memories
        const isShortTerm = state === "pending" || layer === "working";
        
        // Exclude durable layer (already long-term)
        const notDurable = layer !== "durable";

        return isShortTerm && notDurable;
      });

      return filtered.map((r) => r.entry);
    } catch (error) {
      this.context.logger.error?.(`Failed to retrieve memories: ${String(error)}`);
      return [];
    }
  }

  /**
   * Score memories based on recency, importance, and recall frequency
   */
  private scoreMemories(memories: MemoryEntry[]): DreamingCandidate[] {
    return memories.map((mem) => {
      const metadata = parseSmartMetadata(mem.metadata);

      // Calculate component scores
      const recencyScore = this.calculateRecencyScore(mem.timestamp);
      const importanceScore = mem.importance || 0.5;
      const recallScore = this.calculateRecallScore(metadata.access_count || 0);

      // Composite score
      const weights = DEFAULT_SCORING_WEIGHTS;
      const score =
        recencyScore * weights.recency +
        importanceScore * weights.importance +
        recallScore * weights.recall;

      return {
        id: mem.id,
        category: mem.category,
        scope: mem.scope,
        text: mem.text,
        importance: importanceScore,
        recallCount: metadata.access_count || 0,
        uniqueQueries: 1, // TODO: Track unique query contexts
        lastRecallAt: metadata.last_injected_at || mem.timestamp,
        createdAt: mem.timestamp,
        score,
        metadata: metadata as unknown as Record<string, unknown>,
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate recency score (exponential decay)
   */
  private calculateRecencyScore(timestamp: number): number {
    const age = Date.now() - timestamp;
    const halfLifeMs = 14 * 24 * 60 * 60 * 1000; // 14 days
    return Math.exp(-age / halfLifeMs);
  }

  /**
   * Calculate recall score (logarithmic scaling)
   */
  private calculateRecallScore(accessCount: number): number {
    if (accessCount <= 0) return 0;
    // Logarithmic scaling: access_count 1 → 0.3, 5 → 0.7, 10 → 0.85
    return Math.min(1.0, Math.log10(accessCount + 1) / Math.log10(10));
  }

  /**
   * Deduplicate similar memories based on semantic similarity
   */
  private async dedupeAndCluster(candidates: DreamingCandidate[]): Promise<DeduplicationResult> {
    const threshold = this.config.dedupeSimilarity;
    const unique: DreamingCandidate[] = [];
    const duplicates: DeduplicationResult["duplicates"] = [];

    for (const candidate of candidates) {
      let isDuplicate = false;
      let duplicateOf: DreamingCandidate | null = null;
      let maxSimilarity = 0;

      // Check similarity with existing unique candidates
      for (const existing of unique) {
        const similarity = await this.calculateSimilarity(candidate.text, existing.text);

        if (similarity > threshold) {
          isDuplicate = true;
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            duplicateOf = existing;
          }
        }
      }

      if (isDuplicate && duplicateOf) {
        duplicates.push({
          kept: duplicateOf,
          removed: [candidate],
          similarity: maxSimilarity,
        });
      } else {
        unique.push(candidate);
      }
    }

    return { unique, duplicates };
  }

  /**
   * Calculate semantic similarity between two texts using embeddings
   */
  private async calculateSimilarity(text1: string, text2: string): Promise<number> {
    try {
      // Get embeddings
      const [vec1, vec2] = await Promise.all([
        this.context.embedder.embedPassage(text1),
        this.context.embedder.embedPassage(text2),
      ]);

      // Calculate cosine similarity
      return this.cosineSimilarity(vec1, vec2);
    } catch (error) {
      this.context.logger.warn?.(`Failed to calculate similarity: ${String(error)}`);
      return 0;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Write candidates to light phase output file
   */
  private async writeCandidates(candidates: DreamingCandidate[]): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].split(".")[0];

    const outputDir = join(this.context.workspaceDir, "memory", "dreaming", "light");
    await mkdir(outputDir, { recursive: true });

    const outputPath = join(outputDir, `${date}.md`);

    // Build markdown content
    const lines: string[] = [
      `## ${date} ${time} UTC`,
      "",
      `- Agent: dreaming-engine`,
      `- Phase: light`,
      `- Source: dreaming-scheduler`,
      `- Candidates: ${candidates.length}`,
      "",
      "### Top Candidates",
      "",
    ];

    candidates.slice(0, 20).forEach((candidate, index) => {
      lines.push(`#### ${index + 1}. [${candidate.category}] ${this.extractTitle(candidate.text)}`);
      lines.push("");
      lines.push(`- **Score**: ${candidate.score.toFixed(2)}`);
      lines.push(`- **Importance**: ${candidate.importance.toFixed(2)}`);
      lines.push(`- **Recall Count**: ${candidate.recallCount}`);
      lines.push(`- **Scope**: ${candidate.scope}`);
      lines.push(`- **ID**: \`${candidate.id.slice(0, 8)}\``);
      lines.push("");
      lines.push(candidate.text.length > 280
        ? `${candidate.text.slice(0, 279).trimEnd()}…`
        : candidate.text);
      lines.push("");
    });

    lines.push("### Statistics");
    lines.push("");
    lines.push(`- Total candidates: ${candidates.length}`);
    lines.push(`- Average score: ${candidates.length > 0
      ? (candidates.reduce((sum, c) => sum + c.score, 0) / candidates.length).toFixed(2)
      : "N/A"}`);
    lines.push("");

    // Append to existing file or create new
    const existing = await this.readExistingFile(outputPath);
    const content = existing
      ? `${existing}\n\n${lines.join("\n")}\n`
      : `# Light Sleep\n\n${lines.join("\n")}\n`;

    await writeFile(outputPath, content, "utf8");
    this.context.logger.info(`Wrote light phase output to ${outputPath}`);
  }

  /**
   * Read existing file content
   */
  private async readExistingFile(path: string): Promise<string> {
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(path, "utf8");
    } catch {
      return "";
    }
  }

  /**
   * Extract title from text (first line or truncated)
   */
  private extractTitle(text: string): string {
    const firstLine = text.split("\n")[0].trim();
    return firstLine.length > 60 ? `${firstLine.slice(0, 59).trimEnd()}…` : firstLine;
  }

  /**
   * Record to dreaming interop (for event emission)
   */
  private async recordToDreamingInterop(candidates: DreamingCandidate[]): Promise<void> {
    try {
      const summaryText = candidates
        .slice(0, 10)
        .map((c) => `- [${c.category}] ${this.extractTitle(c.text)} (score: ${c.score.toFixed(2)})`)
        .join("\n");

      await this.context.dreamingInterop.recordLightSessionSummary({
        workspaceDir: this.context.workspaceDir,
        agentId: "dreaming-engine",
        sessionKey: "dreaming:light",
        sessionId: `light-${Date.now()}`,
        source: "dreaming-scheduler",
        summaryText: `Generated ${candidates.length} candidates:\n\n${summaryText}`,
      });
    } catch (error) {
      this.context.logger.warn?.(`Failed to record to dreaming interop: ${String(error)}`);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLightPhaseEngine(context: DreamingEngineContext): LightPhaseEngine {
  return new LightPhaseEngine(context);
}

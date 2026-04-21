/**
 * Deep Phase Engine
 * 
 * Evaluates candidates from Light phase and promotes qualified memories
 * to the durable long-term layer.
 * 
 * Output: memory/dreaming/deep/YYYY-MM-DD.md
 * 
 * Promotion Criteria:
 * - Composite score >= minScore (default: 0.8)
 * - Recall count >= minRecallCount (default: 3)
 * - Unique query contexts >= minUniqueQueries (default: 3)
 * - Age within maxAgeDays (default: 30 days)
 */

import type {
  DreamingEngineContext,
  DreamingResult,
  DeepPhaseResult,
  DreamingCandidate,
  DeepPhaseConfig,
  PromotionRecord,
  MemorySuggestion,
} from "../types.js";
import type { MemoryEntry } from "../../store.js";
import { parseSmartMetadata, buildSmartMetadata, stringifySmartMetadata } from "../../smart-metadata.js";
import { join, dirname } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<DeepPhaseConfig> = {
  enabled: true,
  cron: "0 3 * * *", // Daily at 3:00
  limit: 10,
  minScore: 0.8,
  minRecallCount: 3,
  minUniqueQueries: 3,
  recencyHalfLifeDays: 14,
  maxAgeDays: 30,
};

// ============================================================================
// Deep Phase Engine
// ============================================================================

export class DeepPhaseEngine {
  private context: DreamingEngineContext;
  private config: Required<DeepPhaseConfig>;

  constructor(context: DreamingEngineContext) {
    this.context = context;
    this.config = {
      ...DEFAULT_CONFIG,
      ...(context.config.phases.deep || {}),
    } as Required<DeepPhaseConfig>;
  }

  /**
   * Execute Deep phase
   */
  async execute(): Promise<DeepPhaseResult> {
    const startTime = Date.now();

    this.context.logger.info("Starting Deep phase execution");

    try {
      // Step 1: Load Light phase candidates
      const candidates = await this.loadLightCandidates();
      this.context.logger.info(`Loaded ${candidates.length} candidates from Light phase`);

      // Step 2: Filter qualified candidates
      const qualified = this.filterQualified(candidates);
      this.context.logger.info(`${qualified.length} candidates qualified for promotion`);

      // Step 3: Evaluate and make promotion decisions
      const promotions = await this.evaluatePromotions(qualified);

      // Step 4: Promote to durable layer
      const promoted = await this.promoteToLongTerm(promotions);
      this.context.logger.info(`Promoted ${promoted.length} memories to durable layer`);

      // Step 5: Generate MEMORY.md suggestions
      const suggestions = this.generateMemorySuggestions(promoted);

      // Step 6: Write output
      await this.writeDeepOutput(promoted, suggestions);

      const result: DeepPhaseResult = {
        phase: "deep",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        processed: candidates.length,
        promoted: promoted.length,
        candidatesEvaluated: qualified.length,
        promotions: promoted,
        memorySuggestions: suggestions,
        summary: `Evaluated ${candidates.length} candidates, promoted ${promoted.length} to durable layer`,
      };

      this.context.logger.info(
        `Deep phase completed: ${result.duration}ms, ${result.processed} evaluated, ${result.promoted} promoted`
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.context.logger.error?.(`Deep phase failed: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Load candidates from Light phase output
   */
  private async loadLightCandidates(): Promise<DreamingCandidate[]> {
    const lookbackDays = 2; // Look back 2 days
    const candidates: DreamingCandidate[] = [];

    for (let i = 0; i < lookbackDays; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const lightPath = join(
        this.context.workspaceDir,
        "memory",
        "dreaming",
        "light",
        `${date}.md`
      );

      try {
        const content = await readFile(lightPath, "utf8");
        const parsed = this.parseLightOutput(content);
        candidates.push(...parsed);
      } catch {
        // File doesn't exist, skip
      }
    }

    return candidates;
  }

  /**
   * Parse Light phase output to extract candidates
   */
  private parseLightOutput(content: string): DreamingCandidate[] {
    // Parse markdown sections
    const sectionPattern = /#### \d+\. \[([^\]]+)\] (.+?)\n\n([\s\S?]+?)(?=\n#### |\n### |$)/g;
    const candidates: DreamingCandidate[] = [];

    let match;
    while ((match = sectionPattern.exec(content)) !== null) {
      const category = match[1] as DreamingCandidate["category"];
      const title = match[2];
      const body = match[3];

      // Extract metadata from body
      const scoreMatch = body.match(/\*\*Score\*\*:\s*([\d.]+)/);
      const importanceMatch = body.match(/\*\*Importance\*\*:\s*([\d.]+)/);
      const recallMatch = body.match(/\*\*Recall Count\*\*:\s*(\d+)/);
      const scopeMatch = body.match(/\*\*Scope\*\*:\s*(\S+)/);
      const idMatch = body.match(/\*\*ID\*\*:\s*`([^`]+)`/);

      // Extract text (everything after metadata)
      const textMatch = body.split("\n\n").slice(1).join("\n\n").trim();

      if (scoreMatch && idMatch) {
        candidates.push({
          id: idMatch[1],
          category: category as DreamingCandidate["category"],
          scope: scopeMatch?.[1] || "global",
          text: textMatch || title,
          importance: parseFloat(importanceMatch?.[1] || "0.5"),
          recallCount: parseInt(recallMatch?.[1] || "0", 10),
          uniqueQueries: 1,
          lastRecallAt: Date.now(),
          createdAt: Date.now(),
          score: parseFloat(scoreMatch[1]),
        });
      }
    }

    return candidates;
  }

  /**
   * Filter candidates that meet promotion criteria
   */
  private filterQualified(candidates: DreamingCandidate[]): DreamingCandidate[] {
    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;

    return candidates.filter((c) => {
      // Score threshold
      if (c.score < this.config.minScore) return false;

      // Recall count threshold
      if (c.recallCount < this.config.minRecallCount) return false;

      // Age threshold
      if (Date.now() - c.createdAt > maxAgeMs) return false;

      // Exclude already durable
      const layer = (c.metadata as any)?.memory_layer;
      if (layer === "durable") return false;

      return true;
    });
  }

  /**
   * Evaluate candidates and make promotion decisions
   */
  private async evaluatePromotions(
    candidates: DreamingCandidate[]
  ): Promise<DreamingCandidate[]> {
    // Sort by score (descending)
    const sorted = [...candidates].sort((a, b) => b.score - a.score);

    // Limit to configured max
    return sorted.slice(0, this.config.limit);
  }

  /**
   * Promote memories to durable long-term layer
   */
  private async promoteToLongTerm(
    candidates: DreamingCandidate[]
  ): Promise<PromotionRecord[]> {
    const promotions: PromotionRecord[] = [];

    for (const candidate of candidates) {
      try {
        // Prepare memory entry for durable layer
        const entry: MemoryEntry = {
          id: randomUUID(),
          text: candidate.text,
          vector: [], // Will be generated by store
          category: candidate.category,
          scope: candidate.scope,
          importance: candidate.importance,
          timestamp: Date.now(),
          metadata: stringifySmartMetadata(
            buildSmartMetadata(
              {
                text: candidate.text,
                category: candidate.category,
                importance: candidate.importance,
                timestamp: Date.now(),
              },
              {
                state: "confirmed",
                memory_layer: "durable",
                tier: this.inferTier(candidate),
                confidence: candidate.score,
                source: "dreaming-deep",
                promoted_from_id: candidate.id,
                promoted_at: Date.now(),
                recall_count: candidate.recallCount,
              }
            )
          ),
        };

        // Generate embedding
        const vector = await this.context.embedder.embedPassage(candidate.text);
        entry.vector = vector;

        // Store in LanceDB
        await this.context.store.store(entry);

        // Record promotion
        const promotion: PromotionRecord = {
          candidate,
          promotedAt: Date.now(),
          previousState: "pending",
          newState: "confirmed",
          previousLayer: "working",
          newLayer: "durable",
          memoryId: entry.id,
        };

        promotions.push(promotion);

        // Record to dreaming interop
        await this.context.dreamingInterop.recordDeepPromotion({
          workspaceDir: this.context.workspaceDir,
          agentId: "dreaming-engine",
          entry,
          state: "confirmed",
          layer: "durable",
        });

        this.context.logger.info(
          `Promoted memory ${candidate.id.slice(0, 8)} → ${entry.id.slice(0, 8)} (score: ${candidate.score.toFixed(2)})`
        );
      } catch (error) {
        this.context.logger.warn?.(
          `Failed to promote memory ${candidate.id.slice(0, 8)}: ${String(error)}`
        );
      }
    }

    return promotions;
  }

  /**
   * Infer tier based on candidate score
   */
  private inferTier(candidate: DreamingCandidate): "core" | "working" | "peripheral" {
    if (candidate.score >= 0.9) return "core";
    if (candidate.score >= 0.85) return "working";
    return "peripheral";
  }

  /**
   * Generate MEMORY.md suggestions from promotions
   */
  private generateMemorySuggestions(promotions: PromotionRecord[]): MemorySuggestion[] {
    return promotions.map((p) => ({
      type: p.candidate.category === "decision" ? "decision" : "fact",
      title: this.extractTitle(p.candidate.text),
      text: p.candidate.text,
      source: "dreaming-deep" as const,
      score: p.candidate.score,
      recallCount: p.candidate.recallCount,
      candidateId: p.candidate.id,
      suggestedLocation: p.candidate.category === "decision"
        ? "决策部分"
        : "事实部分",
    }));
  }

  /**
   * Extract title from text
   */
  private extractTitle(text: string): string {
    const firstLine = text.split("\n")[0].trim();
    return firstLine.length > 60 ? `${firstLine.slice(0, 59).trimEnd()}…` : firstLine;
  }

  /**
   * Write Deep phase output
   */
  private async writeDeepOutput(
    promotions: PromotionRecord[],
    suggestions: MemorySuggestion[]
  ): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].split(".")[0];

    const outputDir = join(this.context.workspaceDir, "memory", "dreaming", "deep");
    await mkdir(outputDir, { recursive: true });

    const outputPath = join(outputDir, `${date}.md`);

    const lines: string[] = [
      `## ${date} ${time} UTC`,
      "",
      `- Agent: dreaming-engine`,
      `- Phase: deep`,
      `- Promotions: ${promotions.length}`,
      "",
      "### Promotions",
      "",
    ];

    promotions.forEach((p, index) => {
      lines.push(`#### ${index + 1}. [${p.candidate.category}] ${this.extractTitle(p.candidate.text)}`);
      lines.push("");
      lines.push(`- **Score**: ${p.candidate.score.toFixed(2)}`);
      lines.push(`- **Recall Count**: ${p.candidate.recallCount}`);
      lines.push(`- **Memory ID**: \`${p.memoryId.slice(0, 8)}\``);
      lines.push(`- **Promoted to**: durable layer`);
      lines.push("");
    });

    if (suggestions.length > 0) {
      lines.push("### MEMORY.md Suggestions");
      lines.push("");
      lines.push("The following memories are suggested for MEMORY.md:");
      lines.push("");

      suggestions.forEach((s) => {
        lines.push(`#### ${s.type}: ${s.title}`);
        lines.push("");
        lines.push(s.text.length > 320 ? `${s.text.slice(0, 319).trimEnd()}…` : s.text);
        lines.push("");
        lines.push(`**Score**: ${s.score.toFixed(2)}  `);
        lines.push(`**Suggested for**: ${s.suggestedLocation}`);
        lines.push("");
      });
    }

    // Append to existing file
    const existing = await this.readExistingFile(outputPath);
    const content = existing
      ? `${existing}\n\n${lines.join("\n")}\n`
      : `# Deep Sleep\n\n${lines.join("\n")}\n`;

    await writeFile(outputPath, content, "utf8");
    this.context.logger.info(`Wrote deep phase output to ${outputPath}`);
  }

  /**
   * Read existing file content
   */
  private async readExistingFile(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch {
      return "";
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDeepPhaseEngine(context: DreamingEngineContext): DeepPhaseEngine {
  return new DeepPhaseEngine(context);
}

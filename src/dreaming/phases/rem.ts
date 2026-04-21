/**
 * REM Phase Engine
 * 
 * Identifies patterns across memories and generates reflections using LLM.
 * 
 * Output: memory/dreaming/rem/YYYY-MM-DD.md
 * 
 * Pattern Types:
 * - Topic clustering: Group related memories by theme
 * - Association: Find connections between disparate memories
 * - Trend: Identify temporal patterns or recurring themes
 * - Anomaly: Detect unusual patterns or outliers
 */

import type {
  DreamingEngineContext,
  DreamingResult,
  RemPhaseResult,
  DreamingCandidate,
  RemPhaseConfig,
  Pattern,
  Reflection,
} from "../types.js";
import { join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<RemPhaseConfig> = {
  enabled: true,
  cron: "0 5 * * 0", // Weekly on Sunday at 5:00
  lookbackDays: 7,
  limit: 10,
  minPatternStrength: 0.75,
};

// ============================================================================
// REM Phase Engine
// ============================================================================

export class RemPhaseEngine {
  private context: DreamingEngineContext;
  private config: Required<RemPhaseConfig>;

  constructor(context: DreamingEngineContext) {
    this.context = context;
    this.config = {
      ...DEFAULT_CONFIG,
      ...(context.config.phases.rem || {}),
    } as Required<RemPhaseConfig>;
  }

  /**
   * Execute REM phase
   */
  async execute(): Promise<RemPhaseResult> {
    const startTime = Date.now();

    this.context.logger.info("Starting REM phase execution");

    try {
      // Step 1: Load Light and Deep phase outputs
      const memories = await this.loadRecentMemories();
      this.context.logger.info(`Loaded ${memories.length} memories for pattern analysis`);

      // Step 2: Identify patterns
      const patterns = await this.identifyPatterns(memories);
      this.context.logger.info(`Identified ${patterns.length} patterns`);

      // Step 3: Generate reflections for strong patterns
      const reflections = await this.generateReflections(patterns);
      this.context.logger.info(`Generated ${reflections.length} reflections`);

      // Step 4: Write output
      await this.writeRemOutput(patterns, reflections);

      const result: RemPhaseResult = {
        phase: "rem",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        processed: memories.length,
        patternsIdentified: patterns.length,
        reflectionsGenerated: reflections.length,
        patterns,
        reflections,
        summary: `Analyzed ${memories.length} memories, found ${patterns.length} patterns, generated ${reflections.length} reflections`,
      };

      this.context.logger.info(
        `REM phase completed: ${result.duration}ms, ${result.patternsIdentified} patterns, ${result.reflectionsGenerated} reflections`
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.context.logger.error?.(`REM phase failed: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Load recent memories from Light and Deep phases
   */
  private async loadRecentMemories(): Promise<DreamingCandidate[]> {
    const memories: DreamingCandidate[] = [];

    // Load from Light phase
    for (let i = 0; i < this.config.lookbackDays; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      
      // Light phase
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
        memories.push(...parsed);
      } catch {
        // File doesn't exist
      }

      // Deep phase
      const deepPath = join(
        this.context.workspaceDir,
        "memory",
        "dreaming",
        "deep",
        `${date}.md`
      );

      try {
        const content = await readFile(deepPath, "utf8");
        const parsed = this.parseDeepOutput(content);
        memories.push(...parsed);
      } catch {
        // File doesn't exist
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    return memories.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  /**
   * Parse Light phase output
   */
  private parseLightOutput(content: string): DreamingCandidate[] {
    const sectionPattern = /#### \d+\. \[([^\]]+)\] (.+?)\n\n([\s\S?]+?)(?=\n#### |\n### |$)/g;
    const candidates: DreamingCandidate[] = [];

    let match;
    while ((match = sectionPattern.exec(content)) !== null) {
      const category = match[1];
      const title = match[2];
      const body = match[3];

      const scoreMatch = body.match(/\*\*Score\*\*:\s*([\d.]+)/);
      const idMatch = body.match(/\*\*ID\*\*:\s*`([^`]+)`/);
      const textMatch = body.split("\n\n").slice(1).join("\n\n").trim();

      if (idMatch) {
        candidates.push({
          id: idMatch[1],
          category: category as DreamingCandidate["category"],
          scope: "global",
          text: textMatch || title,
          importance: 0.5,
          recallCount: 0,
          uniqueQueries: 1,
          lastRecallAt: Date.now(),
          createdAt: Date.now(),
          score: parseFloat(scoreMatch?.[1] || "0.5"),
        });
      }
    }

    return candidates;
  }

  /**
   * Parse Deep phase output
   */
  private parseDeepOutput(content: string): DreamingCandidate[] {
    const sectionPattern = /#### \d+\. \[([^\]]+)\] (.+?)\n\n([\s\S?]+?)(?=\n#### |\n### |$)/g;
    const candidates: DreamingCandidate[] = [];

    let match;
    while ((match = sectionPattern.exec(content)) !== null) {
      const category = match[1];
      const title = match[2];
      const body = match[3];

      const scoreMatch = body.match(/\*\*Score\*\*:\s*([\d.]+)/);
      const idMatch = body.match(/\*\*Memory ID\*\*:\s*`([^`]+)`/);
      const textMatch = body.split("\n\n").slice(1).join("\n\n").trim();

      if (idMatch) {
        candidates.push({
          id: idMatch[1],
          category: category as DreamingCandidate["category"],
          scope: "global",
          text: textMatch || title,
          importance: 0.8, // Promoted memories are more important
          recallCount: 0,
          uniqueQueries: 1,
          lastRecallAt: Date.now(),
          createdAt: Date.now(),
          score: parseFloat(scoreMatch?.[1] || "0.8"),
        });
      }
    }

    return candidates;
  }

  /**
   * Identify patterns across memories
   */
  private async identifyPatterns(memories: DreamingCandidate[]): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Pattern 1: Topic clustering
    const topicPatterns = await this.clusterByTopic(memories);
    patterns.push(...topicPatterns);

    // Pattern 2: Category trends
    const categoryPatterns = this.identifyCategoryTrends(memories);
    patterns.push(...categoryPatterns);

    // Pattern 3: Temporal patterns
    const temporalPatterns = this.identifyTemporalPatterns(memories);
    patterns.push(...temporalPatterns);

    // Filter by minimum strength
    return patterns.filter((p) => p.strength >= this.config.minPatternStrength);
  }

  /**
   * Cluster memories by topic using keyword extraction
   */
  private async clusterByTopic(memories: DreamingCandidate[]): Promise<Pattern[]> {
    const topicMap = new Map<string, DreamingCandidate[]>();

    // Extract keywords from each memory
    for (const memory of memories) {
      const keywords = this.extractKeywords(memory.text);
      
      for (const keyword of keywords) {
        if (!topicMap.has(keyword)) {
          topicMap.set(keyword, []);
        }
        topicMap.get(keyword)!.push(memory);
      }
    }

    // Convert to patterns
    const patterns: Pattern[] = [];
    for (const [topic, items] of topicMap) {
      if (items.length >= 2) {
        // Need at least 2 memories to form a pattern
        patterns.push({
          id: `topic-${topic}-${Date.now()}`,
          name: `Topic: ${topic}`,
          type: "topic",
          strength: Math.min(1.0, items.length / 10), // 10 items = max strength
          memories: items.slice(0, 5), // Limit to 5 examples
          keywords: [topic],
        });
      }
    }

    return patterns.sort((a, b) => b.strength - a.strength).slice(0, 10);
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "shall", "can", "need", "dare",
      "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
      "from", "as", "into", "through", "during", "before", "after",
      "above", "below", "between", "under", "again", "further", "then",
      "once", "here", "there", "when", "where", "why", "how", "all", "each",
      "few", "more", "most", "other", "some", "such", "no", "nor", "not",
      "only", "own", "same", "so", "than", "too", "very", "just", "and",
      "but", "if", "or", "because", "until", "while", "about", "against",
      "的", "了", "是", "在", "有", "和", "与", "或", "这", "那", "个", "些",
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    // Get unique words with frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Return top keywords
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Identify category trends
   */
  private identifyCategoryTrends(memories: DreamingCandidate[]): Pattern[] {
    const categoryCount = new Map<string, number>();

    for (const memory of memories) {
      categoryCount.set(
        memory.category,
        (categoryCount.get(memory.category) || 0) + 1
      );
    }

    const patterns: Pattern[] = [];
    const total = memories.length;

    for (const [category, count] of categoryCount) {
      const ratio = count / total;
      if (ratio >= 0.2) {
        // Category represents at least 20% of memories
        patterns.push({
          id: `category-${category}-${Date.now()}`,
          name: `Category trend: ${category}`,
          type: "trend",
          strength: ratio,
          memories: memories.filter((m) => m.category === category).slice(0, 5),
          keywords: [category],
        });
      }
    }

    return patterns;
  }

  /**
   * Identify temporal patterns
   */
  private identifyTemporalPatterns(memories: DreamingCandidate[]): Pattern[] {
    // Group by date
    const dateCount = new Map<string, number>();

    for (const memory of memories) {
      const date = new Date(memory.createdAt).toISOString().split("T")[0];
      dateCount.set(date, (dateCount.get(date) || 0) + 1);
    }

    // Check for trends
    const dates = Array.from(dateCount.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    if (dates.length >= 3) {
      // Check for increasing trend
      const recent = dates.slice(-3);
      const isIncreasing = recent[0][1] < recent[1][1] && recent[1][1] < recent[2][1];

      if (isIncreasing) {
        return [{
          id: `temporal-increasing-${Date.now()}`,
          name: "Temporal pattern: Increasing activity",
          type: "trend",
          strength: 0.8,
          memories: memories.slice(0, 5),
          keywords: ["increasing", "growth"],
        }];
      }
    }

    return [];
  }

  /**
   * Generate reflections using LLM
   */
  private async generateReflections(patterns: Pattern[]): Promise<Reflection[]> {
    const reflections: Reflection[] = [];

    // Limit to configured max
    const patternsToProcess = patterns.slice(0, this.config.limit);

    for (const pattern of patternsToProcess) {
      try {
        const reflection = await this.generateReflection(pattern);
        if (reflection) {
          reflections.push(reflection);
        }
      } catch (error) {
        this.context.logger.warn?.(
          `Failed to generate reflection for pattern ${pattern.name}: ${String(error)}`
        );
      }
    }

    return reflections;
  }

  /**
   * Generate a single reflection for a pattern
   */
  private async generateReflection(pattern: Pattern): Promise<Reflection | null> {
    // Check if LLM client is available
    if (!this.context.llmClient) {
      // Generate reflection without LLM
      return this.generateSimpleReflection(pattern);
    }

    try {
      const prompt = this.buildReflectionPrompt(pattern);
      
      // Use LLM client to generate reflection
      const response = await this.context.llmClient.complete(prompt);
      const text = typeof response === "string" ? response : String(response);

      return {
        id: `reflection-${pattern.id}`,
        pattern,
        text: text.trim(),
        timestamp: Date.now(),
      };
    } catch (error) {
      this.context.logger.warn?.(`LLM reflection failed, falling back to simple: ${String(error)}`);
      return this.generateSimpleReflection(pattern);
    }
  }

  /**
   * Generate simple reflection without LLM
   */
  private generateSimpleReflection(pattern: Pattern): Reflection {
    const memoryExamples = pattern.memories
      .slice(0, 3)
      .map((m) => `- ${m.text.slice(0, 100)}${m.text.length > 100 ? "…" : ""}`)
      .join("\n");

    return {
      id: `reflection-${pattern.id}`,
      pattern,
      text: `Pattern "${pattern.name}" detected with strength ${pattern.strength.toFixed(2)}.\n\n` +
        `This pattern represents a recurring theme across ${pattern.memories.length} memories.\n\n` +
        `Examples:\n${memoryExamples}`,
      timestamp: Date.now(),
    };
  }

  /**
   * Build reflection prompt for LLM
   */
  private buildReflectionPrompt(pattern: Pattern): string {
    const memoryExamples = pattern.memories
      .slice(0, 3)
      .map((m) => `- ${m.text}`)
      .join("\n");

    return `You are the reflection subsystem of an AI agent's memory system.

Based on the following pattern, generate a deep reflection:

**Pattern**: ${pattern.name}
**Type**: ${pattern.type}
**Strength**: ${pattern.strength.toFixed(2)}

**Related Memories**:
${memoryExamples}

Please reflect on:
1. What does this pattern reveal about the user's needs or preferences?
2. Are there any blind spots or cognitive biases?
3. What can be improved in how I serve the user?
4. Any new understanding about the user?

Write a thoughtful reflection in 150-250 words. Be introspective and genuine.`;
  }

  /**
   * Write REM phase output
   */
  private async writeRemOutput(
    patterns: Pattern[],
    reflections: Reflection[]
  ): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].split(".")[0];

    const outputDir = join(this.context.workspaceDir, "memory", "dreaming", "rem");
    await mkdir(outputDir, { recursive: true });

    const outputPath = join(outputDir, `${date}.md`);

    const lines: string[] = [
      `## ${date} ${time} UTC`,
      "",
      `- Agent: dreaming-engine`,
      `- Phase: rem`,
      `- Patterns: ${patterns.length}`,
      `- Reflections: ${reflections.length}`,
      "",
      "### Patterns Identified",
      "",
    ];

    patterns.slice(0, 10).forEach((p, index) => {
      lines.push(`#### ${index + 1}. ${p.name}`);
      lines.push("");
      lines.push(`- **Type**: ${p.type}`);
      lines.push(`- **Strength**: ${p.strength.toFixed(2)}`);
      lines.push(`- **Memory Count**: ${p.memories.length}`);
      lines.push(`- **Keywords**: ${p.keywords.join(", ")}`);
      lines.push("");
    });

    if (reflections.length > 0) {
      lines.push("### Reflections");
      lines.push("");

      reflections.forEach((r, index) => {
        lines.push(`#### Reflection ${index + 1}: ${r.pattern.name}`);
        lines.push("");
        lines.push(r.text);
        lines.push("");
      });
    }

    // Append to existing file
    const existing = await this.readExistingFile(outputPath);
    const content = existing
      ? `${existing}\n\n${lines.join("\n")}\n`
      : `# REM Sleep\n\n${lines.join("\n")}\n`;

    await writeFile(outputPath, content, "utf8");
    this.context.logger.info(`Wrote REM phase output to ${outputPath}`);
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

export function createRemPhaseEngine(context: DreamingEngineContext): RemPhaseEngine {
  return new RemPhaseEngine(context);
}

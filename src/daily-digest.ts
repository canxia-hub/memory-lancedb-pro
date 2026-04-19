/**
 * Daily Digest - 日终整理流程
 *
 * 从 dreaming 输出生成 complete.md 和 highlights.md，尽量对齐既有记忆归档格式。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "winston";

interface DigestOptions {
  workspaceDir: string;
  date?: string; // YYYY-MM-DD format, defaults to today
  logger?: Logger;
}

interface DreamSection {
  timestamp: string; // YYYY-MM-DD HH:MM:SS UTC
  date: string;
  time: string;
  meta: Record<string, string>;
  body: string;
}

interface SessionSummary {
  date: string;
  time: string;
  agent: string;
  source: string;
  sessionKey?: string;
  sessionId?: string;
  topic: string;
  points: string[];
}

interface PromotionRecord {
  id: string;
  category: string;
  scope: string;
  importance?: string;
  sourcePath?: string;
  title: string;
  content: string;
}

interface RemDigest {
  patterns: string[];
  reflections: string[];
}

async function readPhaseReport(
  workspaceDir: string,
  phase: "light" | "rem" | "deep",
  date: string,
): Promise<string> {
  const path = join(workspaceDir, "memory", "dreaming", phase, `${date}.md`);
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function trimTrailingEmpty(lines: string[]): string[] {
  const copy = [...lines];
  while (copy.length > 0 && copy[copy.length - 1].trim().length === 0) {
    copy.pop();
  }
  return copy;
}

function parseDreamSections(content: string): DreamSection[] {
  if (!content.trim()) return [];
  const headingPattern = /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC\r?$/gm;
  const matches = [...content.matchAll(headingPattern)];
  if (matches.length === 0) return [];

  const sections: DreamSection[] = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const next = matches[i + 1];
    const date = current[1];
    const time = current[2];
    const start = (current.index ?? 0) + current[0].length;
    const end = next?.index ?? content.length;
    const block = content.slice(start, end).trim();
    const lines = block.split(/\r?\n/);
    const meta: Record<string, string> = {};
    let bodyStart = lines.findIndex((line) => line.trim() === "");
    if (bodyStart === -1) bodyStart = lines.length;
    for (const line of lines.slice(0, bodyStart)) {
      const m = line.match(/^-\s*([^:]+):\s*(.*)$/);
      if (!m) continue;
      meta[m[1].trim()] = m[2].trim();
    }
    const body = trimTrailingEmpty(lines.slice(Math.min(bodyStart + 1, lines.length))).join("\n").trim();
    sections.push({
      timestamp: `${date} ${time} UTC`,
      date,
      time,
      meta,
      body,
    });
  }
  return sections;
}

function isDigestNoiseLine(line: string): boolean {
  const normalized = line.trim();
  const withoutRole = normalized.replace(/^(user|assistant|system):\s*/i, "").trim();
  if (!withoutRole) return true;
  if (/^Sender \(untrusted metadata\):$/i.test(withoutRole)) return true;
  if (/^System(?: \(untrusted\))?:/i.test(withoutRole)) return true;
  if (/^Current time:/i.test(withoutRole)) return true;
  if (/^A new session was started via \/new or \/reset/i.test(withoutRole)) return true;
  if (/^Continue where you left off\./i.test(withoutRole)) return true;
  if (/^The previous model attempt failed or timed out\./i.test(withoutRole)) return true;
  if (/^You are running a boot check\./i.test(withoutRole)) return true;
  if (/^Do not mention internal steps, files, tools, or reasoning\./i.test(withoutRole)) return true;
  if (/^NO_REPLY$/i.test(withoutRole)) return true;
  if (/^\[[A-Z][a-z]{2} \d{4}-\d{2}-\d{2} .*GMT[+-]\d+\]/.test(withoutRole)) return true;
  return false;
}

function extractConversationLines(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const result: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^`{3,}/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || isDigestNoiseLine(trimmed)) continue;
    result.push(trimmed);
  }
  return result;
}

function buildConversationPoints(body: string): string[] {
  const rawLines = extractConversationLines(body);
  const tagged = rawLines.filter((line) => /^(user|assistant|system):/i.test(line));
  const source = tagged.length > 0 ? tagged : rawLines;
  const points: string[] = [];
  const seen = new Set<string>();
  for (const line of source) {
    const normalized = line.replace(/^(user|assistant|system):\s*/i, "").replace(/\s+/g, " ").trim();
    if (!normalized || isDigestNoiseLine(normalized)) continue;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    points.push(normalized.length > 140 ? `${normalized.slice(0, 139).trimEnd()}…` : normalized);
    if (points.length >= 5) break;
  }
  return points;
}

function deriveTopic(body: string): string {
  const lines = extractConversationLines(body);
  const preferred = lines.find((line) => /^user:/i.test(line))
    ?? lines.find((line) => /^(user|assistant):/i.test(line))
    ?? lines[0]
    ?? "";
  const candidate = preferred.replace(/^(user|assistant|system):\s*/i, "").replace(/\s+/g, " ").trim();
  if (!candidate) return "未命名主题";
  return candidate.length > 48 ? `${candidate.slice(0, 47).trimEnd()}…` : candidate;
}

function parseLightReport(content: string): SessionSummary[] {
  return parseDreamSections(content)
    .filter((section) => section.body.length > 0)
    .map((section) => ({
      date: section.date,
      time: section.time,
      agent: section.meta["Agent"] ?? "unknown",
      source: section.meta["Source"] ?? "unknown",
      sessionKey: section.meta["Session Key"],
      sessionId: section.meta["Session ID"],
      topic: deriveTopic(section.body),
      points: buildConversationPoints(section.body),
    }));
}

function parseDeepReport(content: string): PromotionRecord[] {
  return parseDreamSections(content)
    .filter((section) => section.body.length > 0)
    .map((section) => ({
      id: (section.meta["Memory ID"] ?? "unknown").replace(/`/g, "").slice(0, 8),
      category: section.meta["Category"] ?? "other",
      scope: section.meta["Scope"] ?? "unknown",
      importance: section.meta["Importance"],
      sourcePath: section.meta["Source"]?.replace(/`/g, ""),
      title: deriveTopic(section.body),
      content: section.body,
    }));
}

function parseRemReport(content: string): RemDigest {
  const patterns: string[] = [];
  const reflections: string[] = [];
  for (const section of parseDreamSections(content)) {
    if (!section.body) continue;
    const lines = section.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const explicitPatterns = lines.filter((line) => /^(?:[-*]\s*)?(Pattern:|模式[:：])/i.test(line));
    const explicitReflections = lines.filter((line) => /^(?:[-*]\s*)?(Reflection:|反思[:：])/i.test(line));
    if (explicitPatterns.length > 0) {
      patterns.push(...explicitPatterns.map((line) => line.replace(/^(?:[-*]\s*)?(Pattern:|模式[:：])\s*/i, "").trim()));
    }
    if (explicitReflections.length > 0) {
      reflections.push(...explicitReflections.map((line) => line.replace(/^(?:[-*]\s*)?(Reflection:|反思[:：])\s*/i, "").trim()));
    }
    if (explicitPatterns.length === 0 && explicitReflections.length === 0) {
      const paragraphs = section.body.split(/\n\n+/).map((part) => part.trim()).filter((part) => part.length > 20);
      reflections.push(...paragraphs.slice(0, 3));
    }
  }
  return { patterns, reflections };
}

function todayLocalDate(): string {
  return new Date().toISOString().split("T")[0];
}

function buildRelativeSourceLink(date: string): string {
  const [year, month] = date.split("-");
  return `../dreaming/${year}-${month}`;
}

function generateCompleteMarkdown(
  date: string,
  sessions: SessionSummary[],
  promotions: PromotionRecord[],
  rem: RemDigest,
): string {
  const lines: string[] = [
    `# ${date} 完整记录`,
    "",
    `**归档日期**: ${todayLocalDate()}  `,
    `**来源**: Dreaming Daily Digest  `,
    `**Dreaming 目录**: \`memory/dreaming/\``,
    "",
    "---",
    "",
  ];

  if (sessions.length > 0) {
    lines.push("## 会话整理", "");
    sessions.forEach((session, index) => {
      lines.push(`### ${index + 1}. ${session.topic}`);
      lines.push("");
      lines.push(`**时间**: ${session.date} ${session.time} UTC  `);
      lines.push(`**Agent**: ${session.agent}  `);
      lines.push(`**来源**: ${session.source}  `);
      if (session.sessionId) lines.push(`**Session ID**: ${session.sessionId}  `);
      if (session.sessionKey) lines.push(`**Session Key**: ${session.sessionKey}`);
      lines.push("");
      lines.push("**要点**:");
      for (const point of session.points) {
        lines.push(`- ${point}`);
      }
      lines.push("", "---", "");
    });
  }

  if (promotions.length > 0) {
    lines.push("## 稳定结论与晋升", "");
    promotions.forEach((promotion, index) => {
      lines.push(`### ${index + 1}. ${promotion.title}`);
      lines.push("");
      lines.push(`- **类别**: ${promotion.category}`);
      lines.push(`- **Scope**: ${promotion.scope}`);
      if (promotion.importance) lines.push(`- **Importance**: ${promotion.importance}`);
      if (promotion.sourcePath) lines.push(`- **Source**: \`${promotion.sourcePath}\``);
      lines.push(`- **Memory ID**: \`${promotion.id}\``);
      lines.push("");
      lines.push(promotion.content.length > 320 ? `${promotion.content.slice(0, 319).trimEnd()}…` : promotion.content);
      lines.push("", "---", "");
    });
  }

  if (rem.patterns.length > 0 || rem.reflections.length > 0) {
    lines.push("## 模式与反思", "");
    if (rem.patterns.length > 0) {
      lines.push("### 发现的模式", "");
      rem.patterns.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
    if (rem.reflections.length > 0) {
      lines.push("### 反思摘录", "");
      rem.reflections.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
  }

  lines.push("*本文件由 Dreaming Daily Digest 自动生成*", "");
  return lines.join("\n");
}

function generateHighlightsMarkdown(
  date: string,
  sessions: SessionSummary[],
  promotions: PromotionRecord[],
  rem: RemDigest,
): string {
  const lines: string[] = [
    `# ${date} 重点摘要`,
    "",
    `**归档日期**: ${todayLocalDate()}  `,
    `**来源**: Dreaming Daily Digest`,
    "",
    "---",
    "",
  ];

  if (sessions.length > 0) {
    lines.push("## 核心事件", "");
    sessions.slice(0, 3).forEach((session) => {
      lines.push(`### ${session.topic}`, "");
      session.points.slice(0, 4).forEach((point) => lines.push(`- ${point}`));
      lines.push("");
    });
  }

  if (promotions.length > 0) {
    lines.push("## 关键结论", "");
    promotions.slice(0, 5).forEach((promotion) => {
      lines.push(`- **${promotion.category}** · ${promotion.title}`);
    });
    lines.push("");
  }

  if (rem.patterns.length > 0 || rem.reflections.length > 0) {
    lines.push("## 反思沉淀", "");
    rem.patterns.slice(0, 3).forEach((pattern) => lines.push(`- 模式：${pattern}`));
    rem.reflections.slice(0, 3).forEach((reflection) => lines.push(`- 反思：${reflection.length > 120 ? `${reflection.slice(0, 119).trimEnd()}…` : reflection}`));
    lines.push("");
  }

  lines.push("*本文件由 Dreaming Daily Digest 自动生成*", "");
  return lines.join("\n");
}

export async function runDailyDigest(options: DigestOptions): Promise<{
  completePath: string;
  highlightsPath: string;
  sessionCount: number;
  decisionCount: number;
  patternCount: number;
  reflectionCount: number;
}> {
  const { workspaceDir, date: inputDate, logger } = options;
  const date = inputDate || todayLocalDate();
  const [year, month] = date.split("-");
  const monthDir = `${year}-${month}`;

  logger?.info(`daily-digest: starting for ${date}`);
  const lightContent = await readPhaseReport(workspaceDir, "light", date);
  const remContent = await readPhaseReport(workspaceDir, "rem", date);
  const deepContent = await readPhaseReport(workspaceDir, "deep", date);
  logger?.info(`daily-digest: light=${lightContent.length} chars, rem=${remContent.length} chars, deep=${deepContent.length} chars`);

  const sessions = parseLightReport(lightContent);
  const remData = parseRemReport(remContent);
  const promotions = parseDeepReport(deepContent);
  logger?.info(`daily-digest: parsed ${sessions.length} sessions, ${promotions.length} promotions, ${remData.patterns.length} patterns, ${remData.reflections.length} reflections`);

  const completeMd = generateCompleteMarkdown(date, sessions, promotions, remData);
  const highlightsMd = generateHighlightsMarkdown(date, sessions, promotions, remData);

  const memoryDir = join(workspaceDir, "memory", monthDir);
  await mkdir(memoryDir, { recursive: true });

  const completePath = join(memoryDir, `${date}-complete.md`);
  const highlightsPath = join(memoryDir, `${date}-highlights.md`);
  await writeFile(completePath, `${completeMd}\n`, "utf8");
  await writeFile(highlightsPath, `${highlightsMd}\n`, "utf8");

  logger?.info(`daily-digest: wrote ${completePath} and ${highlightsPath}`);
  return {
    completePath,
    highlightsPath,
    sessionCount: sessions.length,
    decisionCount: promotions.length,
    patternCount: remData.patterns.length,
    reflectionCount: remData.reflections.length,
  };
}

export function createDailyDigestCronHandler(options: {
  workspaceDir: string;
  logger?: Logger;
}) {
  return async () => {
    try {
      const result = await runDailyDigest({
        workspaceDir: options.workspaceDir,
        logger: options.logger,
      });
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      options.logger?.error(`daily-digest: failed: ${String(error)}`);
      return {
        success: false,
        error: String(error),
      };
    }
  };
}

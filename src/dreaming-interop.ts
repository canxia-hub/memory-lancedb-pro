import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { appendMemoryHostEvent } from "openclaw/plugin-sdk/memory-host-events";
import {
  replaceManagedMarkdownBlock,
  withTrailingNewline,
} from "openclaw/plugin-sdk/memory-host-markdown";
import { parseSmartMetadata } from "./smart-metadata.js";
import type { MemoryEntry } from "./store.js";

interface LoggerLike {
  debug?(message: string): void;
  warn?(message: string): void;
}

export interface DreamingInteropWriter {
  recordLightSessionSummary(params: {
    workspaceDir?: string;
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    source?: string;
    summaryText: string;
    timestampMs?: number;
  }): Promise<void>;
  recordRemReflection(params: {
    workspaceDir?: string;
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    sourceReflectionPath: string;
    reflectionText: string;
    timestampMs?: number;
  }): Promise<void>;
  recordDeepPromotion(params: {
    workspaceDir?: string;
    agentId?: string;
    entry: MemoryEntry;
    state?: string;
    layer?: string;
    timestampMs?: number;
  }): Promise<void>;
}

const DREAMS_FILE_NAME = "DREAMS.md";
const MAX_INLINE_SUMMARY_ITEMS = 12;

const PHASE_BLOCKS = {
  light: {
    heading: "## Light Sleep",
    startMarker: "<!-- openclaw:dreaming:light:start -->",
    endMarker: "<!-- openclaw:dreaming:light:end -->",
  },
  rem: {
    heading: "## REM Sleep",
    startMarker: "<!-- openclaw:dreaming:rem:start -->",
    endMarker: "<!-- openclaw:dreaming:rem:end -->",
  },
  deep: {
    heading: "## Deep Sleep",
    startMarker: "<!-- openclaw:dreaming:deep:start -->",
    endMarker: "<!-- openclaw:dreaming:deep:end -->",
  },
} as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function ensureParentDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

function toIsoParts(timestampMs?: number): {
  nowMs: number;
  iso: string;
  date: string;
  time: string;
} {
  const nowMs = Number.isFinite(timestampMs) ? Number(timestampMs) : Date.now();
  const iso = new Date(nowMs).toISOString();
  const [date, rest] = iso.split("T");
  const time = rest.replace("Z", "").split(".")[0];
  return { nowMs, iso, date, time };
}

function trimLines(text: string, maxLines: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  return lines.slice(0, maxLines).join("\n");
}

function buildPreviewLine(text: string, maxChars = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function extractManagedBlockBody(original: string, startMarker: string, endMarker: string): string {
  const pattern = new RegExp(`${escapeRegExp(startMarker)}\\n?([\\s\\S]*?)\\n?${escapeRegExp(endMarker)}`);
  const match = original.match(pattern);
  return match?.[1]?.trim() ?? "";
}

async function updateDreamsInlineSummary(params: {
  workspaceDir: string;
  phase: keyof typeof PHASE_BLOCKS;
  entryLine: string;
}): Promise<string> {
  const dreamsPath = join(params.workspaceDir, DREAMS_FILE_NAME);
  await ensureParentDir(dreamsPath);
  const original = await readTextIfExists(dreamsPath);
  const block = PHASE_BLOCKS[params.phase];
  const existingLines = extractManagedBlockBody(original, block.startMarker, block.endMarker)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const nextLines = [params.entryLine, ...existingLines.filter((line) => line !== params.entryLine)]
    .slice(0, MAX_INLINE_SUMMARY_ITEMS);
  const updated = replaceManagedMarkdownBlock({
    original,
    heading: block.heading,
    startMarker: block.startMarker,
    endMarker: block.endMarker,
    body: nextLines.join("\n"),
  });
  await writeFile(dreamsPath, withTrailingNewline(updated), "utf8");
  return dreamsPath;
}

async function appendPhaseReport(params: {
  workspaceDir: string;
  phase: "light" | "rem" | "deep";
  date: string;
  section: string;
}): Promise<string> {
  const reportPath = join(params.workspaceDir, "memory", "dreaming", params.phase, `${params.date}.md`);
  await ensureParentDir(reportPath);
  const existing = await readTextIfExists(reportPath);
  const title = params.phase === "light"
    ? "# Light Sleep"
    : params.phase === "rem"
      ? "# REM Sleep"
      : "# Deep Sleep";
  const body = existing.trim().length > 0
    ? `${existing.trimEnd()}\n\n${params.section.trim()}\n`
    : `${title}\n\n${params.section.trim()}\n`;
  await writeFile(reportPath, withTrailingNewline(body), "utf8");
  return reportPath;
}

export function createDreamingInteropWriter(params: {
  logger?: LoggerLike;
}): DreamingInteropWriter {
  return {
    async recordLightSessionSummary({
      workspaceDir,
      agentId,
      sessionKey,
      sessionId,
      source,
      summaryText,
      timestampMs,
    }): Promise<void> {
      if (!workspaceDir || !summaryText.trim()) return;
      const { iso, date, time } = toIsoParts(timestampMs);
      try {
        const preview = buildPreviewLine(summaryText, 180);
        const inlinePath = await updateDreamsInlineSummary({
          workspaceDir,
          phase: "light",
          entryLine: `- ${date} ${time} UTC, ${agentId || "unknown"}, session ${sessionId || "unknown"}, source ${source || "unknown"}: ${preview}`,
        });
        const section = [
          `## ${date} ${time} UTC`,
          `- Agent: ${agentId || "unknown"}`,
          `- Session Key: ${sessionKey || "unknown"}`,
          `- Session ID: ${sessionId || "unknown"}`,
          `- Source: ${source || "unknown"}`,
          "",
          trimLines(summaryText, 80),
        ].join("\n");
        const reportPath = await appendPhaseReport({
          workspaceDir,
          phase: "light",
          date,
          section,
        });
        await appendMemoryHostEvent(workspaceDir, {
          type: "memory.dream.completed",
          timestamp: iso,
          phase: "light",
          inlinePath,
          reportPath,
          lineCount: trimLines(summaryText, 80).split(/\r?\n/).filter(Boolean).length,
          storageMode: "both",
        });
      } catch (error) {
        params.logger?.warn?.(`memory-lancedb-pro: failed to record light dreaming interop: ${String(error)}`);
      }
    },

    async recordRemReflection({
      workspaceDir,
      agentId,
      sessionKey,
      sessionId,
      sourceReflectionPath,
      reflectionText,
      timestampMs,
    }): Promise<void> {
      if (!workspaceDir || !reflectionText.trim()) return;
      const { iso, date, time } = toIsoParts(timestampMs);
      try {
        const preview = buildPreviewLine(reflectionText, 180);
        const inlinePath = await updateDreamsInlineSummary({
          workspaceDir,
          phase: "rem",
          entryLine: `- ${date} ${time} UTC, ${agentId || "unknown"}, session ${sessionId || "unknown"}, source \`${sourceReflectionPath}\`: ${preview}`,
        });
        const section = [
          `## ${date} ${time} UTC`,
          `- Agent: ${agentId || "unknown"}`,
          `- Session Key: ${sessionKey || "unknown"}`,
          `- Session ID: ${sessionId || "unknown"}`,
          `- Source Reflection: \`${sourceReflectionPath}\``,
          "",
          trimLines(reflectionText, 120),
        ].join("\n");
        const reportPath = await appendPhaseReport({
          workspaceDir,
          phase: "rem",
          date,
          section,
        });
        await appendMemoryHostEvent(workspaceDir, {
          type: "memory.dream.completed",
          timestamp: iso,
          phase: "rem",
          inlinePath,
          reportPath,
          lineCount: trimLines(reflectionText, 120).split(/\r?\n/).filter(Boolean).length,
          storageMode: "both",
        });
      } catch (error) {
        params.logger?.warn?.(`memory-lancedb-pro: failed to record REM dreaming interop: ${String(error)}`);
      }
    },

    async recordDeepPromotion({
      workspaceDir,
      agentId,
      entry,
      state,
      layer,
      timestampMs,
    }): Promise<void> {
      if (!workspaceDir) return;
      if (state && state !== "confirmed") return;
      if (layer && layer !== "durable") return;
      const { iso, date, time } = toIsoParts(timestampMs ?? entry.timestamp);
      try {
        const metadata = parseSmartMetadata(entry.metadata, entry) as Record<string, unknown>;
        const sourcePath = typeof metadata.sourceReflectionPath === "string"
          ? metadata.sourceReflectionPath
          : typeof metadata.sourcePath === "string"
            ? metadata.sourcePath
            : undefined;
        const preview = buildPreviewLine(entry.text, 180);
        const inlinePath = await updateDreamsInlineSummary({
          workspaceDir,
          phase: "deep",
          entryLine: `- ${date} ${time} UTC, promoted ${entry.category}:${entry.scope} \`${entry.id.slice(0, 8)}\`: ${preview}`,
        });
        const sectionLines = [
          `## ${date} ${time} UTC`,
          `- Agent: ${agentId || "unknown"}`,
          `- Memory ID: \`${entry.id}\``,
          `- Category: ${entry.category}`,
          `- Scope: ${entry.scope}`,
          `- Importance: ${entry.importance}`,
          ...(sourcePath ? [`- Source: \`${sourcePath}\``] : []),
          "",
          entry.text.trim(),
        ];
        const reportPath = await appendPhaseReport({
          workspaceDir,
          phase: "deep",
          date,
          section: sectionLines.join("\n"),
        });
        await appendMemoryHostEvent(workspaceDir, {
          type: "memory.dream.completed",
          timestamp: iso,
          phase: "deep",
          inlinePath,
          reportPath,
          lineCount: entry.text.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
          storageMode: "both",
        });
      } catch (error) {
        params.logger?.warn?.(`memory-lancedb-pro: failed to record deep dreaming interop: ${String(error)}`);
      }
    },
  };
}

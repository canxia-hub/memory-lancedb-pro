import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  appendMemoryHostEvent,
  MEMORY_HOST_EVENT_LOG_RELATIVE_PATH,
  resolveMemoryHostEventLogPath,
} from "openclaw/plugin-sdk/memory-host-events";
import { listMemoryFiles } from "openclaw/plugin-sdk/memory-host-files";
import type { RetrievalResult } from "./retriever.js";
import { parseSmartMetadata } from "./smart-metadata.js";
import type { MemoryEntry } from "./store.js";

export type AgentWorkspaceMap = Record<string, string>;

export interface MemoryHostEventWriter {
  recordRecall(params: {
    agentId?: string;
    query: string;
    results: RetrievalResult[];
  }): Promise<void>;
  recordPromotion(params: {
    agentId?: string;
    entry: MemoryEntry;
  }): Promise<void>;
}

interface LoggerLike {
  debug?(message: string): void;
  info?(message: string): void;
  warn?(message: string): void;
}

interface PublicArtifactRecord {
  kind: "memory-root" | "daily-note" | "dream-report" | "event-log";
  workspaceDir: string;
  relativePath: string;
  absolutePath: string;
  agentIds: string[];
  contentType: "markdown" | "json" | "text";
}

function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeWorkspaceDir(value: string): string {
  return resolve(value.trim());
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function reverseWorkspaceMap(workspaceMap: AgentWorkspaceMap): Map<string, string[]> {
  const reversed = new Map<string, string[]>();
  for (const [agentId, workspaceDir] of Object.entries(workspaceMap)) {
    if (!workspaceDir || !workspaceDir.trim()) continue;
    const normalizedWorkspace = normalizeWorkspaceDir(workspaceDir);
    const existing = reversed.get(normalizedWorkspace) ?? [];
    if (!existing.includes(agentId)) existing.push(agentId);
    reversed.set(normalizedWorkspace, existing);
  }
  return reversed;
}

function resolveWorkspaceRelativePath(pathOrRelativePath: string, workspaceDir: string): string | null {
  const absoluteCandidate = resolve(pathOrRelativePath);
  const workspaceRelative = normalizeRelPath(relative(workspaceDir, absoluteCandidate));
  if (!workspaceRelative.startsWith("../") && workspaceRelative !== "..") {
    return workspaceRelative;
  }

  const normalizedInput = normalizeRelPath(pathOrRelativePath);
  if (!normalizedInput.startsWith("../") && normalizedInput !== "..") {
    return normalizedInput;
  }
  return null;
}

function classifyArtifact(relativePath: string): PublicArtifactRecord["kind"] | null {
  const normalized = normalizeRelPath(relativePath);
  if (normalized === "MEMORY.md") return "memory-root";
  if (normalized === "DREAMS.md" || normalized === "dreams.md") return "dream-report";
  if (/^memory\/(?:diary\/)?\d{4}-\d{2}-\d{2}(?:[^/]*)?\.md$/i.test(normalized)) return "daily-note";
  if (/^memory\/dreaming\/.+\.md$/i.test(normalized)) return "dream-report";
  if (/^memory\/reflections\/daily-reports\/.+\.md$/i.test(normalized)) return "dream-report";
  return null;
}

export function createMemoryPublicArtifactsProvider(params: {
  workspaceMap: AgentWorkspaceMap;
  logger?: LoggerLike;
}) {
  const workspaceAgents = reverseWorkspaceMap(params.workspaceMap);

  return {
    async listArtifacts(_params?: { cfg?: unknown }): Promise<PublicArtifactRecord[]> {
      const artifacts = new Map<string, PublicArtifactRecord>();

      for (const [workspaceDir, agentIds] of workspaceAgents.entries()) {
        let rawPathCount = 0;
        let recognizedCount = 0;

        try {
          const relativePaths = await listMemoryFiles(workspaceDir);
          rawPathCount = relativePaths.length;
          for (const relativePath of relativePaths) {
            const workspaceRelativePath = resolveWorkspaceRelativePath(relativePath, workspaceDir);
            if (!workspaceRelativePath) continue;
            const kind = classifyArtifact(workspaceRelativePath);
            if (!kind) continue;
            recognizedCount += 1;
            const absolutePath = resolve(workspaceDir, workspaceRelativePath);
            artifacts.set(absolutePath, {
              kind,
              workspaceDir,
              relativePath: workspaceRelativePath,
              absolutePath,
              agentIds,
              contentType: "markdown",
            });
          }
        } catch (error) {
          params.logger?.warn?.(
            `memory-lancedb-pro: publicArtifacts workspace scan failed for ${workspaceDir}: ${String(error)}`,
          );
        }

        const eventLogPath = resolveMemoryHostEventLogPath(workspaceDir);
        const hasEventLog = await pathExists(eventLogPath);
        if (hasEventLog) {
          artifacts.set(eventLogPath, {
            kind: "event-log",
            workspaceDir,
            relativePath: normalizeRelPath(MEMORY_HOST_EVENT_LOG_RELATIVE_PATH),
            absolutePath: eventLogPath,
            agentIds,
            contentType: "json",
          });
        }

        params.logger?.info?.(
          `memory-lancedb-pro: publicArtifacts workspace=${workspaceDir} agents=${agentIds.join(",") || "-"} raw=${rawPathCount} recognized=${recognizedCount} eventLog=${hasEventLog ? "yes" : "no"}`,
        );
      }

      params.logger?.info?.(
        `memory-lancedb-pro: publicArtifacts total=${artifacts.size} workspaces=${workspaceAgents.size}`,
      );

      return [...artifacts.values()].sort((left, right) => {
        const workspaceOrder = left.workspaceDir.localeCompare(right.workspaceDir);
        if (workspaceOrder !== 0) return workspaceOrder;
        return left.relativePath.localeCompare(right.relativePath);
      });
    },
  };
}

function resolveEventWorkspaceDir(
  resolver: (agentId?: string) => string | undefined,
  agentId?: string,
): string | null {
  const workspaceDir = resolver(agentId);
  if (!workspaceDir || !workspaceDir.trim()) return null;
  return normalizeWorkspaceDir(workspaceDir);
}

function resolveMetadataPathCandidate(metadata: Record<string, unknown>): string | undefined {
  const keys = [
    "sourcePath",
    "source_path",
    "path",
    "memoryPath",
    "memory_path",
    "sourceReflectionPath",
    "source_reflection_path",
    "reportPath",
    "report_path",
    "inlinePath",
    "inline_path",
  ] as const;

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function resolveFallbackMemoryPath(entry: MemoryEntry, metadata: Record<string, unknown>): string {
  const date = typeof metadata.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(metadata.date)
    ? metadata.date
    : new Date(entry.timestamp || Date.now()).toISOString().split("T")[0];
  return `memory/${date}.md`;
}

function resolveEventPath(entry: MemoryEntry, workspaceDir: string): string {
  const metadata = parseSmartMetadata(entry.metadata, entry) as Record<string, unknown>;
  const candidate = resolveMetadataPathCandidate(metadata);
  if (candidate) {
    const absoluteCandidate = resolve(candidate);
    const rel = normalizeRelPath(relative(workspaceDir, absoluteCandidate));
    if (!rel.startsWith("../") && rel !== "..") {
      return rel;
    }
    const normalizedCandidate = normalizeRelPath(candidate);
    if (!normalizedCandidate.startsWith("../")) {
      return normalizedCandidate;
    }
  }

  if (metadata.type === "session-summary") {
    return resolveFallbackMemoryPath(entry, metadata);
  }

  return resolveFallbackMemoryPath(entry, metadata);
}

function resolveLineRange(entry: MemoryEntry): { startLine: number; endLine: number } {
  const metadata = parseSmartMetadata(entry.metadata, entry) as Record<string, unknown>;
  const startCandidate = metadata.startLine ?? metadata.start_line ?? metadata.fromLine ?? metadata.from_line;
  const endCandidate = metadata.endLine ?? metadata.end_line ?? metadata.toLine ?? metadata.to_line;
  const startLine = typeof startCandidate === "number" && Number.isFinite(startCandidate)
    ? Math.max(1, Math.floor(startCandidate))
    : 1;
  const endLine = typeof endCandidate === "number" && Number.isFinite(endCandidate)
    ? Math.max(startLine, Math.floor(endCandidate))
    : startLine;
  return { startLine, endLine };
}

function clampScore(value: unknown, fallback = 0.5): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function createMemoryHostEventWriter(params: {
  resolveWorkspaceDir: (agentId?: string) => string | undefined;
  logger?: LoggerLike;
}): MemoryHostEventWriter {
  return {
    async recordRecall({ agentId, query, results }): Promise<void> {
      const workspaceDir = resolveEventWorkspaceDir(params.resolveWorkspaceDir, agentId);
      if (!workspaceDir || !query.trim() || results.length === 0) return;
      try {
        await appendMemoryHostEvent(workspaceDir, {
          type: "memory.recall.recorded",
          timestamp: new Date().toISOString(),
          query,
          resultCount: results.length,
          results: results.slice(0, 20).map((result) => {
            const { startLine, endLine } = resolveLineRange(result.entry);
            return {
              path: resolveEventPath(result.entry, workspaceDir),
              startLine,
              endLine,
              score: clampScore(result.score),
            };
          }),
        });
      } catch (error) {
        params.logger?.debug?.(`memory-lancedb-pro: failed to append recall host event: ${String(error)}`);
      }
    },

    async recordPromotion({ agentId, entry }): Promise<void> {
      const workspaceDir = resolveEventWorkspaceDir(params.resolveWorkspaceDir, agentId);
      if (!workspaceDir) return;
      try {
        const metadata = parseSmartMetadata(entry.metadata, entry);
        const { startLine, endLine } = resolveLineRange(entry);
        const path = resolveEventPath(entry, workspaceDir);
        await appendMemoryHostEvent(workspaceDir, {
          type: "memory.promotion.applied",
          timestamp: new Date().toISOString(),
          memoryPath: path,
          applied: 1,
          candidates: [
            {
              key: entry.id,
              path,
              startLine,
              endLine,
              score: clampScore(metadata.confidence, entry.importance),
              recallCount: Math.max(0, Math.floor(metadata.access_count ?? 0)),
            },
          ],
        });
      } catch (error) {
        params.logger?.debug?.(`memory-lancedb-pro: failed to append promotion host event: ${String(error)}`);
      }
    },
  };
}

export function buildMemoryInteropDiagnostics(params: {
  workspaceMap: AgentWorkspaceMap;
}): { workspaceCount: number; agentCount: number } {
  const workspaceDirs = new Set(
    Object.values(params.workspaceMap)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => normalizeWorkspaceDir(value)),
  );
  return {
    workspaceCount: workspaceDirs.size,
    agentCount: Object.keys(params.workspaceMap).length,
  };
}

export function buildDefaultWorkspaceMap(params: {
  workspaceMap: AgentWorkspaceMap;
  defaultWorkspaceDir?: string;
}): AgentWorkspaceMap {
  const nextMap: AgentWorkspaceMap = { ...params.workspaceMap };
  if (params.defaultWorkspaceDir?.trim()) {
    const hasDefaultWorkspace = Object.values(nextMap).some(
      (workspaceDir) => normalizeWorkspaceDir(workspaceDir) === normalizeWorkspaceDir(params.defaultWorkspaceDir!),
    );
    if (!hasDefaultWorkspace) {
      nextMap.main = params.defaultWorkspaceDir;
    }
  }
  return nextMap;
}

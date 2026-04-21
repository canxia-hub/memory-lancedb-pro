/**
 * Dreaming System Event Handler
 *
 * Registers system event handlers for the Dreaming engine using the correct OpenClaw API.
 * Supports true three-phase scheduling: Light, Deep, and REM each get their own managed cron.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/memory-core";
// @ts-ignore - Dynamic import for infra-runtime
import { peekSystemEventEntries } from "openclaw/plugin-sdk/infra-runtime";
import type { DreamingConfig } from "./types.js";
import { DreamingScheduler } from "./scheduler.js";
import type { MemoryStore } from "../store.js";
import type { Retriever } from "../retriever.js";
import type { Embedder } from "../embedder.js";
import type { LlmClient } from "../llm-client.js";
import type { DreamingInteropWriter } from "../dreaming-interop.js";

export type DreamingPhase = "light" | "deep" | "rem";

/**
 * Deep phase keeps the official memory-core identity so existing Control UI and
 * doctor.memory.status behavior continue to recognize the main promotion job.
 */
export const LANCEDB_DREAMING_SYSTEM_EVENT_TEXT = "__openclaw_memory_core_short_term_promotion_dream__";
export const LIGHT_DREAMING_SYSTEM_EVENT_TEXT = "__openclaw_memory_lancedb_pro_dreaming_light__";
export const REM_DREAMING_SYSTEM_EVENT_TEXT = "__openclaw_memory_lancedb_pro_dreaming_rem__";
const LEGACY_LANCEDB_DREAMING_SYSTEM_EVENT_TEXT = "__openclaw_memory_lancedb_pro_dreaming__";

const DEEP_MANAGED_DREAMING_CRON_NAME = "Memory Dreaming Promotion";
const DEEP_MANAGED_DREAMING_CRON_TAG = "[managed-by=memory-core.short-term-promotion]";
const LIGHT_MANAGED_DREAMING_CRON_NAME = "Memory Dreaming Light";
const LIGHT_MANAGED_DREAMING_CRON_TAG = "[managed-by=memory-lancedb-pro.dreaming.light]";
const REM_MANAGED_DREAMING_CRON_NAME = "Memory Dreaming REM";
const REM_MANAGED_DREAMING_CRON_TAG = "[managed-by=memory-lancedb-pro.dreaming.rem]";
const LEGACY_MANAGED_DREAMING_CRON_NAME = "Memory LanceDB Dreaming Promotion";
const LEGACY_MANAGED_DREAMING_CRON_TAG = "[managed-by=memory-lancedb-pro.dreaming]";

const DEFAULT_LIGHT_DREAMING_CRON_EXPR = "0 */6 * * *";
const DEFAULT_DEEP_DREAMING_CRON_EXPR = "0 3 * * *";
const DEFAULT_REM_DREAMING_CRON_EXPR = "0 5 * * 0";
const DEFAULT_DREAMING_LIMIT = 10;

let unavailableCronWarningEmitted = false;

type NullableRecord = Record<string, unknown> | null;
type CronServiceLike = {
  list: (params?: { includeDisabled?: boolean }) => Promise<any[]>;
  add: (job: any) => Promise<any>;
  update: (jobId: string, patch: any) => Promise<any>;
  remove?: (jobId: string) => Promise<any>;
};

type StartupCronSource = {
  context: Record<string, unknown>;
  deps?: Record<string, unknown> | null;
};

type ManagedDreamingPhaseJobSpec = {
  phase: DreamingPhase;
  enabled: boolean;
  name: string;
  tag: string;
  payloadText: string;
  cronExpr: string;
  description: string;
  legacyNames?: string[];
  legacyTags?: string[];
  legacyPayloadTexts?: string[];
};

function asNullableRecord(value: unknown): NullableRecord {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveCronServiceFromCandidate(candidate: unknown): CronServiceLike | null {
  const cron = asNullableRecord(candidate) as CronServiceLike | null;
  if (!cron) {
    return null;
  }
  if (
    typeof cron.list !== "function" ||
    typeof cron.add !== "function" ||
    typeof cron.update !== "function"
  ) {
    return null;
  }
  return cron;
}

function resolveStartupCronSourceFromEvent(event: unknown): StartupCronSource | null {
  const payload = asNullableRecord(event);
  if (!payload) {
    return null;
  }

  const type = typeof payload.type === "string" ? payload.type : undefined;
  const action = typeof payload.action === "string" ? payload.action : undefined;
  if (type !== "gateway" || action !== "startup") {
    return null;
  }

  const context = asNullableRecord(payload.context);
  if (!context) {
    return null;
  }

  return {
    context,
    deps: asNullableRecord(context.deps),
  };
}

function resolveCronServiceFromStartupSource(source: StartupCronSource | null): CronServiceLike | null {
  if (!source) {
    return null;
  }

  return (
    resolveCronServiceFromCandidate(source.context.cron) ??
    resolveCronServiceFromCandidate(source.deps?.cron)
  );
}

function resolveDreamingTriggerSessionKeys(sessionKey?: string): string[] {
  if (!sessionKey) {
    return [];
  }

  const normalized = sessionKey.trim();
  if (!normalized) {
    return [];
  }

  const keys = [normalized];
  if (normalized.endsWith(":heartbeat")) {
    const base = normalized.slice(0, -10).trim();
    if (base) {
      keys.push(base);
    }
  } else {
    keys.push(`${normalized}:heartbeat`);
  }

  return Array.from(new Set(keys));
}

function resolveDreamingPhaseFromText(value: unknown): DreamingPhase | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value.includes(LIGHT_DREAMING_SYSTEM_EVENT_TEXT)) {
    return "light";
  }
  if (value.includes(REM_DREAMING_SYSTEM_EVENT_TEXT)) {
    return "rem";
  }
  if (
    value.includes(LANCEDB_DREAMING_SYSTEM_EVENT_TEXT) ||
    value.includes(LEGACY_LANCEDB_DREAMING_SYSTEM_EVENT_TEXT)
  ) {
    return "deep";
  }
  return null;
}

function hasPendingDreamingCronEvent(sessionKey?: string, phase?: DreamingPhase): boolean {
  return resolveDreamingTriggerSessionKeys(sessionKey).some((key) => {
    const events = peekSystemEventEntries(key);
    return events.some((event) => {
      if (event.contextKey?.startsWith("cron:") !== true) {
        return false;
      }
      const eventPhase = resolveDreamingPhaseFromText(event.text);
      return phase ? eventPhase === phase : eventPhase !== null;
    });
  });
}

function resolveManagedDreamingPhaseJobSpecs(config: DreamingConfig): ManagedDreamingPhaseJobSpec[] {
  return [
    {
      phase: "light",
      enabled: config.phases.light?.enabled === true,
      name: LIGHT_MANAGED_DREAMING_CRON_NAME,
      tag: LIGHT_MANAGED_DREAMING_CRON_TAG,
      payloadText: LIGHT_DREAMING_SYSTEM_EVENT_TEXT,
      cronExpr: normalizeTrimmedString(config.phases.light?.cron) || DEFAULT_LIGHT_DREAMING_CRON_EXPR,
      description:
        `${LIGHT_MANAGED_DREAMING_CRON_TAG} Stage recent short-term material ` +
        `(limit=${config.phases.light?.limit || DEFAULT_DREAMING_LIMIT})`,
    },
    {
      phase: "deep",
      enabled: config.phases.deep?.enabled === true,
      name: DEEP_MANAGED_DREAMING_CRON_NAME,
      tag: DEEP_MANAGED_DREAMING_CRON_TAG,
      payloadText: LANCEDB_DREAMING_SYSTEM_EVENT_TEXT,
      cronExpr:
        normalizeTrimmedString(config.phases.deep?.cron) ||
        normalizeTrimmedString(config.frequency) ||
        DEFAULT_DEEP_DREAMING_CRON_EXPR,
      description:
        `${DEEP_MANAGED_DREAMING_CRON_TAG} Promote weighted short-term recalls into durable memory ` +
        `(limit=${config.phases.deep?.limit || DEFAULT_DREAMING_LIMIT})`,
      legacyNames: [LEGACY_MANAGED_DREAMING_CRON_NAME],
      legacyTags: [LEGACY_MANAGED_DREAMING_CRON_TAG],
      legacyPayloadTexts: [LEGACY_LANCEDB_DREAMING_SYSTEM_EVENT_TEXT],
    },
    {
      phase: "rem",
      enabled: config.phases.rem?.enabled === true,
      name: REM_MANAGED_DREAMING_CRON_NAME,
      tag: REM_MANAGED_DREAMING_CRON_TAG,
      payloadText: REM_DREAMING_SYSTEM_EVENT_TEXT,
      cronExpr: normalizeTrimmedString(config.phases.rem?.cron) || DEFAULT_REM_DREAMING_CRON_EXPR,
      description:
        `${REM_MANAGED_DREAMING_CRON_TAG} Reflect on recurring patterns ` +
        `(limit=${config.phases.rem?.limit || DEFAULT_DREAMING_LIMIT})`,
    },
  ].filter((spec) => spec.enabled);
}

function isManagedDreamingPhaseJob(job: any, spec: ManagedDreamingPhaseJobSpec): boolean {
  const name = normalizeTrimmedString(job?.name);
  const description = normalizeTrimmedString(job?.description);
  const payloadKind = normalizeTrimmedString(job?.payload?.kind).toLowerCase();
  const payloadText = normalizeTrimmedString(job?.payload?.text);

  if (description.includes(spec.tag)) {
    return true;
  }
  if (name === spec.name && payloadKind === "systemevent" && payloadText === spec.payloadText) {
    return true;
  }
  if (spec.legacyNames?.includes(name) && payloadKind === "systemevent") {
    return true;
  }
  if (spec.legacyTags?.some((tag) => description.includes(tag))) {
    return true;
  }
  if (spec.legacyPayloadTexts?.includes(payloadText)) {
    return true;
  }
  return false;
}

function createManagedDreamingCronJob(spec: ManagedDreamingPhaseJobSpec, timezone?: string) {
  return {
    name: spec.name,
    description: spec.description,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: spec.cronExpr,
      ...(timezone ? { tz: timezone } : {}),
    },
    sessionTarget: "main",
    wakeMode: "now",
    payload: {
      kind: "systemEvent",
      text: spec.payloadText,
    },
  };
}

/**
 * 注册 Dreaming 系统事件处理器
 */
export function registerDreamingSystemEventHandler(
  api: OpenClawPluginApi,
  config: DreamingConfig,
  context: {
    store: MemoryStore;
    retriever: Retriever;
    embedder: Embedder;
    llmClient?: LlmClient;
    dreamingInterop: DreamingInteropWriter;
    workspaceDir: string;
  }
): void {
  if (!config.enabled) {
    api.logger.info("memory-lancedb-pro: dreaming is disabled, skipping registration");
    return;
  }

  const scheduler = new DreamingScheduler(config, api, context);
  let startupCronSource: StartupCronSource | null = null;

  const reconcileManagedDreamingCron = async (params: {
    reason: "startup" | "runtime";
    startupEvent?: unknown;
  }): Promise<void> => {
    if (params.reason === "startup" && params.startupEvent !== undefined) {
      startupCronSource = resolveStartupCronSourceFromEvent(params.startupEvent);
    }

    const cronService = resolveCronServiceFromStartupSource(startupCronSource);
    if (!cronService) {
      if (!unavailableCronWarningEmitted) {
        api.logger.warn(
          "memory-lancedb-pro: managed dreaming cron could not be reconciled (cron service unavailable)"
        );
        unavailableCronWarningEmitted = true;
      }
      return;
    }
    unavailableCronWarningEmitted = false;

    const timezone = normalizeTrimmedString(config.timezone) || undefined;
    const specs = resolveManagedDreamingPhaseJobSpecs(config);
    const existingJobs = await cronService.list({ includeDisabled: true });

    for (const spec of specs) {
      const cronJob = createManagedDreamingCronJob(spec, timezone);
      const existingJob = existingJobs.find((job: any) => isManagedDreamingPhaseJob(job, spec));

      if (existingJob) {
        await cronService.update(existingJob.id, cronJob);
        api.logger.info(
          `memory-lancedb-pro: updated ${spec.phase} dreaming cron job (schedule: ${spec.cronExpr})`
        );
      } else {
        await cronService.add(cronJob);
        api.logger.info(
          `memory-lancedb-pro: created ${spec.phase} dreaming cron job (schedule: ${spec.cronExpr})`
        );
      }
    }
  };

  api.registerHook(
    "gateway:startup",
    async (event: unknown) => {
      try {
        await reconcileManagedDreamingCron({
          reason: "startup",
          startupEvent: event,
        });
      } catch (err) {
        api.logger.error(
          `memory-lancedb-pro: failed to reconcile dreaming cron jobs at startup: ${String(err)}`
        );
      }
    },
    { name: "memory-lancedb-pro-dreaming-cron" }
  );

  api.on("before_agent_reply", async (event: any, ctx: any) => {
    try {
      if (ctx?.trigger !== "heartbeat") {
        return undefined;
      }

      await reconcileManagedDreamingCron({ reason: "runtime" });

      const phase = resolveDreamingPhaseFromText(event?.cleanedBody);
      if (!phase || !hasPendingDreamingCronEvent(ctx?.sessionKey, phase)) {
        return undefined;
      }

      api.logger.info(
        `memory-lancedb-pro: dreaming system event received ` +
          `(phase: ${phase}, trigger: ${ctx?.trigger || "unknown"}, sessionKey: ${ctx?.sessionKey || "unknown"})`
      );

      if (!config.enabled) {
        api.logger.warn("memory-lancedb-pro: dreaming is disabled in config");
        return { handled: true, reason: "memory-lancedb-pro: dreaming disabled" };
      }

      let result;
      if (phase === "light") {
        result = await scheduler.executeLight();
      } else if (phase === "rem") {
        result = await scheduler.executeRem();
      } else {
        result = await scheduler.executeDeep();
      }

      api.logger.info(
        `memory-lancedb-pro: dreaming execution complete ` +
          `(phase: ${result.phase}, processed: ${result.processed}, promoted: ${result.promoted || 0})`
      );

      return { handled: true, reason: `memory-lancedb-pro: dreaming ${phase} processed` };
    } catch (err) {
      api.logger.error(`memory-lancedb-pro: dreaming trigger failed: ${String(err)}`);
      return undefined;
    }
  });

  api.logger.info(
    "memory-lancedb-pro: dreaming system event handler registered " +
      `(${LIGHT_DREAMING_SYSTEM_EVENT_TEXT}, ${LANCEDB_DREAMING_SYSTEM_EVENT_TEXT}, ${REM_DREAMING_SYSTEM_EVENT_TEXT})`
  );
}

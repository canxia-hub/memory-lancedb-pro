# Memory LanceDB Pro

> Enhanced LanceDB-backed long-term memory plugin for OpenClaw with hybrid retrieval, multi-scope isolation, and **true three-phase Dreaming**.

- **Repository**: https://github.com/canxia-hub/memory-lancedb-pro
- **Current stable version**: `v1.3.2`
- **Status**: production-ready

## What is included

- Hybrid retrieval: vector + BM25 + rerank
- Multi-scope isolation
- Long-context chunking
- Memory management tools
- Memory-Wiki bridge compatibility
- Daily digest generation
- Dreaming with independent **Light / Deep / REM** managed cron jobs

## v1.3.2 highlights

- Finalized **true three-phase Dreaming** scheduling
- Deep phase keeps the official memory-core promotion identity so Control UI and doctor status continue to work
- Reconciles legacy single-cron Dreaming jobs into the new three-cron model
- Updated docs to reflect the current OpenClaw runtime contract

## Installation

```bash
cd ~/.openclaw/extensions
git clone https://github.com/canxia-hub/memory-lancedb-pro.git
cd memory-lancedb-pro
git checkout v1.3.2
npm install
```

## Minimal configuration

Add this to `openclaw.json`:

```json5
{
  "plugins": {
    "entries": {
      "memory-lancedb-pro": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "apiKey": "${OPENAI_API_KEY}",
            "baseURL": "https://api.openai.com/v1"
          },
          "dreaming": {
            "enabled": true,
            "timezone": "Asia/Shanghai"
          }
        }
      }
    }
  }
}
```

## Recommended Dreaming configuration

```json5
{
  "plugins": {
    "entries": {
      "memory-lancedb-pro": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "apiKey": "${OPENAI_API_KEY}"
          },
          "enableManagementTools": true,
          "dreaming": {
            "enabled": true,
            "frequency": "0 3 * * *",
            "timezone": "Asia/Shanghai",
            "verboseLogging": false,
            "storage": {
              "mode": "inline",
              "separateReports": false
            },
            "execution": {
              "speed": "balanced",
              "thinking": "medium",
              "budget": "medium"
            },
            "phases": {
              "light": {
                "enabled": true,
                "cron": "0 */6 * * *",
                "lookbackDays": 2,
                "limit": 100
              },
              "deep": {
                "enabled": true,
                "cron": "0 3 * * *",
                "limit": 10,
                "minScore": 0.8,
                "minRecallCount": 3,
                "minUniqueQueries": 3
              },
              "rem": {
                "enabled": true,
                "cron": "0 5 * * 0",
                "lookbackDays": 7,
                "limit": 10,
                "minPatternStrength": 0.75
              }
            }
          }
        }
      }
    }
  }
}
```

## Current Dreaming behavior

When Dreaming is enabled, the plugin reconciles three managed cron jobs:

| Phase | Cron Name | Event Text | Default Schedule |
|-------|-----------|------------|------------------|
| Light | Memory Dreaming Light | `__openclaw_memory_lancedb_pro_dreaming_light__` | `0 */6 * * *` |
| Deep | Memory Dreaming Promotion | `__openclaw_memory_core_short_term_promotion_dream__` | `0 3 * * *` |
| REM | Memory Dreaming REM | `__openclaw_memory_lancedb_pro_dreaming_rem__` | `0 5 * * 0` |

> **Important**: Deep phase uses `__openclaw_memory_core_short_term_promotion_dream__` (not `__openclaw_memory_lancedb_pro_dreaming_deep__`) for compatibility with Control UI and `doctor.memory.status`.

Outputs:

- `memory/dreaming/light/YYYY-MM-DD.md`
- `memory/dreaming/deep/YYYY-MM-DD.md`
- `memory/dreaming/rem/YYYY-MM-DD.md`
- daily digest outputs under `memory/YYYY-MM/`

## Manual Cron Task Configuration

If you need to manually create Dreaming cron tasks (e.g., when auto-registration fails), use these settings:

```json5
// Light Phase - every 6 hours
{
  "name": "Memory Dreaming Light",
  "description": "[managed-by=memory-lancedb-pro.dreaming.light] Stage recent short-term material",
  "enabled": true,
  "schedule": { "kind": "cron", "expr": "0 */6 * * *", "tz": "Asia/Shanghai" },
  "sessionTarget": "main",
  "wakeMode": "now",
  "payload": { "kind": "systemEvent", "text": "__openclaw_memory_lancedb_pro_dreaming_light__" }
}

// Deep Phase - daily at 3:00 AM
{
  "name": "Memory Dreaming Promotion",
  "description": "[managed-by=memory-core.short-term-promotion] Promote weighted short-term recalls into durable memory",
  "enabled": true,
  "schedule": { "kind": "cron", "expr": "0 3 * * *", "tz": "Asia/Shanghai" },
  "sessionTarget": "main",
  "wakeMode": "now",
  "payload": { "kind": "systemEvent", "text": "__openclaw_memory_core_short_term_promotion_dream__" }
}

// REM Phase - every Sunday at 5:00 AM
{
  "name": "Memory Dreaming REM",
  "description": "[managed-by=memory-lancedb-pro.dreaming.rem] Reflect on recurring patterns",
  "enabled": true,
  "schedule": { "kind": "cron", "expr": "0 5 * * 0", "tz": "Asia/Shanghai" },
  "sessionTarget": "main",
  "wakeMode": "now",
  "payload": { "kind": "systemEvent", "text": "__openclaw_memory_lancedb_pro_dreaming_rem__" }
}
```

> **Critical**: Using incorrect event text will cause tasks to be skipped with "disabled" status. Always verify with `openclaw doctor --non-interactive` that the plugin has registered the expected event handlers.

## Verification checklist

After configuration changes:

```bash
openclaw doctor --non-interactive
openclaw gateway restart
openclaw doctor --non-interactive
```

Then verify:

- plugin loads correctly
- doctor shows Dreaming enabled
- cron list contains Light / Promotion / REM jobs

## Documentation

- `CHANGELOG.md`
- `DREAMING-FIX-REPORT.md` (historical report with current-state warning)
- `docs/openclaw-integration-playbook.md`
- https://github.com/canxia-hub/openclaw-memory-suite

## Credits

- Original author: [win4r](https://github.com/win4r)
- Fork maintainer: [canxia-hub](https://github.com/canxia-hub)

## License

MIT

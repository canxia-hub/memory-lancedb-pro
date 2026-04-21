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

- **Memory Dreaming Light**
  - default: `0 */6 * * *`
- **Memory Dreaming Promotion**
  - default: `0 3 * * *`
  - uses the official memory-core promotion event identity for compatibility
- **Memory Dreaming REM**
  - default: `0 5 * * 0`

Outputs:

- `memory/dreaming/light/YYYY-MM-DD.md`
- `memory/dreaming/deep/YYYY-MM-DD.md`
- `memory/dreaming/rem/YYYY-MM-DD.md`
- daily digest outputs under `memory/YYYY-MM/`

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

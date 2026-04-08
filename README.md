# Memory LanceDB Pro (Fork)

> Enhanced LanceDB-backed long-term memory plugin for OpenClaw with hybrid retrieval, multi-scope isolation, and management CLI.

This is a fork of [win4r/memory-lancedb-pro](https://github.com/win4r/memory-lancedb-pro) with fixes for OpenClaw 2026.4.5+ compatibility.

## Version History

### v1.1.2 (2026-04-08)

- **Added**: Deployment & maintenance skill for new agents
- **Added**: Comprehensive configuration guide for all embedding providers
- **Added**: Health check and troubleshooting documentation
- **Added**: Best practices for memory management

### v1.1.1 (2026-04-08)

- **Fixed**: Config schema validation error with OpenClaw 2026.4.5+ (`embedding must have required property 'embedding'`)
- **Updated**: Synced with upstream v1.1.0-beta.10 changes
- **Added**: Official Azure OpenAI embedding provider support

## Features

- **Hybrid Retrieval**: Vector similarity + BM25 keyword search
- **Cross-Encoder Reranking**: Jina / SiliconFlow / Voyage / Pinecone / Dashscope
- **Multi-Scope Isolation**: Per-agent memory namespaces
- **Long-Context Chunking**: Automatic document splitting
- **Smart Extraction**: LLM-powered memory extraction
- **Memory Compaction**: Automatic memory consolidation
- **Temporal Classification**: Time-aware memory categorization
- **Admission Control**: Quality gating for new memories
- **Decay Engine**: Time-based memory importance decay
- **CLI Tools**: `openclaw memory-pro stats`, `openclaw memory-pro compact`, etc.

## Installation

```bash
cd ~/.openclaw/extensions
git clone https://github.com/canxia-hub/memory-lancedb-pro.git
cd memory-lancedb-pro
npm install
```

## Configuration

Add to your `openclaw.json`:

```json
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
          "retrieval": {
            "mode": "hybrid",
            "rerank": "cross-encoder"
          }
        }
      }
    }
  }
}
```

## Credits

- Original author: [win4r](https://github.com/win4r)
- Fork maintainer: [canxia-hub](https://github.com/canxia-hub)

## License

MIT

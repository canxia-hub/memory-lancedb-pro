---
name: memory-lancedb-pro-deployment
description: Memory LanceDB Pro 部署与维护技能。用于新 Agent 快速部署长期记忆系统、配置优化、健康检查与故障排查。触发词：部署记忆系统、memory 部署、记忆系统配置、LanceDB 维护。
metadata:
  openclaw:
    requires:
      config: ["plugins.entries.memory-lancedb-pro.enabled"]
---

# Memory LanceDB Pro 部署与维护指南

> **版本**: 1.3.0  
> **适用**: OpenClaw 2026.4.5+  
> **仓库**: https://github.com/canxia-hub/memory-lancedb-pro

---

## 目录

1. [功能状态矩阵](#1-功能状态矩阵)
2. [系统架构](#2-系统架构)
3. [快速部署](#3-快速部署)
4. [配置指南](#4-配置指南)
5. [运维命令](#5-运维命令)
6. [健康检查](#6-健康检查)
7. [故障排查](#7-故障排查)
8. [最佳实践](#8-最佳实践)

---

## 1. 功能状态矩阵

> 本章节明确区分功能的稳定性状态，避免新会话误判完成度。

### ✅ 已稳定实现

| 功能 | 状态 | 说明 |
|------|------|------|
| LanceDB 存储 | ✅ 稳定 | 向量 + 全文索引，支持 6 类记忆 |
| 混合检索 | ✅ 稳定 | Vector + BM25 + Rerank |
| 记忆工具 | ✅ 稳定 | memory_store / memory_recall / memory_update / memory_list |
| Smart Extraction | ✅ 稳定 | LLM 驱动的自动提取 |
| Decay Engine | ✅ 稳定 | Weibull 生命周期衰减 |
| Tier Manager | ✅ 稳定 | Core / Working / Peripheral 分层 |
| Memory Compaction | ✅ 稳定 | 相似记忆合并压缩 |
| Shared Search Runtime | ✅ 稳定 | v1.3.0 修复，memory-wiki 可用 |
| Dreaming Config | ✅ 稳定 | v1.3.0 修复，schema/parser/type/runtime 统一 |

### ⏳ 已接线待验证

| 功能 | 状态 | 说明 |
|------|------|------|
| Dreaming Phases | ⏳ 待验证 | Light/Deep/REM 三类 phase 输出，需长期运行验证 |
| Daily Digest | ⏳ 待验证 | phase → complete/highlights 闭环，已验证基本功能 |
| Bridge Integration | ⏳ 待验证 | memory-wiki bridge 正常工作 |

### 📋 待补齐 / 计划中

| 功能 | 状态 | 说明 |
|------|------|------|
| Bridge Markdown 清洗 | 📋 计划中 | 需 memory-wiki 配合，降低 lint 噪音 |
| Context Packet 自动注入 | 📋 计划中 | 当前仅手动组装 |
| Episode-like 自动晋升 | 📋 计划中 | candidate → durable 自动化 |

---

## 2. 系统架构

### 2.1 六层记忆架构

```
Layer 0: 会话启动入口
  AGENTS.md / MEMORY.md

Layer 1: 主账本层（文件）
  memory/*.md / memory/YYYY-MM/ / highlights / complete

Layer 2: 运行时状态层
  .working-memory/current-task.yaml

Layer 3: 执行态快照层
  .working-memory/archive/*.yaml

Layer 4: 候选与桥接层
  candidates / episode-like summaries / context packets

Layer 5: 长期结构化记忆层（LanceDB）
  memory_store / memory_recall 工具
```

### 2.2 核心组件

| 组件 | 职责 |
|------|------|
| Embedder | 向量化文本（OpenAI / DashScope / Ollama 兼容） |
| Retriever | 混合检索（Vector + BM25） + Rerank |
| Store | LanceDB 持久化存储 |
| Smart Extractor | LLM 驱动的 6 类记忆提取 |
| Decay Engine | Weibull 生命周期衰减 |
| Tier Manager | Core / Working / Peripheral 分层 |
| Compactor | 相似记忆合并压缩 |

### 2.3 数据流

```
会话进行 → autoCapture/smartExtraction
        → admissionControl 质量门禁
        → Store 持久化
        → Decay/Tier 生命周期管理

检索请求 → Retriever 混合检索
        → Rerank 重排序
        → 返回 Top-K 结果
```

---

## 3. 快速部署

### 3.1 安装插件

```bash
# 方式 1: 从 GitHub 克隆（推荐）
cd ~/.openclaw/extensions
git clone https://github.com/canxia-hub/memory-lancedb-pro.git
cd memory-lancedb-pro
npm install

# 方式 2: 从源码安装
cd ~/.openclaw/workspace
git clone https://github.com/canxia-hub/memory-lancedb-pro.git
cd memory-lancedb-pro
npm install
cp -r . ~/.openclaw/extensions/memory-lancedb-pro/
```

### 3.2 最小配置

编辑 `~/.openclaw/openclaw.json`：

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
            "apiKey": "${OPENAI_API_KEY}"
          }
        }
      }
    }
  }
}
```

### 3.3 验证安装

```bash
# 重启网关
openclaw gateway restart

# 检查状态
openclaw status --deep | grep memory

# 测试记忆工具
# 在会话中使用 memory_store 和 memory_recall
```

---

## 4. 配置指南

### 4.1 Embedding 配置

#### OpenAI 兼容（默认）

```json
{
  "embedding": {
    "provider": "openai-compatible",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}",
    "baseURL": "https://api.openai.com/v1",
    "dimensions": 1536
  }
}
```

#### 阿里云 DashScope（通义）

```json
{
  "embedding": {
    "provider": "openai-compatible",
    "model": "text-embedding-v3",
    "apiKey": "${DASHSCOPE_API_KEY}",
    "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "dimensions": 1024
  }
}
```

#### Ollama 本地模型

```json
{
  "embedding": {
    "provider": "openai-compatible",
    "model": "nomic-embed-text",
    "apiKey": "dummy",
    "baseURL": "http://localhost:11434/v1"
  }
}
```

#### Jina AI

```json
{
  "embedding": {
    "provider": "openai-compatible",
    "model": "jina-embeddings-v3",
    "apiKey": "${JINA_API_KEY}",
    "baseURL": "https://api.jina.ai/v1",
    "taskQuery": "retrieval.query",
    "taskPassage": "retrieval.passage"
  }
}
```

### 4.2 检索配置

```json
{
  "retrieval": {
    "mode": "hybrid",
    "vectorWeight": 0.7,
    "bm25Weight": 0.3,
    "minScore": 0.3,
    "rerank": "cross-encoder",
    "rerankProvider": "jina",
    "rerankApiKey": "${JINA_API_KEY}",
    "candidatePoolSize": 20
  }
}
```

### 4.3 智能提取配置

```json
{
  "smartExtraction": true,
  "extractMinMessages": 4,
  "extractMaxChars": 8000,
  "llm": {
    "model": "openai/gpt-oss-120b",
    "baseURL": "https://api.groq.com/openai/v1",
    "apiKey": "${GROQ_API_KEY}"
  }
}
```

### 4.4 生命周期配置

```json
{
  "decay": {
    "recencyHalfLifeDays": 30,
    "frequencyWeight": 0.3,
    "intrinsicWeight": 0.3
  },
  "tier": {
    "coreAccessThreshold": 10,
    "peripheralAgeDays": 60
  }
}
```

### 4.5 完整生产配置示例

```json
{
  "plugins": {
    "entries": {
      "memory-lancedb-pro": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "openai-compatible",
            "model": "qwen3-vl-embedding",
            "dimensions": 2560,
            "apiKey": "${DASHSCOPE_API_KEY}",
            "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "chunking": true
          },
          "retrieval": {
            "mode": "hybrid",
            "rerank": "cross-encoder",
            "rerankProvider": "dashscope",
            "rerankEndpoint": "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
            "rerankApiKey": "${DASHSCOPE_API_KEY}",
            "rerankModel": "qwen3-vl-rerank",
            "vectorWeight": 0.7,
            "bm25Weight": 0.3,
            "minScore": 0.3,
            "hardMinScore": 0.35,
            "candidatePoolSize": 20
          },
          "autoCapture": true,
          "autoRecall": false,
          "smartExtraction": true,
          "enableManagementTools": true,
          "sessionStrategy": "systemSessionMemory",
          "scopes": {
            "default": "global"
          }
        }
      }
    }
  }
}
```

---

## 5. 运维命令

### 5.1 CLI 工具

```bash
# 查看统计信息
openclaw memory-pro stats

# 压缩相似记忆
openclaw memory-pro compact

# 迁移数据库
openclaw memory-pro migrate

# 健康检查
openclaw memory-pro doctor
```

### 5.2 记忆管理工具（需启用 enableManagementTools）

在会话中使用：

```
memory_store    # 存储记忆
memory_recall   # 检索记忆
memory_list     # 列出记忆
memory_stats    # 统计信息
memory_forget   # 删除记忆
memory_update   # 更新记忆
memory_compact  # 压缩记忆
```

### 5.3 自定义命令

| 命令 | 用途 |
|------|------|
| `/lesson` | 总结经验到决策记忆 |
| `/remember` | 记录事实到事实记忆 |

---

## 6. 健康检查

### 6.1 自动健康检查

系统每日 06:00 自动执行健康检查，检查项：

1. 主账本索引和文件配对
2. `.working-memory/current-task.yaml` 异常悬挂
3. candidate / episode-like 命名规范
4. LanceDB 检索链路可用性

### 6.2 手动健康检查

```bash
# 检查插件加载状态
openclaw status --deep

# 检查记忆数据库
openclaw memory-pro doctor

# 测试检索
# 在会话中: memory_recall query="test"
```

### 6.3 质量指标

| 指标 | 目标 | 检查方法 |
|------|------|---------|
| 根目录文件数 | < 30 | `ls memory/*.md \| wc -l` |
| 未归档文件 | 0（超过 7 天） | 健康检查报告 |
| current-task 悬挂 | 0 | 检查 goal 是否过期 |
| LanceDB 检索延迟 | < 500ms | `openclaw memory-pro stats` |

---

## 7. 故障排查

### 7.1 常见错误

#### 错误: `embedding must have required property 'embedding'`

**原因**: OpenClaw 2026.4.5+ 配置验证变化

**解决**: 升级到 v1.1.1+ 或从官方仓库安装

```bash
cd ~/.openclaw/extensions
rm -rf memory-lancedb-pro
git clone https://github.com/canxia-hub/memory-lancedb-pro.git
cd memory-lancedb-pro && npm install
```

#### 错误: `LanceDB connection failed`

**原因**: 数据库路径不存在或权限问题

**解决**:
```bash
# 检查路径
ls -la ~/.openclaw/memory/lancedb-pro

# 重建数据库
rm -rf ~/.openclaw/memory/lancedb-pro
openclaw gateway restart
```

#### 错误: `Embedding API rate limit`

**原因**: API 配额不足

**解决**: 配置多 Key 轮换
```json
{
  "embedding": {
    "apiKey": ["key1", "key2", "key3"]
  }
}
```

#### 错误: `Rerank timeout`

**原因**: Rerank API 响应慢

**解决**: 增加超时时间
```json
{
  "retrieval": {
    "rerankTimeoutMs": 10000
  }
}
```

### 7.2 诊断命令

```bash
# 查看网关日志
openclaw gateway logs | grep -i memory

# 检查插件配置
openclaw config get plugins.entries.memory-lancedb-pro

# 验证 schema
openclaw config schema lookup plugins.entries.memory-lancedb-pro.config
```

### 7.3 回滚操作

```bash
# 停止网关
openclaw gateway stop

# 备份当前配置
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak

# 备份数据库
cp -r ~/.openclaw/memory/lancedb-pro ~/.openclaw/memory/lancedb-pro.bak

# 回滚插件版本
cd ~/.openclaw/extensions/memory-lancedb-pro
git checkout v1.1.0

# 重启网关
openclaw gateway start
```

---

## 8. 最佳实践

### 8.1 记忆分类规范

| 类别 | 用途 | 示例 |
|------|------|------|
| `preference` | 用户偏好 | "用户喜欢简洁的回复风格" |
| `fact` | 客观事实 | "用户时区为 Asia/Shanghai" |
| `decision` | 决策规则 | "涉及安全操作前必须先检索历史经验" |
| `entity` | 实体信息 | "用户邮箱: canxia00pri@gmail.com" |
| `error` | 错误经验 | "Windows 上 Docker Linux engine 不可用，优先 Windows 原生部署" |
| `reflection` | 反思总结 | "重复问题应推动规则或架构修正" |

### 8.2 写入原则

```
✅ 写入长期记忆：
- 稳定的决策和方法论
- 跨会话有效的偏好和事实
- 典型错误和修复路线

❌ 不写入长期记忆：
- 临时上下文和当天事项
- 未经验证的猜测
- 短期噪音和流水账
```

### 8.3 检索优化

```json
// 高精度检索（保守）
{
  "retrieval": {
    "minScore": 0.5,
    "hardMinScore": 0.6,
    "candidatePoolSize": 30
  }
}

// 高召回检索（宽松）
{
  "retrieval": {
    "minScore": 0.2,
    "hardMinScore": 0.3,
    "candidatePoolSize": 50
  }
}
```

### 8.4 资源规划

| 规模 | Embedding 配额 | 存储 | 并发 |
|------|---------------|------|------|
| 小型（< 1万条） | 100K tokens/月 | 500MB | 1 |
| 中型（1-10万条） | 500K tokens/月 | 2GB | 2-4 |
| 大型（> 10万条） | 2M+ tokens/月 | 10GB+ | 4+ |

---

## 附录

### A. 环境变量

| 变量 | 用途 |
|------|------|
| `OPENAI_API_KEY` | OpenAI Embedding API Key |
| `DASHSCOPE_API_KEY` | 阿里云 DashScope API Key |
| `JINA_API_KEY` | Jina AI API Key |
| `GROQ_API_KEY` | Groq LLM API Key |

### B. 文件路径

| 路径 | 用途 |
|------|------|
| `~/.openclaw/extensions/memory-lancedb-pro/` | 插件目录 |
| `~/.openclaw/memory/lancedb-pro/` | 数据库目录 |
| `~/.openclaw/openclaw.json` | 主配置文件 |
| `~/.openclaw/workspace/memory/` | 主账本目录 |
| `~/.openclaw/workspace/.working-memory/` | 运行时状态 |

### C. 相关文档

- [MEMORY.md](~/.openclaw/workspace/MEMORY.md) - 记忆系统总纲
- [memory/README.md](~/.openclaw/workspace/memory/README.md) - 技术架构
- [memory/CRON-JOBS.md](~/.openclaw/workspace/memory/CRON-JOBS.md) - 定时任务

---

*版本: 1.1.1 | 更新时间: 2026-04-08 | 维护者: canxia-hub*

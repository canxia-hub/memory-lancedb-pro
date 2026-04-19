---
name: memory-lancedb-pro-tools-guide
description: Memory LanceDB Pro Agent 工具使用指南。覆盖所有 memory 工具的用法、参数、场景与最佳实践。
---

# Memory Tools 使用指南

本技能提供 Memory LanceDB Pro 插件所有 Agent 工具的完整使用指南。

---

## 工具清单

### 核心工具（高频使用）

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| `memory_recall` | 语义检索 | 查找历史决策、用户偏好、相关事实 |
| `memory_store` | 存储记忆 | 保存重要信息、偏好、决策 |
| `memory_update` | 更新记忆 | 修正错误、补充内容、改变重要性 |

### 管理工具（中低频使用）

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| `memory_archive` | 删除/归档 | 清理过时记忆、删除错误信息 |
| `memory_promote` | 状态提升 | 提升记忆重要性、确认暂定记忆 |
| `memory_stats` | 统计信息 | 查看记忆系统状态 |
| `memory_list` | 时间列表 | 按时间浏览记忆 |

### 调试工具（调试时使用）

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| `memory_debug` | 检索调试 | 分析检索质量、排名原因 |

### Self-Improvement 工具

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| `self_improvement_log` | 记录学习/错误 | Agent 自我改进 |
| `self_improvement_extract_skill` | 提取技能 | 从学习创建技能 |
| `self_improvement_review` | 审查积压 | 查看待处理学习项 |

---

## 核心工具详解

### memory_recall

**用途**: 语义检索长期记忆

**参数**:
```yaml
query: string          # 必填：搜索查询
limit: number          # 可选：结果数量（默认 3，最大 20）
includeFullText: bool  # 可选：返回全文（默认 false，返回摘要）
maxCharsPerItem: num   # 可选：摘要模式单条最大字符（默认 180）
scope: string          # 可选：限定作用域
category: string       # 可选：限定类别（preference/fact/decision/entity/reflection/other）
```

**使用场景**:
1. 查找历史决策 → `category: decision`
2. 回忆用户偏好 → `category: preference`
3. 查询相关事实 → `category: fact`
4. 通用上下文检索 → 不指定 category

**最佳实践**:
- 使用具体的关键词，避免模糊查询
- 合理设置 `limit`，避免上下文膨胀
- 生产环境使用摘要模式，调试时使用全文模式

**示例**:
```
memory_recall({
  query: "用户对文件组织的偏好",
  category: "preference",
  limit: 3
})
```

---

### memory_store

**用途**: 存储重要信息到长期记忆

**参数**:
```yaml
text: string           # 必填：记忆内容
importance: number     # 可选：重要性 0-1（默认 0.7）
category: string       # 可选：类别（默认 other）
scope: string          # 可选：作用域（默认 agent:<id>）
```

**类别说明**:
- `preference`: 用户偏好、习惯
- `fact`: 客观事实、配置信息
- `decision`: 决策、选择、方案
- `entity`: 实体信息（人、项目、工具）
- `reflection`: 反思、经验总结
- `other`: 其他

**使用场景**:
1. 记录用户偏好 → `category: preference, importance: 0.9`
2. 记录重要决策 → `category: decision, importance: 0.8`
3. 记录项目事实 → `category: fact, importance: 0.7`

**最佳实践**:
- 只存储跨会话仍有效的稳定信息
- 避免存储短期、临时性内容
- 写入前检查是否已存在相似记忆

**示例**:
```
memory_store({
  text: "阿訫偏好将文件按项目分类存储，不喜欢扁平目录结构",
  category: "preference",
  importance: 0.8
})
```

---

### memory_update

**用途**: 更新现有记忆

**参数**:
```yaml
memoryId: string       # 必填：记忆 ID 或查询
text: string           # 可选：新内容
importance: number     # 可选：新重要性
category: string       # 可选：新类别
scope: string          # 可选：作用域过滤
```

**使用场景**:
1. 修正错误记忆 → 提供 `text`
2. 调整重要性 → 提供 `importance`
3. 改变类别 → 提供 `category`

**示例**:
```
memory_update({
  memoryId: "abc12345",
  text: "更新后的正确内容",
  importance: 0.9
})
```

---

## 管理工具详解

### memory_archive

**用途**: 删除或归档记忆

**参数**:
```yaml
memoryId: string       # 必填：记忆 ID 或查询
query: string          # 可选：搜索式删除
scope: string          # 可选：作用域过滤
hard: boolean          # 可选：硬删除（默认 false）
reason: string         # 可选：归档原因
```

**删除模式**:

| hard | 行为 | 恢复 |
|------|------|------|
| `false`（默认） | 软删除，标记为 archived | 可通过 `memory_promote` 恢复 |
| `true` | 硬删除，彻底移除 | 不可恢复 |

**使用场景**:
1. 过时偏好 → `hard: false, reason: "preference changed"`
2. 错误信息 → `hard: true, reason: "incorrect information"`
3. 批量清理 → 使用 `query` 参数

**示例**:
```
# 软删除（可恢复）
memory_archive({
  memoryId: "abc12345",
  reason: "用户偏好已改变"
})

# 硬删除（不可恢复）
memory_archive({
  memoryId: "abc12345",
  hard: true,
  reason: "记录错误"
})
```

---

### memory_promote

**用途**: 提升记忆状态或层级

**参数**:
```yaml
memoryId: string       # 必填：记忆 ID 或查询
layer: string          # 可选：目标层级（durable/working/reflection/archive）
state: string          # 可选：目标状态（pending/confirmed/archived）
scope: string          # 可选：作用域过滤
```

**使用场景**:
1. 确认暂定记忆 → `state: confirmed`
2. 提升为长期记忆 → `layer: durable`
3. 恢复归档记忆 → `state: confirmed`

**示例**:
```
memory_promote({
  memoryId: "abc12345",
  state: "confirmed",
  layer: "durable"
})
```

---

### memory_stats

**用途**: 查看记忆系统统计

**参数**: 无（或 `scope` 过滤）

**输出示例**:
```
Memory Stats
============
Total: 1250 memories
By Category: preference(45) fact(320) decision(156) entity(89) reflection(234) other(406)
By Layer: durable(580) working(520) reflection(150)
By State: confirmed(1100) pending(100) archived(50)
```

---

### memory_list

**用途**: 按时间列出记忆

**参数**:
```yaml
limit: number          # 可选：数量（默认 10，最大 50）
offset: number         # 可选：偏移量
scope: string          # 可选：作用域过滤
category: string       # 可选：类别过滤
```

**使用场景**: 浏览最近记忆、检查存储内容

---

## 调试工具详解

### memory_debug

**用途**: 调试检索质量、分析排名原因

**参数**:
```yaml
query: string          # 必填：搜索查询
limit: number          # 可选：结果数量（默认 5）
scope: string          # 可选：作用域过滤
mode: string           # 可选：输出模式
```

**mode 说明**:
- `"pipeline"`: 显示检索 pipeline 各阶段 trace
- `"rank"`: 显示排名原因分解
- `"full"`: 两者都显示（默认）

**使用场景**:
1. 检索结果不理想 → 分析 pipeline drop 点
2. 理解排名逻辑 → 使用 rank 模式
3. 调试 embedding 质量 → 观察 vector score

**示例**:
```
memory_debug({
  query: "test query",
  mode: "rank"
})
```

---

## Self-Improvement 工具详解

### self_improvement_log

**用途**: 记录 Agent 学习或错误

**参数**:
```yaml
type: string           # 必填：learning | error
summary: string        # 必填：一句话总结
details: string        # 可选：详细说明
suggestedAction: str   # 可选：建议行动
category: string       # 可选：学习类别
area: string           # 可选：领域
priority: string       # 可选：low | medium | high | critical
```

**使用场景**: 错误修正、最佳实践发现、知识缺口

---

### self_improvement_extract_skill

**用途**: 从学习条目提取为技能

**参数**:
```yaml
learningId: string     # 必填：学习 ID（LRN-YYYYMMDD-001）
skillName: string      # 必填：技能名称（小写连字符）
sourceFile: string     # 可选：LEARNINGS.md | ERRORS.md
outputDir: string      # 可选：输出目录（默认 skills）
```

---

### self_improvement_review

**用途**: 审查学习积压

**输出**: 统计 pending/high/promoted 数量

---

## 最佳实践

### 存储策略

1. **只存稳定信息**: 跨会话仍有效的内容才值得存储
2. **合理分类**: 使用正确的 category 便于检索
3. **设置重要性**: 高重要性记忆更容易被召回

### 检索策略

1. **具体关键词**: 避免模糊查询
2. **限制结果数**: 避免 context 膨胀
3. **使用 category 过滤**: 提高相关性

### 删除策略

1. **优先软删除**: 使用 `hard: false` 保留恢复选项
2. **记录原因**: 提供 `reason` 便于追溯
3. **批量操作谨慎**: 使用 `query` 批量删除前先检查

### 调试策略

1. **先用 rank 模式**: 快速定位问题
2. **再看 pipeline**: 找到 drop 点
3. **检查 embedding**: 确认向量质量

---

## 常见问题

### Q: memory_recall 返回不相关结果？

A: 
1. 检查查询是否足够具体
2. 使用 `category` 过滤
3. 用 `memory_debug` 分析排名

### Q: memory_store 提示 duplicate？

A: 说明已存在高度相似的记忆，可：
1. 使用 `memory_update` 更新现有记忆
2. 或确认新内容确实不同后重试

### Q: 如何恢复误删的记忆？

A: 
1. 如果是软删除（`hard: false`），用 `memory_promote` 恢复
2. 如果是硬删除（`hard: true`），无法恢复

---

## 版本历史

| 版本 | 变更 |
|------|------|
| v1.2.0 | 合并 debug + explain_rank，统一 archive + forget，移除 compact |
| v1.1.x | 初始版本，14 个工具 |

---

*文档版本: 1.2.0 | 更新: 2026-04-19*

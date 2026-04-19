---
name: memory-lancedb-pro-skills
description: Memory LanceDB Pro 技能包入口。包含部署维护、工具使用、经验提取等技能。
---

# Memory LanceDB Pro Skills

本目录包含 Memory LanceDB Pro 插件配套的 Agent 技能。

## 技能列表

### tools-guide

**用途**: Agent 工具使用指南

**触发词**: memory 工具、记忆工具、memory_recall、memory_store

**包含内容**:
- 所有 memory 工具的完整说明
- 参数详解与使用场景
- 最佳实践与常见问题

### deployment

**用途**: 新 Agent 快速部署长期记忆系统

**触发词**: 部署记忆系统、memory 部署、记忆系统配置、LanceDB 维护

**包含内容**:
- 系统架构概述
- 快速部署流程
- 完整配置指南
- 运维命令参考
- 健康检查流程
- 故障排查手册
- 最佳实践

### lesson

**用途**: 从当前对话中提取经验并存储到长期记忆

**触发**: `/lesson` 命令

**包含内容**:
- 经验提取流程
- 记忆存储格式
- 验证步骤

---

## 运行时注意

- 当前 Dreaming 的 **Light / REM / Deep** 输出链路以事件驱动为主，不是三条独立 cron。
- 当前每日 03:00 的真实调度来源主要是 `Memory Dreaming Promotion`（memory-core）和宿主侧记忆整理任务。
- `memory-wiki` 的 bridge 已可用，但 bridge markdown 清洗仍未完全落地，`wiki_lint` 仍可能出现噪音 warning。

## 使用方式

技能会在以下场景自动加载：

1. Agent 启动时读取 MEMORY.md 中的 preferred_skills
2. 用户触发相关命令（如 `/lesson`）
3. 任务需要记忆系统相关知识时

---

*版本: 1.3.0 | 更新: 2026-04-19*

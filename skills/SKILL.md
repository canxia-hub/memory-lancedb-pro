---
name: memory-lancedb-pro-skills
description: Memory LanceDB Pro 技能包入口。包含部署维护、经验提取等技能。
---

# Memory LanceDB Pro Skills

本目录包含 Memory LanceDB Pro 插件配套的 Agent 技能。

## 技能列表

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

## 使用方式

技能会在以下场景自动加载：

1. Agent 启动时读取 MEMORY.md 中的 preferred_skills
2. 用户触发相关命令（如 `/lesson`）
3. 任务需要记忆系统相关知识时

---

*版本: 1.1.1 | 更新: 2026-04-08*

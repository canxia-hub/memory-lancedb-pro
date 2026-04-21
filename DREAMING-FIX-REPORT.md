# Dreaming 功能修复报告（已被后续方案取代）

> 状态：**superseded / historical**  
> 最后校正：2026-04-22

这份报告记录的是 **2026-04-21 某一排障阶段** 的中间修复结论，仍有历史价值，但**不再代表当前 memory-lancedb-pro 的最终 Dreaming 运行态**。

---

## 1. 为什么它已过时

这份旧报告当时只修到了下面这一层：

- 正确检查 system event queue
- 只在 heartbeat trigger 下处理事件
- 使用 `gateway:startup` hook reconcile cron

但它仍假定：

- 只有一个 Dreaming promotion cron
- cron 名称是 `Memory LanceDB Dreaming Promotion`
- system event text 是 `__openclaw_memory_lancedb_pro_dreaming__`
- UI 最终会围绕单一 promotion 任务显示状态

这些假设 **都不是 2026-04-22 之后的最终实现**。

---

## 2. 当前最终实现（以此为准）

当前 Dreaming 已完成 **true three-phase** 对接：

### 三个独立 managed cron

1. **Light**
   - name: `Memory Dreaming Light`
   - schedule: `0 */6 * * *`
   - event text: `__openclaw_memory_lancedb_pro_dreaming_light__`

2. **Deep**
   - name: `Memory Dreaming Promotion`
   - schedule: `0 3 * * *`
   - event text: `__openclaw_memory_core_short_term_promotion_dream__`

3. **REM**
   - name: `Memory Dreaming REM`
   - schedule: `0 5 * * 0`
   - event text: `__openclaw_memory_lancedb_pro_dreaming_rem__`

### 状态聚合也已改为三相位独立

当前 Control UI Dreaming 页不再共享一个 `sweepStatus`，而是：

- `doctor.memory.status.dreaming.phases.light.nextRunAtMs`
- `doctor.memory.status.dreaming.phases.deep.nextRunAtMs`
- `doctor.memory.status.dreaming.phases.rem.nextRunAtMs`

分别来自三条独立的 managed cron 匹配结果。

---

## 3. 旧报告哪些地方不能再照搬

以下旧说法都不应再直接引用：

- “应该看到名为 `Memory LanceDB Dreaming Promotion` 的 cron 任务”
- “payload.text 应为 `__openclaw_memory_lancedb_pro_dreaming__`”
- “默认每天 3:00 的单一 promotion cron 就是最终模型”

这些说法现在最多只能作为**历史阶段诊断记录**。

---

## 4. 应该看哪份文档

当前请以以下文档为准：

- `C:\Users\Administrator\.openclaw\workspace\docs\dreaming-true-three-phase-integration-2026-04-22.md`
- `C:\Users\Administrator\.openclaw\wiki\memory-vaults\memory-lancedb-pro\syntheses\dreaming-system.md`
- `C:\Users\Administrator\.openclaw\wiki\reference\memory-lancedb-pro-p0\dreaming-integration.md`

---

## 5. 历史价值仍然保留的部分

这份旧报告仍然有两个保留价值：

1. 说明为什么 `peekSystemEventEntries` 比检查 `cleanedBody` 更可靠
2. 说明为什么 `gateway:startup` 比 `gateway_start` 更符合宿主契约

但除此之外，不应再把它当作“当前最终接入说明”。

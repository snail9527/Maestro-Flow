# Maestro 修复 Backlog（fix/maestro-a-class-cleanup）

> 来源：`maestro-analysis-README.md` 的 A/B/C 归因 + 执行中暴露的 6 个地基问题。
> **排序原则**：地基优先（挡着确定性验证的先修）→ P1 实现缺陷（可确定性验证）→ P2 散文层（弱验证）→ 架构档 → B 类设计决策。
> **每条配独立确定性验证门**（不依赖全套测试绿——见 R6-1/R7-2 范例）。状态：☑ 完成 · ◐ 部分 · ☐ 待办。
> 后续逐个 pick，从 Wave 0 起；可逐条导入 GitHub / maestro issue。

---

## ✅ 已完成（本 session）

| 状态 | 项 | commit |
|---|---|---|
| ☑ | R6-1 死路由 ×3 → `singles/execute` | `a43c27cf` |
| ☑ | R6-3 spec-generate 孤儿删除 | `a43c27cf` |
| ☑ | R7-2 E007 pause（打破无限重试） | `a43c27cf` |
| ◐ | R10-2 dashboard 类型对齐（渲染待补 = FIX-08） | `a43c27cf` |
| ☑ | P0-1 测试体系统一（37 迁 vitest，1430/1504 绿） | `982d65a5` |
| ☑ | P0-4「12 红测试」查明 = 误判（实为 `.js` 解析） | `982d65a5` |
| ☑ | 诊断纠错：R6-2 误判、execute-verify 死路由、BlueprintPreview mock 误判 | `a43c27cf`/`bcc625f1` |

---

## Wave 0 · P0 地基（最先 — 挡着所有确定性验证）

| ID | 项 | 验证门 | 依赖 |
|---|---|---|---|
| **FIX-01** | 清 src 编译产物（31 `.js`/29 `.d.ts`/28 `.js.map` 移出源码树 + `.gitignore`） | src 无 `.js`；全套 vitest 仍 1430 绿 | 测试已迁移 ✅ |
| **FIX-02** | dashboard tsc 转绿（核实 `maestro-flow`/`undici`/`onnxruntime-node` 解析 = 构建顺序还是缺 `@types`） | `tsc -p dashboard/tsconfig.node.json` 0 error | — |
| **FIX-03** | 加 CI test gate（Actions 跑 vitest + tsc lint），锁住 1430 绿 | CI workflow 存在并通过 | FIX-01/02 |
| **FIX-04** | 甄别/修 74 红测试（数据/环境依赖，如 `search-benchmark` 需 KG fixture） | 红数 → 0，或 `skip` + 标注原因 | — |

---

## Wave 1 · P1 剩余 A（可确定性验证的实现缺陷）

| ID | 项 | 验证门 |
|---|---|---|
| **FIX-05** | R10-1 E-code 落盘（`RalphSession` 加 `findings`，cmd-check/next 持久化） | vitest 断言 status.json 含 `findings` |
| **FIX-06** | R10-3 fs-watcher 区分 mid-write / 真损坏（重试读 or 校验，不裸吞） | vitest 模拟半写 + 真损坏 |
| **FIX-07** | R9-2 team 1184 行 python 去重（aco/test_aco/pheromone/scoring 抽公共/symlink） | diff 两副本指同源 + 两 swarm 测试过 |
| **FIX-08** | R10-2 渲染增强（dashboard UI 用 `completion_status` 区分 DONE/BLOCKED） | 渲染快照区分；依赖 FIX-02 |
| **FIX-09** | PhaseOrchestrator 死代码（引擎，单独评估：删 or 接线） | grep 0 生产引用后删 / 接线测试 |

---

## Wave 2 · P2 C 类散文层（弱验证 — 改 prompt，仅结构级验证）

| ID | 项 |
|---|---|
| **FIX-10** | R3.1 `plan.md` 读 phase `Requirements`（追溯链落地） |
| **FIX-11** | R3.3 `boundary_contract` 传播进 roadmap |
| **FIX-12** | R4 `-y` 保留 Search-first（`interview-mechanics` 第 4/6 行矛盾） |
| **FIX-13** | R5 长跑 re-grounding 门（`--review` 漂移检测接 ralph 回路） |
| **FIX-14** | R2 减少再抽象层（plan 在有 Requirements 时直读 REQ 原文） |
| **FIX-15** | R9-1 worker 原话透传执行链（不止挂 prompt） |
| **FIX-16** | R9-4 角色来源二元收敛（动态 session vs 静态 roles/） |
| **FIX-17** | R1.3 A_INFER_POSITION 去浅启发式（加意图抽取/置信门） |
| **FIX-18** | H4 fail-loud（hook 跳过/超时/空注入落 status.json） |

> **C 类共性**：散文层修复，验证只能到「prompt 含指令」结构级，无行为确定性门。建议与 B 类的「不变量→代码断言」（DECIDE-03）一起做才有强制力，否则仍靠 LLM 自觉。

---

## Wave 3 · 架构档（用户决策：正确处理引擎大脑，**不退役**）

| ID | 项 |
|---|---|
| **FIX-19** | R1.1 命令体 ↔ deferred 大脑对齐（统一架构，不删旧大脑；重写对齐 or 加一致性测试，消除「决策节点 vs 纯顺序」矛盾） |
| **FIX-20** | R6 三引擎职责边界明确 + CI 守「`_intent-map` ⊇ slash 链路目录」防再漂移 |

---

## Wave 4 · B 类（设计决策 — 需产品拍板，非 bug）

| ID | 决策 |
|---|---|
| **DECIDE-01** | R7-1/R7-3 `retry_count`/`confidence_score`：维持「交 LLM」还是改「代码强制」 |
| **DECIDE-02** | R8/H1/H3/H5 软注入 / guard advisory：维持灵活还是改 `exit(2)` 强制（harness 方向） |
| **DECIDE-03** | R7 不变量→代码断言一致性层（给每条 `<invariants>` 打 `enforced_by` + CI 校验绑定符号存在）——治 R6–R10 的根 |

---

*依赖链提示：FIX-08 ← FIX-02 · Wave 2(C 类) 的强制力 ← DECIDE-03 · FIX-03(CI) ← FIX-01/02/04 收口后才有意义。*

# rmux-collab — 基于频道的多 Agent 协作系统

## 1. 概述

基于 [rmux](https://rmux.io) 构建的多 Agent 协作框架。每个 Agent 运行在独立的 rmux pane 中，Coordinator 通过 rmux TypeScript SDK 管理频道、发送 prompt、捕获输出、编排协作流程。

**核心理念**：消息即 prompt — 所有 agent 间通信本质是向目标 pane 发送 prompt 文本并等待输出。

### 1.1 设计目标

- 极简协议：无自定义消息格式，prompt in / stdout out
- 混合 Agent：支持 Claude Code、Gemini CLI、Codex CLI、任意 shell 程序
- 三种协作模式：广播-收集、流水线、自由对话
- 可观测：所有 agent 活动可通过 rmux attach 实时查看
- 独立运行：先作为独立包，后续可融合为 maestro transport

### 1.2 技术栈

- Runtime: Bun / Node.js 20+
- SDK: `@rmux/sdk` (TypeScript)
- Agent 宿主: rmux pane (PTY 进程)
- 配置: TypeScript 文件 (类型安全)

---

## 2. 架构

### 2.1 系统拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  Coordinator Process (TypeScript)                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │  Channel   │ │   Agent    │ │  Pattern   │              │
│  │  Registry  │ │  Manager   │ │  Engine    │              │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘              │
│        └───────────────┼───────────────┘                    │
│                        ▼                                    │
│              ┌──────────────────┐                           │
│              │  @rmux/sdk       │                           │
│              └────────┬─────────┘                           │
└───────────────────────┼─────────────────────────────────────┘
                        ▼ IPC
┌─────────────────────────────────────────────────────────────┐
│  rmux daemon                                                 │
├─────────────────────────────────────────────────────────────┤
│  Session: "collab"                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Window:  │ │  Window:  │ │  Window:  │ │  Window:  │      │
│  │  planner  │ │  coder-1  │ │  coder-2  │ │  reviewer │      │
│  │  (claude) │ │  (codex)  │ │  (gemini) │ │  (claude) │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件 | 职责 |
|------|------|
| **Coordinator** | 顶层编排，持有 RMUX 连接，管理所有 channel 和 agent |
| **Channel** | 逻辑分组，映射到 rmux Session，内含多个 Agent |
| **Agent** | 单个 pane 中运行的 CLI 进程，通过 transport adapter 适配 |
| **Pattern Engine** | 实现三种协作模式的执行逻辑 |
| **Stream Monitor** | 实时监听所有 agent 输出，路由事件 |

### 2.3 rmux 原语映射

| 协作概念 | rmux 原语 | 备注 |
|----------|-----------|------|
| Agent 实例 | `Pane` | 每个 agent 独占一个 pane |
| 频道 | `Session` | 一个 session = 一个协作频道 |
| Agent 组 | `PaneSet` | 同频道内的 agent 集合 |
| 发送 prompt | `pane.sendText()` | 向 agent stdin 写入 |
| 等待完成 | `pane.expectVisibleText()` | 轮询可见文本匹配 |
| 读取输出 | `pane.captureText()` | 捕获 pane 全量文本 |
| 实时监听 | `pane.lineStream()` | 逐行流式输出 |
| 广播 | `PaneSet.sendText()` | 同时发送到多个 pane |
| 批量等待 | `PaneSet.expectAll()` | 等全部 agent 完成 |
| 发现 | `rmux.find().byTitle()` | 按名称定位 agent |

---

## 3. 通信模型

### 3.1 核心原则

**No Protocol, Just Text.**

- Agent 不需要实现任何协议
- Coordinator 发送的是纯文本 prompt
- Agent 的回复就是它的 stdout 输出
- 唯一约定：完成标记（用于判断 agent 何时说完）

### 3.2 完成标记策略

不同 CLI 工具有天然的"回到 idle"信号：

| Agent 类型 | 完成标记 | 检测方式 |
|-----------|----------|----------|
| Claude Code | `❯` (prompt 符号) | `expectVisibleText('❯')` |
| Gemini CLI | `$` 或 `>>>` | `expectVisibleText('$')` |
| Codex CLI | `$` (shell prompt) | `expectVisibleText('$')` |
| 自定义 agent | `▌END` (约定) | `expectVisibleText('▌END')` |
| Shell 命令 | 进程退出 | `waitForExit()` |

对于无法检测 idle 的情况，使用 **quiet detection**：
```typescript
// 等待 pane 静默 2 秒（无新输出）
await pane.waitForLoadState('quiet', { timeout: 60_000 });
```

### 3.3 输出捕获

```typescript
// 方案 A：全量捕获（简单，适合短输出）
const output = await pane.captureText();

// 方案 B：增量捕获（适合长输出，避免混入旧内容）
const stream = pane.lineStream();
await pane.sendText(prompt + '\n');
const lines: string[] = [];
for await (const line of stream) {
  if (isCompletionMarker(line)) break;
  lines.push(line);
}
const output = lines.join('\n');
```

### 3.4 输出清洗

从 pane 捕获的文本包含 ANSI escape codes 和 shell 回显，需要清洗：

```typescript
function cleanOutput(raw: string, prompt: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*m/g, '')  // strip ANSI colors
    .replace(/\x1b\[\?[0-9]*[hl]/g, '') // strip mode switches
    .split('\n')
    .filter(line => !line.startsWith(prompt)) // remove echo
    .join('\n')
    .trim();
}
```

---

## 4. 三种协作模式

### 4.1 广播-收集 (Broadcast-Collect)

**场景**：同一任务分发给多个 agent 并行处理，收集所有结果。

```
Coordinator ──broadcast──▶ [Agent A, Agent B, Agent C]
                           │         │         │
                           ▼         ▼         ▼
             waitAll ◀── result A  result B  result C
                           │
                           ▼
                      aggregate results
```

**实现**：

```typescript
async function broadcastCollect(
  agents: Agent[],
  prompt: string,
  opts?: { timeout?: number }
): Promise<AgentResult[]> {
  const paneSet = new PaneSet(agents.map(a => a.pane));
  
  // 1. 广播 prompt
  await paneSet.sendText(prompt + '\n');
  
  // 2. 等待所有 agent 完成
  await Promise.all(
    agents.map(agent =>
      agent.pane
        .expectVisibleText()
        .toContain(agent.completionMarker)
        .timeout(opts?.timeout ?? 120_000)
    )
  );
  
  // 3. 收集输出
  const results = await Promise.all(
    agents.map(async agent => ({
      agent: agent.name,
      output: cleanOutput(await agent.pane.captureText(), prompt),
    }))
  );
  
  return results;
}
```

**应用场景**：
- 多 agent 代码审查（每人审不同维度）
- 并行实现同一功能（竞争选优）
- 多角度分析同一问题

### 4.2 流水线 (Pipeline)

**场景**：任务按阶段串行传递，前一阶段输出作为后一阶段输入。

```
prompt ──▶ [Planner] ──plan──▶ [Coder] ──code──▶ [Reviewer] ──▶ result
```

**实现**：

```typescript
interface PipelineStage {
  agent: Agent;
  transform?: (prevOutput: string) => string; // 可选：改写 prompt
}

async function pipeline(
  stages: PipelineStage[],
  initialPrompt: string,
  opts?: { timeout?: number }
): Promise<string> {
  let currentInput = initialPrompt;
  
  for (const stage of stages) {
    // 如果有 transform，用它改写上一步输出为新 prompt
    const prompt = stage.transform
      ? stage.transform(currentInput)
      : currentInput;
    
    // 发送并等待
    currentInput = await ask(stage.agent, prompt, opts);
  }
  
  return currentInput;
}

// transform 示例
const codeStage: PipelineStage = {
  agent: coderAgent,
  transform: (plan) => `Based on this plan, implement the code:\n\n${plan}`,
};
```

**应用场景**：
- Plan → Implement → Review → Fix
- Research → Summarize → Write
- Analyze → Design → Code → Test

### 4.3 自由对话 (Dialogue)

**场景**：多个 agent 围绕一个话题自由讨论，coordinator 负责路由和裁决。

```
         ┌───────────────────────────────┐
         │       Coordinator             │
         │  (monitor + route + decide)   │
         └──────┬──────────┬─────────────┘
                │          │
     stream     │          │     stream
    ┌───────────┴──┐  ┌───┴───────────┐
    │   Agent A    │  │   Agent B     │
    │  (观点输出)   │  │  (观点输出)   │
    └──────────────┘  └───────────────┘
```

**实现**：

```typescript
interface DialogueConfig {
  agents: Agent[];
  topic: string;
  maxRounds: number;
  shouldContinue: (round: number, messages: DialogueMessage[]) => boolean;
}

interface DialogueMessage {
  from: string;
  content: string;
  round: number;
}

async function dialogue(config: DialogueConfig): Promise<DialogueMessage[]> {
  const messages: DialogueMessage[] = [];
  
  // 开场：向所有 agent 发送话题
  for (const agent of config.agents) {
    await ask(agent, `Topic for discussion: ${config.topic}\nPlease share your perspective.`);
  }
  
  for (let round = 1; round <= config.maxRounds; round++) {
    for (const agent of config.agents) {
      // 将其他 agent 的最新观点发送给当前 agent
      const context = messages
        .filter(m => m.from !== agent.name && m.round === round - 1)
        .map(m => `[${m.from}]: ${m.content}`)
        .join('\n\n');
      
      const prompt = context
        ? `Other perspectives:\n${context}\n\nYour response:`
        : `Continue the discussion on: ${config.topic}`;
      
      const response = await ask(agent, prompt);
      messages.push({ from: agent.name, content: response, round });
    }
    
    if (!config.shouldContinue(round, messages)) break;
  }
  
  return messages;
}
```

**应用场景**：
- 架构方案辩论
- 代码设计讨论
- 问题诊断协作

---

## 5. Agent 适配层

### 5.1 Agent 抽象

```typescript
interface AgentConfig {
  name: string;
  tool: 'claude' | 'codex' | 'gemini' | 'opencode' | 'shell';
  model?: string;
  completionMarker?: string | RegExp;
  launchCommand?: string; // 自定义启动命令
  cwd?: string;
}

class Agent {
  readonly name: string;
  readonly pane: Pane;
  readonly config: AgentConfig;
  
  private completionMarker: string | RegExp;
  
  constructor(pane: Pane, config: AgentConfig) {
    this.pane = pane;
    this.name = config.name;
    this.config = config;
    this.completionMarker = config.completionMarker ?? getDefaultMarker(config.tool);
  }
  
  /** 核心原语：发送 prompt 并等待回复 */
  async ask(prompt: string, opts?: { timeout?: number }): Promise<string> {
    const stream = this.pane.lineStream();
    await this.pane.sendText(prompt + '\n');
    
    // 等待完成标记
    await this.pane.expectVisibleText()
      .toContain(this.completionMarker)
      .timeout(opts?.timeout ?? 120_000);
    
    // 捕获并清洗输出
    const raw = await this.pane.captureText();
    return this.extractResponse(raw, prompt);
  }
  
  /** 仅发送，不等待回复 */
  async send(prompt: string): Promise<void> {
    await this.pane.sendText(prompt + '\n');
  }
  
  /** 检查 agent 是否空闲 */
  async isIdle(): Promise<boolean> {
    const snapshot = await this.pane.snapshot();
    const lastLine = extractLastLine(snapshot);
    return matchesMarker(lastLine, this.completionMarker);
  }
  
  private extractResponse(raw: string, prompt: string): string {
    // 清洗 ANSI、移除 prompt 回显、trim
    return cleanOutput(raw, prompt);
  }
}
```

### 5.2 各 Tool 启动命令

```typescript
function getLaunchCommand(config: AgentConfig): string {
  switch (config.tool) {
    case 'claude':
      return `claude --dangerously-skip-permissions${config.model ? ` --model ${config.model}` : ''}`;
    case 'codex':
      return `codex${config.model ? ` --model ${config.model}` : ''} --quiet`;
    case 'gemini':
      return `gemini`;
    case 'opencode':
      return `opencode`;
    case 'shell':
      return config.launchCommand ?? 'bash';
  }
}
```

### 5.3 完成标记默认值

```typescript
function getDefaultMarker(tool: AgentConfig['tool']): string | RegExp {
  switch (tool) {
    case 'claude':  return /[❯>]\s*$/;  // Claude Code prompt
    case 'codex':   return /[$>]\s*$/;
    case 'gemini':  return /[>$]\s*$/;
    case 'opencode': return /[>$]\s*$/;
    case 'shell':   return /[$#>]\s*$/;
  }
}
```

---

## 6. Channel 管理

### 6.1 Channel 类

```typescript
interface ChannelConfig {
  name: string;
  agents: AgentConfig[];
  cwd?: string; // 所有 agent 的工作目录
}

class Channel {
  readonly name: string;
  readonly session: Session;
  readonly agents: Map<string, Agent> = new Map();
  
  static async create(rmux: RMUX, config: ChannelConfig): Promise<Channel> {
    // 创建 session
    const session = await rmux.ensureSession(config.name);
    const channel = new Channel(config.name, session);
    
    // 为每个 agent 创建 pane 并启动
    for (const agentConfig of config.agents) {
      const pane = await session.spawn({
        command: getLaunchCommand(agentConfig),
        cwd: agentConfig.cwd ?? config.cwd,
      });
      
      const agent = new Agent(pane, agentConfig);
      channel.agents.set(agentConfig.name, agent);
      
      // 等待 agent 启动完成
      await agent.pane.expectVisibleText()
        .toContain(agent.config.completionMarker ?? '>')
        .timeout(30_000);
    }
    
    return channel;
  }
  
  /** 获取单个 agent */
  get(name: string): Agent {
    const agent = this.agents.get(name);
    if (!agent) throw new Error(`Agent "${name}" not found in channel "${this.name}"`);
    return agent;
  }
  
  /** 获取所有 agent 的 PaneSet */
  paneSet(): PaneSet {
    return new PaneSet([...this.agents.values()].map(a => a.pane));
  }
  
  /** 向频道内所有 agent 广播 */
  async broadcast(prompt: string, opts?: { timeout?: number }): Promise<AgentResult[]> {
    return broadcastCollect([...this.agents.values()], prompt, opts);
  }
  
  /** 销毁频道（终止所有 agent） */
  async destroy(): Promise<void> {
    await this.session.kill();
  }
}
```

---

## 7. Coordinator（顶层编排）

### 7.1 Coordinator 类

```typescript
interface CoordinatorConfig {
  channels?: ChannelConfig[];
}

class Coordinator {
  private rmux: RMUX;
  private channels: Map<string, Channel> = new Map();
  
  private constructor(rmux: RMUX) {
    this.rmux = rmux;
  }
  
  static async create(config?: CoordinatorConfig): Promise<Coordinator> {
    const rmux = await RMUX.builder().connectOrStart();
    const coord = new Coordinator(rmux);
    
    if (config?.channels) {
      for (const chConfig of config.channels) {
        await coord.addChannel(chConfig);
      }
    }
    
    return coord;
  }
  
  /** 创建新频道 */
  async addChannel(config: ChannelConfig): Promise<Channel> {
    const channel = await Channel.create(this.rmux, config);
    this.channels.set(config.name, channel);
    return channel;
  }
  
  /** 获取频道 */
  channel(name: string): Channel {
    const ch = this.channels.get(name);
    if (!ch) throw new Error(`Channel "${name}" not found`);
    return ch;
  }
  
  // ===== 协作模式快捷方法 =====
  
  /** 广播-收集 */
  async broadcast(channelName: string, prompt: string): Promise<AgentResult[]> {
    return this.channel(channelName).broadcast(prompt);
  }
  
  /** 流水线 */
  async pipeline(stages: PipelineStage[], initialPrompt: string): Promise<string> {
    return pipeline(stages, initialPrompt);
  }
  
  /** 自由对话 */
  async dialogue(config: DialogueConfig): Promise<DialogueMessage[]> {
    return dialogue(config);
  }
  
  /** 跨频道单点问答 */
  async ask(channelName: string, agentName: string, prompt: string): Promise<string> {
    return this.channel(channelName).get(agentName).ask(prompt);
  }
  
  /** 关闭所有频道 */
  async shutdown(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.destroy();
    }
  }
}
```

---

## 8. 使用示例

### 8.1 基础用法

```typescript
import { Coordinator } from 'rmux-collab';

const coord = await Coordinator.create({
  channels: [{
    name: 'dev',
    cwd: '/project',
    agents: [
      { name: 'planner', tool: 'claude', model: 'claude-opus-4-6' },
      { name: 'coder', tool: 'codex', model: 'gpt-5.5' },
      { name: 'reviewer', tool: 'claude', model: 'claude-sonnet-4-6' },
    ],
  }],
});

// 单点问答
const plan = await coord.ask('dev', 'planner', 'Design an auth module with JWT');

// 流水线
const result = await coord.pipeline([
  { agent: coord.channel('dev').get('planner') },
  { agent: coord.channel('dev').get('coder'), transform: p => `Implement:\n${p}` },
  { agent: coord.channel('dev').get('reviewer'), transform: c => `Review:\n${c}` },
], 'Build a user registration API');

// 广播
const reviews = await coord.broadcast('dev', 'Review src/auth.ts for security issues');
```

### 8.2 动态频道

```typescript
// 按需创建频道
const debugChannel = await coord.addChannel({
  name: 'debug-session',
  cwd: '/project',
  agents: [
    { name: 'investigator', tool: 'claude' },
    { name: 'reproducer', tool: 'shell', launchCommand: 'bash' },
  ],
});

// investigator 分析 → reproducer 验证
const hypothesis = await debugChannel.get('investigator').ask('Analyze this stack trace: ...');
const verification = await debugChannel.get('reproducer').ask(`Run: ${hypothesis.suggestedCommand}`);
```

### 8.3 自由对话（架构辩论）

```typescript
const debate = await coord.dialogue({
  agents: [
    coord.channel('dev').get('planner'),   // 架构视角
    coord.channel('dev').get('reviewer'),   // 质量视角
  ],
  topic: 'Should we use microservices or monolith for this 5-person team?',
  maxRounds: 3,
  shouldContinue: (round, msgs) => {
    // 如果达成共识就停止
    const lastTwo = msgs.slice(-2);
    return !lastTwo.every(m => m.content.includes('I agree'));
  },
});
```

---

## 9. 可观测性

### 9.1 实时观察

所有 agent 运行在 rmux pane 中，可随时 attach 查看：

```bash
# 列出所有活跃频道
rmux list-sessions

# 实时观察某个 agent
rmux attach -t dev:coder

# 观察所有 pane 输出
rmux stream-pane -t dev:planner --lines
```

### 9.2 事件日志

Coordinator 自动记录所有交互：

```typescript
interface InteractionLog {
  timestamp: number;
  channel: string;
  agent: string;
  direction: 'send' | 'receive';
  content: string;
  duration_ms?: number;
}
```

### 9.3 Web Share（远程观察）

```typescript
// 将频道暴露到浏览器
const share = await coord.channel('dev').session.webShare({ role: 'spectator' });
console.log(`Watch at: ${share.url}`);
```

---

## 10. 错误处理

### 10.1 超时

```typescript
// Agent 级别超时
try {
  await agent.ask(prompt, { timeout: 60_000 });
} catch (e) {
  if (e instanceof WaitTimeoutError) {
    // agent 未在时限内完成
    // 可选：发送 Ctrl+C 中断
    await agent.pane.keyboard().press('Control+c');
  }
}
```

### 10.2 Agent 崩溃

```typescript
// 监控 agent 进程退出
agent.pane.on('exit', (reason) => {
  console.error(`Agent ${agent.name} exited: ${reason}`);
  // 可选：自动重启
});
```

### 10.3 广播部分失败

```typescript
const results = await channel.broadcast(prompt);
const failed = results.filter(r => r.error);
if (failed.length > 0) {
  // 部分 agent 失败，决定是否重试
}
```

---

## 11. 项目结构

```
rmux-collab/
├── src/
│   ├── index.ts                 # 公开 API 导出
│   ├── coordinator.ts           # Coordinator 类
│   ├── channel.ts               # Channel 类
│   ├── agent.ts                 # Agent 类 + 完成标记检测
│   ├── patterns/
│   │   ├── broadcast-collect.ts # 广播-收集实现
│   │   ├── pipeline.ts          # 流水线实现
│   │   └── dialogue.ts          # 自由对话实现
│   ├── utils/
│   │   ├── output-cleaner.ts    # ANSI 清洗 + 回显移除
│   │   └── logger.ts            # 交互日志
│   └── types.ts                 # 共享类型定义
├── examples/
│   ├── basic-ask.ts             # 最简单的单 agent 问答
│   ├── broadcast-review.ts      # 多 agent 并行审查
│   ├── pipeline-dev.ts          # Plan → Code → Review 流水线
│   └── dialogue-debate.ts       # 架构辩论
├── package.json
├── tsconfig.json
└── README.md
```

### 11.1 package.json

```json
{
  "name": "rmux-collab",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "example:basic": "tsx examples/basic-ask.ts",
    "example:broadcast": "tsx examples/broadcast-review.ts"
  },
  "dependencies": {
    "@rmux/sdk": "^0.6.5"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.0.0"
  }
}
```

---

## 12. 实施路线

### Phase 1：核心原语 (PoC) ✅

- [x] 项目脚手架 + @rmux/sdk 集成
- [x] Agent 类：`ask()` / `send()` / `isIdle()` / `interrupt()` / `kill()`
- [x] Channel 类：创建 session + spawn agents
- [x] 完成标记检测（Claude、shell）— sentinel 模式 + snapshot diff
- [x] 输出清洗（stripAnsi）
- [x] 验证：两个 agent pane 互相对话 ✅ (coordinator-e2e.ts)

### Phase 2：协作模式 ✅

- [x] broadcast-collect 实现
- [x] pipeline 实现
- [x] dialogue 实现
- [x] 超时和错误处理（sentinel timeout + polling deadline）
- [x] 交互日志（Logger 集成到 Coordinator）

### Phase 3：生产化 ✅

- [x] 多 tool 适配（codex、gemini、opencode）— getLaunchCommand 支持全部
- [ ] Web Share 集成（待实际需求时添加）
- [x] 动态频道创建/销毁（addChannel + destroy）
- [x] Agent 健康检测（alive flag + interrupt + kill）
- [x] CLI 入口（`rmux-collab start config.ts`）

### Phase 4：Maestro 融合

- [ ] 作为 maestro transport adapter 注册
- [ ] 复用 maestro 的 tool resolution (cli-tools.json)
- [ ] 与 delegate 命令互操作
- [ ] Session resume 支持

---

## 13. 与 rmux Claude Teammate 的区别

| 维度 | rmux Claude Teammate | rmux-collab |
|------|---------------------|-------------|
| Agent 类型 | 仅 Claude Code | 混合（任意 CLI） |
| 协作模式 | Claude 内置 team 模式 | 外部 coordinator 编排 |
| 通信 | 私有 tmux shim 拦截 | 标准 prompt/stdout |
| 配置 | 环境变量 | TypeScript 配置文件 |
| 可扩展性 | Claude 生态内 | 开放，任意 LLM CLI |
| 观测 | rmux attach | attach + web share + 日志 |

---

## 14. 关键设计决策记录

1. **不引入消息协议** — 消息即 prompt，避免 agent 需要实现特殊协议
2. **完成标记而非结构化回复** — 依赖 CLI 工具的天然 idle 信号，零侵入
3. **Session-per-Channel** — 利用 rmux session 隔离不同协作上下文
4. **Coordinator 单进程** — 避免分布式复杂性，单 TypeScript 进程编排
5. **增量流式优先** — 使用 lineStream 而非 captureText，支持长输出
6. **独立包优先** — 先验证核心价值，再考虑 maestro 集成点

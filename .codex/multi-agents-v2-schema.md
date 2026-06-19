# Multi Agents V2 Schema

生成日期：2026-06-07

本文档记录当前会话中可直接调用的 `multi_agents v2` 相关底层方法。这里的 schema 以当前运行时暴露给根 Agent 的工具定义为准。

## 方法总览

| 方法 | 作用 | 是否触发目标 Agent 执行 |
| --- | --- | --- |
| `spawn_agent` | 创建新的子 Agent，并给它初始任务 | 是 |
| `send_message` | 向已有 Agent 发送消息 | 否 |
| `followup_task` | 向已有 Agent 发送后续任务 | 是 |
| `wait_agent` | 等待任意 live Agent 的 mailbox 更新或 final 通知 | 不适用 |
| `close_agent` | 关闭指定 Agent 及其 descendants | 不适用 |
| `list_agents` | 列出当前 root thread tree 中的 live Agents | 不适用 |
| `spawn_agents_on_csv` | 按 CSV 行批量创建 worker Agent，并导出结构化结果 | 是 |

## `spawn_agent`

创建一个新的子 Agent 来执行指定任务。

```ts
spawn_agent({
  task_name: string,
  message: string,
  fork_turns?: string
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `task_name` | `string` | 是 | 无 | 子 Agent 名称。只能使用小写字母、数字和下划线。 |
| `message` | `string` | 是 | 无 | 发送给新 Agent 的初始任务说明。 |
| `fork_turns` | `string` | 否 | `"all"` | 传递给子 Agent 的上下文轮数。可用值包括 `"none"`、`"all"`，或正整数字符串，例如 `"3"`。 |

### 行为

- 如果当前任务名是 `/root/task1`，并使用 `task_name: "task_3"` 创建子 Agent，则新 Agent 的 canonical task name 是 `/root/task1/task_3`。
- 根 Agent 可以用相对名 `task_3` 或 canonical name `/root/task1/task_3` 引用该 Agent。
- 不同分支下同名 Agent 需要使用 canonical name 区分。
- 子 Agent 与根 Agent 拥有同等工具能力，也可以继续创建自己的子 Agent。
- 子 Agent 完成后，它的 final answer 会回传给调用方。
- 当前会话配置的并发上限是 `max_concurrent_threads_per_session = 4`。

### 示例

```ts
spawn_agent({
  task_name: "api_audit",
  message: "审计 API 路由的消费者和响应字段使用情况。",
  fork_turns: "3"
})
```

## `send_message`

给已有 Agent 发送消息，但不触发它开始新的执行轮次。

```ts
send_message({
  target: string,
  message: string
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `string` | 是 | 无 | 目标 Agent id、相对任务名，或 canonical task name。 |
| `message` | `string` | 是 | 无 | 要投递给目标 Agent 的消息内容。 |

### 行为

- 消息会被投递到目标 Agent 的 mailbox。
- 不会触发目标 Agent 开始新一轮执行。
- 适合补充上下文、发送约束、传递中间发现，或给正在运行的 Agent 排队信息。

### 示例

```ts
send_message({
  target: "api_audit",
  message: "补充约束：不要修改源码，只输出风险清单。"
})
```

## `followup_task`

给已有 Agent 发送后续任务，并触发它执行。

```ts
followup_task({
  target: string,
  message: string
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `string` | 是 | 无 | 目标 Agent id、相对任务名，或 canonical task name。 |
| `message` | `string` | 是 | 无 | 要交给目标 Agent 执行的后续任务内容。 |

### 行为

- 如果目标 Agent 当前空闲，消息会触发它开始一轮新执行。
- 如果目标 Agent 当前正在执行，消息会排队，并在当前 turn 完成后作为下一轮任务执行。
- 适合让已经创建的 Agent 继续做明确的新任务。

### 与 `send_message` 的区别

| 方法 | 语义 | 触发执行 | 典型用途 |
| --- | --- | --- | --- |
| `send_message` | 发消息 | 否 | 补充上下文、发送提醒、传递约束 |
| `followup_task` | 发任务 | 是 | 让目标 Agent 继续处理一个明确任务 |

## `wait_agent`

等待任意 live Agent 的 mailbox 更新，包括排队消息和 final-status 通知。

```ts
wait_agent({
  timeout_ms?: number
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `timeout_ms` | `number` | 否 | `30000` | 最小 `10000`，最大 `3600000` | 等待 mailbox 更新的超时时间，单位毫秒。 |

### 行为

- 返回哪些 Agent 有更新，或返回超时摘要。
- 不直接返回消息正文。
- 收到更新后，需要根据上下文继续处理对应 Agent 的结果或状态。

### 示例

```ts
wait_agent({
  timeout_ms: 60000
})
```

## `close_agent`

关闭指定 Agent 以及它打开的 descendants。

```ts
close_agent({
  target: string
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `string` | 是 | 无 | 要关闭的 Agent id、相对任务名，或 canonical task name。 |

### 行为

- 请求关闭目标 Agent 及其子 Agent。
- 返回目标 Agent 在关闭请求前的状态。
- 适合在子任务结果已经收齐、不再需要该 Agent 时释放 live thread。

### 示例

```ts
close_agent({
  target: "api_audit"
})
```

## `list_agents`

列出当前 root thread tree 中的 live Agents。

```ts
list_agents({
  path_prefix?: string
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path_prefix` | `string` | 否 | 无 | 按 task-path 前缀过滤，不要带末尾斜杠。 |

### 行为

- 返回当前 root thread tree 下仍然 live 的 Agent。
- 可用 `path_prefix` 缩小到某个任务分支。

### 示例

```ts
list_agents({
  path_prefix: "/root/api_audit"
})
```

## `spawn_agents_on_csv`

按 CSV 每一行创建一个 worker Agent，使用指令模板执行批处理，并收集结构化结果。

```ts
spawn_agents_on_csv({
  csv_path: string,
  instruction: string,
  id_column?: string,
  max_concurrency?: number,
  max_workers?: number,
  max_runtime_seconds?: number,
  output_csv_path?: string,
  output_schema?: object
}) => unknown
```

### 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `csv_path` | `string` | 是 | 无 | 输入 CSV 文件路径。 |
| `instruction` | `string` | 是 | 无 | 每个 worker 的任务模板。可以使用 `{column_name}` 占位符引用当前行字段。 |
| `id_column` | `string` | 否 | 行号 | 用作稳定 item id 的 CSV 列名。 |
| `max_concurrency` | `number` | 否 | `16` | 最大并发 worker 数，受会话配置上限限制。 |
| `max_workers` | `number` | 否 | `16` | `max_concurrency` 的别名。 |
| `max_runtime_seconds` | `number` | 否 | `1800` 或配置默认值 | 单个 worker 的最大运行时间，单位秒。 |
| `output_csv_path` | `string` | 否 | 输入 CSV 同目录下的默认结果路径 | 结果 CSV 输出路径。 |
| `output_schema` | `object` | 否 | 无 | 每个 worker 上报结果需要匹配的 JSON Schema。 |

### 行为

- 每个 CSV 行会生成一个 worker Agent。
- `instruction` 中的 `{column_name}` 会替换为该行对应列的值。
- 调用会阻塞，直到所有 worker 完成或失败。
- 所有结果会自动导出到 `output_csv_path`，如果未提供则使用默认路径。
- 每个 worker 必须调用内部的 `report_agent_job_result` 上报 JSON 对象。
- 如果提供了 `output_schema`，worker 上报对象需要匹配该 schema。
- 未上报结果的 worker 会被视为失败。

### 示例

```ts
spawn_agents_on_csv({
  csv_path: "D:/maestro2/.workflow/tasks.csv",
  id_column: "id",
  instruction: "检查任务 {id}：{description}。只输出结构化结论。",
  max_concurrency: 4,
  output_csv_path: "D:/maestro2/.workflow/results.csv",
  output_schema: {
    type: "object",
    required: ["status", "summary"],
    properties: {
      status: {
        type: "string",
        enum: ["pass", "fail", "blocked"]
      },
      summary: {
        type: "string"
      }
    }
  }
})
```

## 内部但非根 Agent 直接暴露的方法

### `report_agent_job_result`

`spawn_agents_on_csv` 创建的 worker 需要使用该内部方法上报结构化结果，但它不是当前根 Agent 这里直接暴露的可调用入口。

```ts
report_agent_job_result(result: object) => unknown
```

### 行为

- 只在 CSV worker 的任务上下文中使用。
- 上报对象会被收集并导出到结果 CSV。
- 如果 `spawn_agents_on_csv` 提供了 `output_schema`，上报对象需要符合该 schema。

## 消息接收协议

根 Agent 可能在 analysis channel 收到其他 Agent 的消息，格式如下：

```text
Message Type: MESSAGE | FINAL_ANSWER
Sender: <author>
Payload:
<payload text>
```

### 含义

| 字段 | 说明 |
| --- | --- |
| `Message Type: MESSAGE` | 普通消息或中间状态。 |
| `Message Type: FINAL_ANSWER` | 子 Agent 已完成任务并返回最终答案。 |
| `Sender` | 发送方 Agent。 |
| `Payload` | 消息正文。 |

## 非 multi-agent v2 方法

`multi_tool_use.parallel` 不是 `multi_agents v2`。它只是并行调用多个工具，用于提高独立工具调用的执行效率，不会创建 Agent，也不会产生 Agent mailbox 或 final answer。


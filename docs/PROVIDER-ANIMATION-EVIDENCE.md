# Provider 细类来源与限制

目录项不等于原生可观察能力。当前被动接入没有可证明的新 `retrying` 映射；Claude 的 `output_limited` 精确分类也不足。任务进度只在 [#16](https://github.com/Gogo-Bytes/agent-pet/issues/16)，本文维护版本化依据和负语义，不代表上游所有版本永不支持。

| 观察面 | 已确认事实 | 当前解释 |
| --- | --- | --- |
| pi 0.85.1 | AgentSession 有 retry start/end，但 ExtensionAPI 不转发 | retrying 保持 unknown，不伪注册 pi.on，不用 socket 重连替代业务重试 |
| Claude npm 2.1.301 | normalize 接受 StopFailure.error=max_output_tokens；官方滚动网页列举该类别 | 缺同版本分类条件及与上下文容量/限流的可靠区分，matching-prompt turn-failed 仍是通用 error/错误未读 |
| Claude retrying | Hook 表没有已证实可配对的通用业务重试生命周期 | PermissionDenied.retry 是控制输出，不是已执行事实 |
| Codex 0.163.0 | 当前没有可接的版本化业务重试来源 | 保持未知；独立错误另见[错误事实边界](CODEX-ERROR-FEEDBACK-LIMIT.md) |

## pi：SDK 事件不等于扩展事件

公开 v0.85.1 固定提交 **`d981de1229ef899957bbe968bc8dcda02a21f477`**，包名 `@earendil-works/pi-coding-agent`。公开源码版本不证明本机运行字节一致。

- [`agent-session.ts`](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/agent-session.ts)：`AgentSessionEvent` 的 `auto_retry_start` / `auto_retry_end` 经 `_prepareRetry` 等路径调用 `_emit`，分派给 `session.subscribe` 登记的 `_eventListeners`。
- [`extensions/types.ts`](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts) 的 ExtensionEvent/ExtensionAPI.on 无两项 retry；AgentSession 的 `_emitExtensionEvent` 显式转发中也无 retry。[`runner.ts`](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/runner.ts) 只分派传入事件，不自动桥接 SDK 订阅流。
- [`SDK 文档`](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/sdk.md) 的 subscribe 示例不能当作 pi.on 合同，`pi.events` 自定义总线也不自动获得原生 retry。
- 压缩 `willRetry` 是 overflow recovery，失败项可能只表示“本来会重试”；`_isRetryableError` 将 context overflow 交给 compaction，不是通用 retry。`agent_settled` 在自动重试/压缩/续队列结束后发生，可用作完成边界，但不能倒推出重试开始。

恢复映射前须有当前被动扩展可接收的 start/end、成功、耗尽、取消契约。升级版本、换 SDK/RPC 宿主或另引信任来源是独立范围决定，不是补一条监听。

## Claude：错误说明未建立 Hook 分类契约

以下网页是官方滚动文档，**未固定为2.1.301**：

- [StopFailure input](https://code.claude.com/docs/en/hooks#stopfailure-input) 描述 API error 时替代 Stop，字段为 `error`（不是 `error_type`），枚举含 max_output_tokens/rate_limit/invalid_request/unknown；未定义 max_output_tokens 的精确产生条件及版本化分类实现。
- [输出截断](https://code.claude.com/docs/en/errors#response-exceeded-the-output-token-maximum) 描述响应达到请求允许的输出上限，并说明 streaming→non-streaming 的64000限制及2.1.299以前提示差异。
- [Prompt is too long](https://code.claude.com/docs/en/errors#prompt-is-too-long) 描述输入/附件超过上下文窗口；错误页还区分 thinking budget 大于最大响应长度。
- 这些说明未关联到 StopFailure.error 分类。Messages API stop_reason=max_tokens、错误文本、类别名相似性都不能补齐 CLI Hook 契约。[npm2.1.301](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.301) 是 native 平台分发元数据，不是分类源码。

只有取得已支持版本的官方字段条件或可定位的原生分类实现，能区分输出上限、上下文容量、请求参数、限流和未知错误后，才可新增精确 occurrence/capability；不能用付费模型试错代替契约。

## 本地映射约束

- [Claude normalize](../integrations/claude-hooks/normalize.ts) 精确保留白名单类别，未知值归 unknown、正文丢弃；[observations](../integrations/claude-hooks/observations.ts) 拒绝 child/旧会话/无关联 prompt，匹配 turn-failed 清近期反馈、保留通用错误未读。
- [pi 扩展](../integrations/pi-extension/index.ts) 只监听被动原生事件，retryDelay 仅 socket 恢复，agent_start 复用未 settled workId 不意味着重试。agent_settled 仍需 idle/本轮身份/终态守卫。
- [共享投影](../packages/pet-runtime/src/presentation.ts) 仅消费 supported 的细活动/occurrence。缺信号不能从动画 clip、计时器、正文或进程存在反推。
- 若新增可靠细类，先覆盖 normalize→mapper→Application/投影及重复、旧 prompt、child、retire、新 work、通用错误和缺 clip fallback；保留错误未读，不制造成功。自动化合成字段证明映射行为，不证明原生产生语义。

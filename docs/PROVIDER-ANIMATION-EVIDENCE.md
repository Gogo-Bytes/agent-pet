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

## 候选宿主：Antigravity CLI

Google 的[迁移公告](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)确认 Antigravity CLI 是独立终端产品，不等同于 Gemini CLI 或 Antigravity IDE。[官方下载页](https://antigravity.google/download/)列出 CLI v1.5.9；下述 [Hooks 契约](https://antigravity.google/docs/hooks/#input-and-output-contract)是滚动文档，不能据此认定每个字段已在 v1.5.9 验证。

`SessionStart` 表示新对话开始，不是进程在线心跳；`PostInvocation` 是一次模型调用结束，不是整轮完成。`Stop` 的 `fullyIdle` 区分是否还有后台活动，本身不表示成功。`conversationId` 标识对话，不能单独证明哪个本机进程或配置拥有它。

**不采用当前文档描述的完整 JSON 输入。** 公共输入字段包含 `lastUserInput` 和 `transcriptPath`；工具事件还可携带工具参数。先解析完整载荷再删字段不能满足不读取正文的要求。重新评估的前提是：有绑定到具体 CLI 版本、无需读取正文即可识别事件和可信宿主的方案，且不参与审批、不改变执行结果。此结论不否认 Hooks 存在，也不作为桌面宿主的支持声明。

## 候选宿主：Codex 桌面端

OpenAI 的[插件打包说明](https://developers.openai.com/plugins/build/plugins)明确支持手动安装的桌面插件携带生命周期 hooks；安装或启用不等于信任，用户须单独审阅当前 hook 定义。含 hooks 的插件不能进入公共插件目录。这是桌面端自身的入口，不是 [standalone CLI 0.163.0 接入](../integrations/codex-hooks/README.md)的兼容声明。

按[官方事件字段](https://learn.chatgpt.com/docs/hooks)，可先评估只订阅 `SessionStart` / `SessionEnd`：前者的 `source` 可为恢复、清空或压缩，不能一律算新任务；后者不是成功或退出桌面程序的证明。`session_id` 在子代理事件中可复用父会话 ID。文档列出的公共字段不足以验证本机桌面宿主进程及其所属配置。`UserPromptSubmit.prompt` 和 `Stop.last_assistant_message` 可含正文，不纳入此候选范围，也不打开 `transcript_path`。

**接入按已授权的 Codex 配置，不区分桌面与 CLI。** 通过该配置的接收凭据和原生进程校验后，事件沿用 Codex 映射及桌宠绑定；不因缺少客户端标签拒绝，也不把会话事件当作持续工作或任务完成。另起 App Server 不能证明观察到了用户已有桌面会话。

**具体版本核对（macOS）**：[上游用户报告 #25293](https://github.com/openai/codex/issues/25293)列出 App `26.601.21317`（build `3511`）及内置 CLI `0.136.0-alpha.2`。这是设置页现场报告，不是官方发行映射或事件执行验收。对应 tag 的 [SessionStart 序列化结构](https://github.com/openai/codex/blob/rust-v0.136.0-alpha.2/codex-rs/hooks/src/schema.rs#L485-L516)只有 `session_id`、`transcript_path`、`cwd`、`hook_event_name`、`model`、`permission_mode`、`source`；[发送实现](https://github.com/openai/codex/blob/rust-v0.136.0-alpha.2/codex-rs/hooks/src/events/session_start.rs)中 `source` 表示启动、恢复、清空或压缩，不是客户端来源。该载荷没有提示正文，但也没有当前客户端、宿主进程或配置身份。归属以接收端校验的配置为准，不读取 transcript 来猜测客户端。该版本的桌面事件是否送达本产品尚未验收。

## 候选宿主：Antigravity App（非 IDE）

[桌面 App 的 Hooks 设置](https://antigravity.google/docs/hooks/#managing-hooks-in-the-antigravity-app)位于 Settings → Customizations → Hooks。工作区 `.agents/hooks.json` 和全局 `~/.gemini/config/hooks.json` 与 CLI 使用相同的位置；不能把在那里配置的 hook 当成桌面专属入口。文档区分 App、CLI、IDE 的数据目录，但 `transcriptPath` 指向某个目录并不是宿主身份凭证。

[输入契约](https://antigravity.google/docs/hooks/#common-input-fields)把 `lastUserInput` 列为所有 hooks 的公共输入；个别示例省略该字段，不代表只订阅 `SessionStart` 就不会收到提示正文。`Stop` 表示执行循环终止，不是窗口关闭。**暂不接入**：尚未核实哪个桌面构建支持在投递前排除正文，并能把事件绑定到获准观察的 App 配置。无需读取 transcript 或安装 hook 来推断这些能力。

## 本地映射约束

- [Claude normalize](../integrations/claude-hooks/normalize.ts) 精确保留白名单类别，未知值归 unknown、正文丢弃；[observations](../integrations/claude-hooks/observations.ts) 拒绝 child/旧会话/无关联 prompt，匹配 turn-failed 清近期反馈、保留通用错误未读。
- [pi 扩展](../integrations/pi-extension/index.ts) 只监听被动原生事件，retryDelay 仅 socket 恢复，agent_start 复用未 settled workId 不意味着重试。agent_settled 仍需 idle/本轮身份/终态守卫。
- [共享投影](../packages/pet-runtime/src/presentation.ts) 仅消费 supported 的细活动/occurrence。缺信号不能从动画 clip、计时器、正文或进程存在反推。
- 若新增可靠细类，先覆盖 normalize→mapper→Application/投影及重复、旧 prompt、child、retire、新 work、通用错误和缺 clip fallback；保留错误未读，不制造成功。自动化合成字段证明映射行为，不证明原生产生语义。

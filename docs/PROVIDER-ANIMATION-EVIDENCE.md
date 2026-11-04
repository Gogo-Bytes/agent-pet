# Provider 动画细类：输出限制与业务重试证据

## 当前结论

基线 `37ac506`，本轮仅恢复用户指定的第3项：Claude `output_limited` 与业务 `retrying` 的可靠事件映射；动画拼接和其他尾段继续暂缓。**implementable = false：当前被动接入边界内没有已证实可新增的映射。** 完成的是原始来源核验与本地接线核对，不是功能实现或原生验收。

官方原文本轮已成功取得，不能再归因于抓取失败。两项阻塞不同：

| 项目 | 已确认事实 | 未完成与保留行为 |
| --- | --- | --- |
| pi retrying | 0.85.1 的自动重试存在于 AgentSession/SDK 订阅流，未转发给当前 TUI ExtensionAPI | 当前扩展观察面不可直接接线；`retrying` 保持 `unknown`，不伪注册 `pi.on`、不用 socket 重连替代 |
| Claude output_limited | 官方 Hook 列举 `error=max_output_tokens`；官方错误页另定义输出截断 | 缺二者精确关联及已验证版本的分类契约；matching-prompt `turn-failed` 仍为通用 `error`/错误未读，不新增 occurrence/capability |
| Claude retrying | 已查 Hook 表未找到可配对的通用自动重试观察生命周期 | 不把 `PermissionDenied.retry` 控制输出或重试建议当执行事实 |
| Codex | 本轮没有新的版本化重试证据 | 未扩展调查或实现，不套用其他 Provider 结论 |

不改变22项目录、作者接口、fallback、latest-wins、业务 once、在线绑定过滤或离线立即移除。没有新来源不等于活动不存在，也不把本次结论扩大为上游所有版本永不支持。

## pi：事件存在，但不在当前扩展观察面

公开 tag `v0.85.1` 解析到提交 `d981de1229ef899957bbe968bc8dcda02a21f477`。官方仓库旧地址 `badlogic/pi-mono` 重定向至 `earendil-works/pi`；版本化 package 声明 `@earendil-works/pi-coding-agent` / `0.85.1`。这是公开源码版本证据，不证明本机正在运行实例的字节一致性。

固定版本来源：
- [tag](https://api.github.com/repos/badlogic/pi-mono/git/ref/tags/v0.85.1)、[package](https://raw.githubusercontent.com/badlogic/pi-mono/v0.85.1/packages/coding-agent/package.json)
- [extensions/types.ts](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts)
- [extensions/runner.ts](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/runner.ts)
- [agent-session.ts](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/agent-session.ts)
- [SDK 文档](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/sdk.md)

声明与发送链核对：
1. `AgentSessionEvent` 包含 `auto_retry_start`（attempt/maxAttempts/delayMs/errorMessage）和 `auto_retry_end`（success/attempt/finalError）。`_prepareRetry` 及成功、耗尽、取消路径通过 `this._emit(...)` 发布；`_emit` 遍历 `_eventListeners`，由 `session.subscribe` 登记。
2. 同版本 `ExtensionEvent`、`ExtensionAPI.on` 声明没有这两种事件；`_emitExtensionEvent` 的显式 agent/turn/message/tool 转发分支没有 retry。`ExtensionRunner.emit` 仅分派传入的 event.type，不是 Session 订阅流的自动桥接。
3. SDK 示例使用 `session.subscribe` 处理重试，另以 `pi.on("agent_start", ...)` 说明扩展，不能混用两者。扩展共享 `pi.events` 示例是自定义 event bus，并无原生 retry 自动投递契约。
4. 压缩事件的 `willRetry` 描述 overflow recovery（失败项甚至仅表示本来会重试），不是通用自动重试 start/end。上游 `_isRetryableError` 注释明确：`Context overflow errors are NOT retryable (handled by compaction instead).`
5. `agent_settled` 原说明是 `Fired after an agent run has fully settled and no automatic retry, compaction, or queued continuation will run.` 它可维持现有整批完成边界，但不能倒推出重试开始。

**恢复条件：** 上游在当前被动扩展形式提供可验证的 retry start/end（含取消、成功、耗尽）契约。切换为 SDK/RPC 宿主、升级版本或另引信任来源都不是本任务中的“补接线”，须另行确认范围；本轮不实施。

## Claude：类别和错误定义存在，精确分类关联仍缺失

已验证集成基线为仓库记录的 Claude `2.1.301`。以下 Hooks/Errors 是**当前官方网页，未固定到2.1.301**；不能因网页可读就视作该版本的完整契约。

- [StopFailure input](https://code.claude.com/docs/en/hooks#stopfailure-input)：`Runs instead of Stop when the turn ends due to an API error.` 字段说明为 `The error field identifies the error type and is used for matcher filtering.` 枚举包含 `max_output_tokens`、`rate_limit`、`invalid_request`、`unknown` 等，但没有给该枚举值单独的产生条件或版本化分类实现。字段是 `error`，不是搜索摘要中的 `error_type`。
- [Response exceeded the output token maximum](https://code.claude.com/docs/en/errors#response-exceeded-the-output-token-maximum)：`Claude’s reply reached the largest number of output tokens the request allowed and was cut off there`。另述 streaming 失败后 non-streaming 路径的64,000输出限制，以及2.1.299以前该路径截断可能没有该提示。
- [Prompt is too long](https://code.claude.com/docs/en/errors#prompt-is-too-long)：`The conversation plus attached files exceeds the model’s context window.` 同一错误页也区分 thinking budget 大于最大响应长度。
- 这些错误说明**未连接到 `StopFailure.error` 的分类规则**。不能使用 Messages API `stop_reason=max_tokens`、错误文本或名称相似性代替 CLI Hook 契约。
- [官方 npm 2.1.301 元数据](https://registry.npmjs.org/@anthropic-ai/claude-code/2.1.301) 的 `bin.claude=bin/claude.exe`、`postinstall=node install.cjs` 与同版本平台 optionalDependencies 表明 native 平台分发；本轮未取得可定位的分类源码，未下载 tarball/二进制、运行安装或逆向。

**恢复条件：** 官方明确说明已支持版本 `StopFailure.error=max_output_tokens` 的产生条件及其与上下文容量、请求参数、限流、未知错误的区分，或提供可核对的该版本原生分类实现。尚缺的是契约，不是用户同意猜测；不请求真实付费模型调用来替代契约。

## 本地接线核对与条件性实施入口

本轮只读核对以下现有代码/测试，未运行测试，也未改变其行为：

- [Claude normalize](../integrations/claude-hooks/normalize.ts)：`claudeFailureKinds` 精确保留 `max_output_tokens`；未知字符串归 `unknown`，`last_assistant_message` 等正文丢弃。[normalize 测试](../integrations/claude-hooks/normalize.test.ts) 只有合成类别白名单证据，不证明原生产生语义。
- [Claude observations](../integrations/claude-hooks/observations.ts)：`accept` 拒绝 child/旧会话/未关联 prompt；matching-prompt `turn-failed` 清反馈、设置 `failed`，`emit` 发布 `status: error`。未设置 `output_limited`/`retrying` 能力。[observations 测试](../integrations/claude-hooks/observations.test.ts) 现覆盖通用错误、工具错误分离、旧 prompt、retire 和去重；不是细分类原生测试。
- [pi 扩展](../integrations/pi-extension/index.ts)：只用被动 `pi.on`，`retrying` 初始为 `unknown` 且无升级为 supported 的分支。网络 `retryDelay` 属 socket 恢复；`agent_start` 可复用未 settled 的 workId，但不推断正在重试；只有 `agent_settled` 加 idle/本轮守卫发布终态。[活动测试](../integrations/pi-extension/activities.test.ts) 有 retrying unknown 和整批终态断言，均为合成 callbacks，不是原生 retry 证据。
- [共享投影](../packages/pet-runtime/src/presentation.ts)：只有 supported capability 才消费细活动/occurrence；目录项和资产 clip 不能反过来制造 Provider 事实。

若 Claude 契约补齐，最小实现入口是 `observations.ts` 的 matching-prompt `turn-failed`：保留错误未读，仅精确已证实类别增加一次 `output_limited` occurrence/capability。须先红测 normalize→observations→Application/投影，以及重复、旧prompt、子任务、retire、新work、通用错误与缺clip fallback。**该条件建议本轮未执行。** pi 在当前版本/接入边界没有对应可直接实现的入口。

## 证据与验证边界

- 研究阶段已成功抓取上述官方原文和固定版代码；本开发阶段复核研究报告与仓库本地链路，没有追加外网研究。
- 研究的自动 `source_check` 返回 unclear / 0.30，命中非指定版本，不能作通过依据；pi 结论来自直接核对上述固定版本声明和发送链。第三方指南、插件、搜索摘要及不匹配版本的源码不补关键证据。
- 仓库 Claude README 的旧“daily hooks have not been upgraded”不是最新部署状态；版本和实测范围以[MVP执行计划](MVP-EXECUTION-PLAN.md#claude-任务反馈2026-10-19常用反馈真实验证完成)为准，既有常用反馈验收不证明本次细类。
- 本轮只有证据文档与进度/审计更新，检查本地引用和 diff；无生产代码/测试变更，不重跑或冒称测试、typecheck、build、GUI/原生验收。未读写用户配置、部署、启动Agent/请求模型、安装升级、重启dev、改资产或推送。

## 后续生命周期覆盖（不解除上述细类阻塞）

基于 `95dd667` 的适配修复第一阶段：pi mapper把hello发布与未读baseline语义分开，阻止旧peer的迟到名称/companion夺回当前Session及随后丢失完成。新增4项真实隔离socket回归，包含PiConnection→Configurations/Application→Home和双配置相同原生身份；聚焦111项、全量1571 passed/1 skipped、typecheck/desktop build通过。未读保留/no replay、认证、旧扩展兼容、22项cue/fallback不变。不是新增retry/output-limit支持或真实Agent/UI验收；无日常部署/模型调用/dev重启。

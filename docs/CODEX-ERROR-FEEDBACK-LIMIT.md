# Codex CLI 出错反馈边界

2026-10-20。结论限定于现有 hooks 接入与已核对的 **0.163.0**：执行、写入、明确取消已有真实证据；**普通命令失败、模型失败不能可靠触发独立出错动作**。这是当前观测接口的缺口，不是缺少错误动画。原有未知能力保持未知，不把本结论扩大成所有版本/所有接口均不支持。

## 已核对的依据

官方 [Hooks 文档](https://learn.chatgpt.com/docs/hooks#posttooluse) 明确说明：PostToolUse 也会在 Bash 非零退出后运行，tool_response 取决于工具。因此，“收到了工具结果”本身既不证明成功，也不证明失败。

进一步核对与 0.163.0 对应的 OpenAI 固定源码 `83086188ae0614bd882818ff1aa23f3194962012`，不用滚动文档代替版本契约：

| 位置 | 对接入的实际影响 |
| --- | --- |
| [PostToolUse 输入](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/src/schema.rs#L323) | 工具结果是 JSON 值，没有统一的工具成功/失败字段。 |
| [命令返回的 hook 投影](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/tools/context.rs#L438) | unified exec 内部有 exit_code，但这里投影的是截断后的输出正文；不能把给模型显示的退出码头部当作 hook 中一定存在的字段。安静的 exit 0 与 exit 7 可能都只有空正文，单看该事件无法区分。 |
| [工具调用分发](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/tools/registry.rs#L811) | 某些处理器返回失败时不发送 PostToolUse；没有结束通知不等于可以推断错误。 |
| [事件名定义](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/src/schema.rs#L102) | 不能照搬 Claude 的 StopFailure/PostToolUseFailure；没有对应契约就不注册、更不伪造。 |

MCP 等其他工具结果存在不同结构，不从任意 tool_response 中猜 isError/exit_code，也不把 hook 程序自己的退出失败当成 Agent 任务失败。此轮没有新增 MCP 实测或宣称其独立出错支持。

[此前真实 exit 7 实测](CODEX-TASK-LIVE-VERIFY-PREVIEW.md#最终实测结果2026-10-20)只证明返回执行反馈后回待机、不会伪造成功；本轮源码核对解释了为什么不能直接补一个退出码解析器。没有再次发送模型任务来重复这个不可区分的场景。

## 已落实的行为回归

新增 `integrations/codex-hooks/error-boundary.test.ts`，穿过 normalize → 私有 observations → Application → 宠物投影验证：

- 空输出、普通错误文字、伪造退出码头部和非契约 JSON 都不会变成成功、出错或取消；正文与原生 ID 不进入共享状态。
- PreToolUse 后缺少结果，等待和 Stop 都不会制造成功/失败；连接保持。
- 真正 Interrupt 优先于迟到的“aborted”工具正文，短暂取消后回待机。
- Claude 的错误事件名不串入 Codex。

新增 8 项行为测试；连同归一化、映射、普通启动桥接和匿名记录共 **61 项通过**，`pnpm typecheck` 与 `pnpm --filter @agent-pet/desktop build` 通过。build 是源码编译，不生成安装包。普通 dev 会话仍运行；没有替换已安装 observer、修改日常 hooks/config/token、增加状态记录或操作现有 Agent。

## 后续入口

当前阶段保留可选动作与静态回退，不以解析对话/输出正文、注入命令包装器或更改 Agent 运行方式来补这个缺口。若后续要补独立错误/持续等待/任务完成，应先评估有明确结构化事实的官方接口或新版契约，同时证明其观察权限、会话身份和正文过滤边界，再实施；日常接入替换仍需独立预览。当前 Codex 接入不因此称为完整动作验收，桌面端与发布也未验收。

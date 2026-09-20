# 已运行 Agent Session 接入计划

状态：pi 的本机静态接口核实完成，I1a 已完成；进入 I1b 前仍需确定本机 bridge 传输与用户授权安装方式。Claude Code / Codex 官方全文与版本仍待核实。实施顺序：pi → Claude Code → Codex，后两项不越过各自证据门槛。尚未完成任何真实 Agent 运行时接入验收。

## 1. 已确认边界

- 只观察用户已安装、明确配置观测组件的 Session，不由宠物启动、恢复、接管或控制 Agent。
- 一只宠物显示多个独立 Session；气泡仅显示名称和状态。
- 正在工作、完成未读、错误未读可见。工作中点击不隐藏；完成/错误点击立即确认，同时尝试打开原窗口。
- 不跨应用重启恢复历史未读；不同运行不合并。
- macOS、Windows；本阶段本地提交，不推送，不自动改动用户 Agent 配置。

## 2. 对旧方案的修正

`feasibility-research.md`、`PROJECT_PLAN.md` 和 `ARCHITECTURE-DESIGN.md` 中直接选择 Codex App Server、pi JSON/RPC 的建议不能用作旁路监控的实施依据：启动一个新的协议进程，不等于订阅另一个已经运行的交互式进程。必须逐入口验证 attach/事件订阅范围。

“支持 Codex”也不等于同时支持 Codex CLI、Desktop、所有 IDE。监控与定位窗口分别建立能力矩阵，不用打开一个新终端冒充激活原会话。

## 3. 串行交付阶段

### I0：观测入口核实与契约设计（当前）

逐一确认：Agent 版本、宿主、安装/重载方法、事件字段、名称来源、正在运行状态初始化、取消与失败语义、重连、原窗口定位能力。引用官方文档或安装包声明/源码；标明仅搜索摘要、未验证推断。

当前代码在真实事件接入前需要解决：

- `sessionId` 目前直接作为全局键：不同 provider/run 的同名 ID 必须互不覆盖。
- 需要区分 Session、进程运行和当前任务周期；同一 Session 的多轮工作不能各生成一个气泡。
- 用户所说“不聚合去重”是不同 Session 不合并，不代表传输重试可以重复产生通知。
- 重复完成事件不能恢复已确认的气泡，旧任务事件不能覆盖新任务状态。
- `agentName` 当前承担显示名称，需改为明确的 Session 名称语义；不读取 prompt 生成名称。
- `completed` 表示当前工作结束，不代表 Agent 进程退出。工具单次错误不能直接等于整轮失败。
- 观测连接健康状态独立于 Session 业务状态；失联不能伪造成功/错误。
- 桌面端尚未调用 Adapter start/stop；需要受控生命周期和断开清理。

完成条件：证据矩阵、最小事件契约、测试边界和每个 Agent 的支持限制可明确说明。

### I1：本地事件接收与 pi（首个，分三步串行实施）

- **I1a：可靠事件状态模型（已完成）**。运行身份由 Adapter 使用 `provider:processInstanceId:providerSessionId` 组合；领域层支持 revision/时间乱序保护、workId 工作周期、终态确认墓碑、名称更新，不安装扩展、不启动接收服务、不读取用户 Session。测试覆盖重复/乱序、确认后不复活和新工作周期。
- **I1b：pi 扩展与本地 bridge（协议实现完成，桌面接线待下一小步）**。已实现最小元数据传输、schema/token 校验、seq 去重、状态归一化、Unix socket/Windows named pipe 监听抽象和资源关闭；未安装扩展、未改 pi 配置。固定验证对象为 pi 0.85.1 TUI；其它版本不自动宣称兼容。
- **I1c：桌面接线与用户授权后的真实验证**。先把已配置 endpoint/token 的 Adapter 生命周期接入桌面，再由用户在闲置的已有 TUI 中显式加载扩展，实测多轮工作、取消、重试和重连；未验收前不进入 Claude Code。

仅在 I0 确认扩展事件可用后实施：

1. 修正必要的身份、排序、任务周期和确认逻辑，保持界面约定。
2. 建立仅本机可用的认证接收通道；限制来源、消息大小、字段、超时和连接数；不传递消息正文、工具参数、密钥或完整 transcript。
3. 提供可卸载、用户显式加载的 pi 观测扩展；不得因为桌面应用未运行而阻塞或终止 Agent。
4. 接入真实状态到 Application，保留现有模拟菜单作为开发工具。
5. 写明首次安装是否需要 `/reload` 或重启，以及重连后的当前状态如何确定。

完成条件：明确支持版本下真实 pi 连续多轮工作、完成、可证实失败、取消、两 Session 并发、桌面重启、扩展移除和重复事件均有验证记录。无权限时不承诺打开原终端。

### I2：Claude Code（I1 验收后）

以当前官方 Hooks 为证据，复用接收通道但独立映射事件。只提供安装说明或可预览配置片段，不覆盖现有 hooks。对名称、终止原因、权限等待和重载限制单独验证；暂不通过读取完整 transcript 填补缺失事实。

完成条件：可证明的工作开始/结束/失败映射与真实版本实测；不能证明的状态明确降级，不能编造。

### I3：Codex（I2 验收后）

分别核实 CLI 与 Desktop 的被动观测入口。若只有完成通知而没有工作开始证据，则只声明该能力，不伪装完整接入。App Server 仅在有证据可观测目标已运行 Session 时采用。

完成条件：为已验证的宿主/版本公布监控、命名、打开原 Session 能力矩阵；未支持的宿主明确列出。

## 4. 验证分层

- 领域/Application：以公开 observe、snapshot、acknowledgeAndOpen 接口验证顺序、幂等、身份隔离和确认行为。
- 协议接收：真实本机连接测试认证、错误输入、大小/速率边界、关闭与重连；不依赖真实模型调用。
- Agent 映射：脱敏生命周期 fixture，禁止把用户会话内容加入仓库。
- 真实手动验证：用户授权加载扩展/hook 后，从自己正常运行的 Agent 发起任务，检查气泡和动画；每个 Agent 验收后才进入下一个。
- 窗口定位：独立能力；仅确实激活原目标才返回成功。unsupported 与失败提示不影响已读逻辑。

具体接收传输与安装配置在 I1b 前确定，不提前修改用户环境。

## 5. 已核实证据与映射约束

### pi：安装包 0.85.1，静态文档/类型/源码已核实

调查读取官方安装包中的 README、extensions、session-format、json、rpc、compaction 文档和相关声明/实现。安装根目录为 `@earendil-works/pi-coding-agent`，以下为该包内可复查位置：

- `dist/core/extensions/types.d.ts:416–484,551–614`：Session 与 Agent 扩展事件。
- `dist/core/agent-session.js:347–355,772–813`：`agent_settled` 在 retry/compaction/续队列之后发出。
- `dist/core/agent-session.js:469–475`：扩展 `agent_end` 只含 messages，不能套用 RPC 的 willRetry 字段。
- `dist/core/agent-session.js:2036–2040`：Session 名称 getter。
- `dist/core/agent-session.js:2217–2242`：reload 的 shutdown / runner 替换 / session_start 顺序。
- `dist/modes/interactive/interactive-mode.js:4974–4983`：streaming/compaction 中拒绝 `/reload`。

实施约束：

| 信号 | 产品解释 |
| --- | --- |
| session_start | 初始化身份与当前状态；不补造历史完成 |
| agent_start | working；自动重试保持同一 Session / 工作批次 |
| agent_end / turn_end | 不是工作整体完成，不立即产生未读 |
| message_end | 仅在扩展内提取 assistant.stopReason，丢弃正文引用 |
| agent_settled 且 ctx.isIdle() | 结合已观察终态判定完成/错误；无证据则未知 |
| tool_execution_end.isError | 局部工具失败，不直接触发 error-unread |
| aborted | 不显示成功或故障；取消细节须实测 |
| session_info_changed | 更新名称，不恢复已确认通知 |
| session_shutdown | 清理/切换/退出；不制造完成 |

`pi.getSessionName()`、`ctx.sessionManager.getSessionId()` 是名称与原生身份入口；`ctx.cwd` 仅在需要名称 fallback 时本地取 basename。仅支持 `ctx.mode === 'tui'`；`hasUI` 不能区分 TUI 与 RPC。

用户可以在扩展安装后于闲置 TUI 执行 `/reload`。忙碌期间不能无感加载；加载前事件不补回。扩展内存跨 reload 保留、retry 等待中取消、压缩失败与终态关系仍需运行时验证，不作为已完成能力。

首版打开原终端返回 `unsupported`，不运行 `pi --session` 代替原窗口定位。

### Claude Code / Codex：候选机制，尚非已核实契约

官方全文抓取被工具 fake-IP/SSRF 检查阻断。搜索索引仅用于找入口，不冻结事件字段或最低版本：

- Claude Code 候选：[Hooks](https://code.claude.com/docs/en/hooks)，需核实正常停止、失败、中断、权限等待、配置生效范围。
- Codex 候选：[Hooks](https://developers.openai.com/codex/hooks)、[App Server](https://developers.openai.com/codex/app-server)。不能从新 App Server 推断可订阅其它现有进程。
- Codex CLI 与 Desktop 分别验证；通知完成能力不等于覆盖 working/error。

研究材料中的“持久化未读”和“跨源聚合”建议不采纳：与已确认的一期业务范围冲突。仅允许当前桌面进程内的通知幂等与身份隔离。

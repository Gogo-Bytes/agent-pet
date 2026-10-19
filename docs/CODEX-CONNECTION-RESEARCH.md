# Codex CLI 被动连接方案复核

2026-10-19。按用户要求重新调查方案，不继续假定现有启动探针正确。仅阅读官方文档、官方公开源码和本仓库源码/既有证据；没有执行本机 Codex、使用登录、调用模型、修改日常配置、重启 dev 或打包。

## 结论

**Hooks 适合一次配置后观察普通 Codex 的任务事件，但当前把 SessionStart 当成“CLI 刚打开”通知的验收方式有错误。** 同版本官方源码在建立会话时排队，在首轮任务路径才执行启动 hook。反复创建空会话或只打开 CLI 等待，不会验证这条任务路径；增加等待时间、继续排查传输不能解决错误的触发前提。[源码排队](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/session/session.rs#L1954)、[任务路径执行](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/session/turn.rs#L333)、[首轮顺序测试](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/tests/suite/hooks.rs#L1580)。

还存在另一个独立缺口：当前产品脚本只从 AGENT_PET_CODEX_URL/TOKEN/RUN_ID 环境变量取得接收地址；这些变量由探针给自己创建的 Codex 子进程注入。普通终端启动的 Codex 没有这个注入机制，尚无 Claude 式私有 activation 文件、配置安装/撤回及可靠宿主绑定。即使启动 hook 到达，也不能据此宣布“一次配置，正常启动即可连接”已实现。[本地实现](../integrations/codex-hooks/command.ts)、[探针](../integrations/codex-hooks/test-support/native-start.ts)。

应保留已验证的事件清理、认证传输与动作映射，停止把空启动检查当成上线门槛；先用不访问真实模型的隔离首轮证明 Hook 契约，再完成普通启动可读取的私有激活和宿主身份绑定。“打开空 CLI 就立即出现宠物”需要另行证明存在性来源，不能让 SessionStart 承担它没有的语义。

## 来源与版本可信度

官方文档以本次实际搜索并打开的 [Hooks](https://learn.chatgpt.com/docs/hooks)、[App Server](https://learn.chatgpt.com/docs/app-server)、[CLI 参数](https://learn.chatgpt.com/docs/cli/reference)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference) 为准。这些是滚动文档，不能直接等同本机版本。

本仓库已有本机版本证据为 0.163.0。本次从官方 openai/codex GitHub API 核对 [rust-v0.163.0 tag](https://github.com/openai/codex/releases/tag/rust-v0.163.0)：annotated tag 129b8ec7ee6f4511557a4856279f529025c25af4 指向 **83086188ae0614bd882818ff1aa23f3194962012**。下面源码均固定此 commit；不是不固定的 main。版本号匹配不等于已经证明本机二进制与该公开构建逐字一致，最终仍需本机无成本实测。

## SessionStart 的实际含义

| 证据层 | 已确定的事实 | 不能由它推出的结论 |
| --- | --- | --- |
| 官方文档 | source 包括 startup/resume/clear/compact/fork；命令从 stdin 收到事件；用户须审核当前 hook 定义；安装插件也不会自动信任 | 文档没有承诺打开空 CLI 的输入界面后立即执行启动命令 |
| 同版本实现 | Session::new 完成时 queue_pending_session_start_source；run_pending_session_start_hooks 在 turn 路径取出并执行 | thread/start 成功不等于 SessionStart 已执行 |
| 同版本测试 | session_start_runs_before_user_prompt_submit_on_first_turn 先创建 test，再 submit_turn，断言 SessionStart 后 UserPromptSubmit | “没有首轮任务，等待 2500ms 仍无事件”不能证明 Hook 失效 |
| 本项目既有实测 | 空 app-server 线程、空 CLI 正常退出收到真实 SessionEnd；形状探针未见 SessionStart | 不能据此修 normalize、放宽信任、假在线或断言传输损坏 |

执行函数还依赖 TurnContext；它不是窗口创建事件。[固定源码](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/hook_runtime.rs#L128)。已有停点文档中“尚未确定首轮延迟”的假设，现在由同版本公开源码得到明确支持；本机实际首轮行为仍未验证。[历史实测](CODEX-STARTUP-SHAPE-CHECK.md)。

## 方案比较

| 方案 | 普通启动/既有会话 | 能取得什么 | 本产品判断 |
| --- | --- | --- | --- |
| 用户级 hooks / 插件 hooks | 配置一次后由 Codex 自己调用，无须专用启动器；已在运行的会话需按版本验证重新加载 | 会话任务生命周期、工具与中断等事件；每事件能力有差异 | **任务观察首选**；补真实安装/私有激活，接受首轮启动语义 |
| 自建 app-server / SDK / exec JSON | 产品创建和管理自己的运行上下文；独立新进程不能凭共享 CODEX_HOME 自动看到其他进程的内存线程 | 丰富事件，也包含正文及控制/审批接口 | 适合把 Codex 嵌入产品；不符合本次只观察用户普通 CLI 的主路径 |
| 连接现有共享 daemon | 新 CLI 文档有默认 shared background server、--remote、unix socket；--no-daemon 明确绕过它 | 同一 server 的 loaded/status 元数据有价值 | **存在性候选，未验收**；必须核对协议权限、内容隔离和多客户端状态，不能直接采用 |
| legacy notify | 配置命令后由 Codex 调用 | 固定版本仅 AgentTurnComplete，payload 含 input_messages/last_assistant_message | 既不覆盖启动也不满足最小正文边界，不作为主方案 |
| OpenTelemetry | 用户级 exporter 配置，无须每次专用命令 | 会话、请求、工具等遥测；不是本产品所需的稳定在线心跳 | 非首选；log_user_prompt=false 不代表工具参数/结果不会被导出 |
| 读取 rollout/SQLite、扫描进程 | 可能发现历史或运行线索 | 非稳定内部存储，包含正文；进程不等于任务/会话在线 | 不采用；不得用 transcript 格式或模糊进程名称猜状态 |

Hook 配置发现、用户信任与合并规则来自 [官方 Hooks](https://learn.chatgpt.com/docs/hooks)。共享 daemon/Unix socket 与 --no-daemon 来自 [官方 CLI 参数](https://learn.chatgpt.com/docs/cli/reference)。App-server 的 thread/start/resume 与事件流是协议上下文内的操作，不是“另开一个 app-server 就能监听所有 Codex”的承诺，见 [官方 App Server](https://learn.chatgpt.com/docs/app-server)。

notify 的限制来自 [同版本 legacy_notify.rs](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/src/legacy_notify.rs#L13)。OTel 的 prompt 开关见 [官方配置](https://learn.chatgpt.com/docs/config-file/config-reference)；工具 telemetry 代码明确传递 arguments/output，不能只关 prompt 就声称全链路无正文，见 [同版本 session_telemetry.rs](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/otel/src/events/session_telemetry.rs#L1256)。

## 共享 daemon 是否能替代 Hooks

有值得后续验证的真实接口，不能一概说 app-server 只支持自建线程。同版本 thread_status.rs 将 ThreadStatusChanged 交给全局 OutgoingMessageSender 发布；与按 connection_ids 发送的 thread-scoped 消息存在区别。[状态广播实现](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/thread_status.rs#L223)、[发送作用域](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/outgoing_message.rs#L747)。这支持“研究一个不 resume、不创建任务的状态观察客户端”的方向，**尚不证明只有状态会送达客户端**。

本机已有导出 schema（原 r2/schema/codex_app_server_protocol.schemas.json，由 Main 本轮只读核对）：ThreadReadParams.includeTurns=false 可不带 turns，但 Thread.required 仍含 preview，描述通常为首条用户消息；ThreadResumeParams 可重新加入运行线程，excludeTurns 只减少返回历史，不是权限隔离。ThreadStatus.activeFlags 有 waitingOnApproval/waitingOnUserInput。这里是已导出本机协议证据，与滚动文档、公开源码分别记录；文件730500字节、SHA-256为408e09849d5d4931992a4227a7f3eb80b15d24901f84aca0562e816634651a82，本次没有重新调用本机 schema 导出。InitializeCapabilities没有独立只读观察者权限；模型执行 sandbox=read-only 不等于协议客户端只能读。

因此不能把“只处理 status 字段”宣传成“不读取正文”：若 IPC 已发送 preview/item，应用就已经接收了。先核对 initialize opt-out 的服务端过滤、全局通知清单、连接认证、socket 归属及重启一致性；若无可证明的最小事件边界，则放弃它作为 MVP 入口，保留 Hooks 的较小接口。对 CLI daemon 的宿主存活判断也不能一条 PID 绑定所有会话；daemon 活着不表示某个 CLI 窗口仍打开。桌面端可能使用不同配置/后台宿主，未验证前不声称与 CLI 自动共用接入。

## 状态能力不能按事件名字直接承诺

同版本 PostToolUse 的输入 schema 必需 turn_id/tool_name/tool_use_id，Stop 也必需 turn_id；当前用轮次关联不是凭空猜测，但应逐个事件对照 schema，不能把未核对事件一律套用。[PostToolUse schema](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/schema/generated/post-tool-use.command.input.schema.json)、[Stop schema](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/schema/generated/stop.command.input.schema.json)。unified_exec handler 将 hook 名称适配为 Bash，所以 normalize 识别 Bash 有同版本依据，不应直接把内部 exec_command 字符串当 hook 输入名字。[适配源码](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/tools/handlers/unified_exec.rs#L81)。

但 tool_response 在 schema 中是任意 JSON，工具执行成功、命令非零退出、工具调用失败、模型请求失败不是同一事实；PostToolUse 返回本身不能证明任务成功/失败。当前清理器没有保留可验证错误字段，mapper主要提供两秒 recentActivity 和明确 Interrupt 的取消，尚不能宣称完成/出错/等待输入全部实现。[本地 mapper](../integrations/codex-hooks/observations.ts)、[官方固定输入生成](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/hooks/src/events/post_tool_use.rs#L145)。下一阶段只增经该版本测试证明的可选能力，未知继续静态回退。

共享 daemon 还改变“退出”的含义：官方 SessionEnd 合同包含线程被归档/删除，或未被打开且空闲达到30分钟等情形；离开某个界面不保证立即触发。CLI TUI 退出不等于 daemon 退出，daemon存活也不等于某个窗口仍打开，不能把本次 --no-daemon /quit 立即退出的结果当成普通共享模式合同。[官方 SessionEnd](https://learn.chatgpt.com/docs/hooks#sessionend)。

## 建议的实施次序与最低成本验证

1. **先纠正验收，不改生产代码。** 在新的自有隔离目录，用已核对版本与可信 hooks，发起一个明确的首轮；用专门测试 Hook 返回 continue:false 在模型调用前结束该轮，或接本机固定 mock provider。该测试只能写隔离配置，不能把阻止任务的测试 Hook 安装到日常 Codex。预期：空线程无启动回调；首轮出现 SessionStart，然后明确停轮；外部模型请求数为 0。同版本测试已有 stop=true 后 submit_turn 的样例：[测试源码](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/tests/suite/hooks.rs#L1467)。须先精确预览真实执行与配置范围，不能因“无成本”就省略授权。
2. **完成普通启动桥。** hook 命令使用固定私有 activation 路径，运行时从本产品受保护文件读当前接收能力；应用重启更新 activation，普通 Codex 不依赖继承 dev shell 变量。保留用户其他 hook/TOML 字节；审核、撤回、失败静默、数据保留与身份核对需和 Claude 相同级别。这里只是建议架构，不表示已经实现。
3. **身份与状态拆开。** Host/daemon 生存、配置可用、收到 SessionStart、任务中断/工具返回分别建模；通过认证及可靠宿主绑定的首次真实事件可形成观测证据，不要求一个可能已错过的启动事件作为所有后续事件唯一入口。不能放松独立身份验证，也不能靠短命 hook PID 当长期在线。
4. **再做两 CLI、重启 dev、取消/出错/退出矩阵。** 明确哪些动作有原生事实，哪些不支持；动作缺失静态回退。先达到“第一次正常任务后能观察”的事实，再处理“空 CLI 打开立即显示”的产品差异。
5. **桌面端最后单独验收。** 只有确认其加载同一 hook 层、事件与真实宿主/会话身份后才复用适配器。不要把用户目录相同视为连接已支持。

此前网络受限对照加入了临时凭据、账号路由和 MCP 初始化等额外变量；已有记录含 2MiB 耗尽及其他域名拒绝。它解释了耗时与初始化噪声，不能证明是启动通知根因，也不应据此继续扩大外网。接下来首轮测试应使用不依赖真实账号和外网的本机 mock/停轮，先验证触发点，再讨论真实账号，不再把登录链路当 Hook 测试前置条件。源码同时有 startup prewarm，且 turn 中 build_skills_and_plugins 发生在启动 Hook 之前，因此 continue:false 本身不是“零网络”的保证；应配置本机 mock、关闭非必要插件/MCP并保持外网拒绝，以本机请求计数证明零真实模型调用。[既有结果](CODEX-ACCOUNT-NETWORK-REVIEW-PREVIEW.md)。

停止条件：上述最小首轮仍未调用 Hook，保留脱敏记录并检查该版本公开源码与本机构建差异；不自动开真实模型任务、不继续加超时/放宽网络/绕过信任。若需求坚持空窗口立即在线而官方状态接口无法在不接收正文的前提下提供，则明确记录能力差异并由用户决定产品表现，不能宣称全部做完。

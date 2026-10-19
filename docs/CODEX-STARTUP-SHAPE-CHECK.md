# Codex 启动事件形状检查

2026-10-19。用户明确要求继续定位并修复、保持隔离/dev、由Main终端验证，只有必要操作才交用户。本轮复用已授权的 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2` 和固定Codex程序，只创建空会话，不带登录凭据、不开外网、不发送模型任务、不改日常配置/原hooks/observer/信任。旧证据保留。

本次准备新增runtime/review-shape-documents.cjs、runtime/review-shape-check.cjs、runtime/shape-preload.cjs、runtime/startup-shape.ndjson、shape-review-start.json，全部0600排他创建；不覆盖已有文件。Native只启动一次（10秒总限、2500ms真实启动事件等待），仍为loopback-only系统沙箱。

只给这次新建app-server及其Node hook子进程传入NODE_OPTIONS预加载路径和固定记录路径。预加载同步旁观有界stdin并在end/close时写结构化摘要，不暂停/销毁/修改原stdin，不改原hook命令、原脚本或原生信任。字段只有已知事件枚举、session/turn/agent字段的missing/null/string/other类型、已知source/reason、原规范化结果及固定原因。不会保存原生编号、路径、提示、工具输入/结果、未知字符串、凭据或原始stdin/stderr。记录目标必须本人/600/普通单链接/no-follow，单次写前检查15KiB门槛（并发追加可能略超16KiB，不宣称严格总上限）。诊断失败静默，不影响Agent返回。

本检查用于区分未触发/输入拒绝/已发送未接收；不能凭有记录、空会话或SessionEnd发布在线。先用自有fixture验证投影和文件边界，真实失败只做一次假设修复与复验；其后按AGENTS记录停点，不扩大网络或发任务。

## 首次形状检查与CLI对照

真实离线空会话形状记录只有SessionEnd，且通过原规范化，完全没有SessionStart脚本执行记录。下一次只做同一隔离配置的真实CLI启动对照：已批准10条信任不变、正常打开CLI、不输入任务，看到真实启动通知/界面后正常/quit；如45秒未完成则清理本次进程。复用原已授权临时凭据规则及仅chatgpt.com:443网关，不添加域名、不改日常配置。新增自有runtime/review-interactive-documents.cjs、runtime/review-interactive-check.cjs、runtime/interactive-receiver.cjs、interactive-review-start.json（600排他）；结果仅事件种类/source、退出码、固定计数、临时凭据清理布尔值，不保存对话/原生ID/密钥。

此对照不把界面自身的idle/working装饰状态当成任务或模型调用，不发送任何提示词。接收绑定必须是这次明确创建且仍存活的子进程；脚本/接收退出分别清理，不观察旧会话或短命hook猜在线。

首轮CLI已进入主界面，但45秒到期前未完成正常退出，结果为空；不能据此判断正常退出通知或启动输入形状。只做一次有界修正复验：r1用同一配置及网关，正常/quit，附加上文已验证的形状预加载；新增runtime/review-interactive-r1-documents.cjs、review-interactive-r1-check.cjs、interactive-r1-receiver.cjs、interactive-r1-review-start.json，原证据不覆盖。修复45秒清理缺少1秒后强制退出的问题；仍不发提示词、模型请求、/clear或其他会话操作。复验仍失败则留存停点，不继续重试。

## 本轮实测结论与停点

- 离线 `shape-review-start.json`：初始化和空会话成功；2500ms等待内无启动通知；认证接收只有SessionEnd。stdin形状记录同样只有SessionEnd，规范化为accepted。此事实排除“已经调用此Node脚本，但被我们的SessionStart解析丢弃”，不能证明Codex内部没有其他启动错误。
- 首轮 `interactive-review-start.json`：进入真实CLI主界面，45秒后超时清理；退出码null、无回调。未附加stdin形状探针，不能作为正常退出结果。
- 一次修正后的真实CLI复验 `interactive-r1-review-start.json`：通过固定入口的同一Codex0.163.0进入主界面，不发任何任务；Main输入/quit并确认，exitCode0。真实认证事件仅session-ended，sessionStarted=false、sessionEnded=true；同一保护记录新增一条accepted SessionEnd。原hook命令、observer、信任及日常配置未修改。临时auth文件清理为true。
- r1网关：capacityRejected0、upstreamFailed0；aggregate2MiB耗尽1次、其他目的地被拒绝19次。主界面已有初始化警告；此前观察为codex_apps MCP握手失败。仍不能完全排除受限初始化对启动时机的影响，不增加域名/流量重试。

这不是正式Codex接通验收。CLI/空会话均未观察到SessionStart，尚未确定是否延迟到第一条任务；[官方Hooks文档](https://learn.chatgpt.com/docs/hooks)描述startup来源，但未在本次核对中找到“无任务主界面保证立即触发”的承诺。不把猜测当根因，不改normalize去猜兼容，也不借SessionEnd或界面idle伪造在线。

本轮隔离环境的有界复验已用完，停止再次启动；没有模型请求、正式Main/Renderer接线、dev重启或打包。下一步需新的可区分证据，例如明确授权的一次最小首任务，或可核对的本机启动执行契约；不得自动使用额度、放宽网关或改日常配置。现有dev代码与pi/Claude保持，不能声称Codex已在dev首页出现。

本阶段代码提供可复用的秘密清理诊断投影、stdin旁观和非TTY拒绝入口，修复交互检查超时缺少强制清理的问题；不改变任何生产hook。自有fixture证明原stdin完整、只记一次、监听清理、过大输入停止复制、诊断异常不打断原消费者、记录文件拒绝不安全权限/链接。探针源提取公共旁观函数发生在真实复验之后，提取后只有fixture复验，没有再次运行真实Codex；保留runtime旧探针以保全当时证据。

独立审查发现记录路径若变成FIFO会在fstat前阻塞；已为诊断open增加O_NONBLOCK，自有FIFO子进程fixture验证无读端也立即静默返回。此处修复只影响test-support诊断，不修改原生产observer；真实Codex复验后未再次运行。

## 验证

`pnpm test integrations/codex-hooks/test-support --maxWorkers=1`：53项通过。`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过（源码构建，无打包）。首次类型检查发现getuid跨平台可选类型、后续新增fixture的Vite返回类型未收窄，已分别修正；未修改生产代码。独立subagent先复核25项，再针对FIFO修复独立复跑5项通过，无新的确定问题。没有把这些fixture测试等同真实启动事件验收。

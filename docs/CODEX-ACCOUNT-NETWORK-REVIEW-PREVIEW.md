# Codex 账号初始化受限联网复验

2026-10-19，用户已精确授权，并在报告EEXIST后明确要求Main自行终端测试。本轮真实复验现已执行且仍失败，当前停在下面记录的账号初始化问题。本次是隔离审核策略调整，不是模型任务或日常Codex部署。

## 已确认与未确认

用户使用本机登录版入口后报告：TUI bootstrap的account/read在workspace routing discovery失败（-32603），最后review-interrupted。原隔离目录中临时config/auth.json已不存在；原日常auth仍为本人所有/600/普通单链接文件，内容未输出。两个auth-review结果不存在，说明尚未完成交互退出后的查询，不能宣称登录有效、审核完成或收到hook。

同款系统沙箱的真实自有网络测试已证明：loopback可连、外网EPERM。官方[app-server说明](https://learn.chatgpt.com/docs/app-server)说明account/read获取账号信息、可刷新token；仅有这条错误不能排除上游账号/工作区问题。当前最有力解释是原先完全禁外网的策略挡住初始化，需要一次受限联网对照；未验证前不标根因已解决、不要求重新登录。

## 精确变更与操作

- 复用原 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2`，不改原hooks/config/observer、不覆盖历史结果。Codex入口和隔离目录/文件身份继续严格检查。
- 继续仅只读 `/Users/gan/.codex/auth.json`（普通600本人单链接、不跟随链接、最多64KiB），只在交互时排他新建隔离 `config/auth.json` 600副本，按[已有授权的凭据规则](CODEX-LOCAL-AUTH-REVIEW-PREVIEW.md)清理；不写原缓存，不输出凭据，不调用login/logout。
- Codex仍运行于原loopback-only系统沙箱，`--no-daemon --no-alt-screen`，不修改系统网络、代理或日常环境。新增自有Node进程内的临时loopback HTTP CONNECT网关，在沙箱外提供这次明确的域名级出口例外；只允许精确 `chatgpt.com:443`，其他主机、IP字面量、端口、普通HTTP请求均拒绝。不开放auth.openai.com、api.openai.com或任何其他站点，不失败后自动加白。
- 仅此新交互子进程收到指向网关的HTTP(S)_PROXY变量。网关地址含随机内存认证，绑定127.0.0.1随机端口，不落盘、不打印；最新实现最多32个客户端、8个活动上游，其余在有界队列等待；全通道双向合计2MiB、180秒总时限、15秒空闲限制。资源调整及实测见下方。退出后关闭网关和活动连接。DNS与外部TCP连接由网关执行。
- TLS仍由原生Codex与chatgpt.com端到端建立，网关不解密/记录请求头、正文、凭据或响应。**这是域名级限制，不能过滤加密后的URL路径**；允许原生账号/工作区与正常启动请求，不承诺只有一个HTTP请求。用户不得发送模型任务，程序不主动发送提示、turn/start、工具或额外认证请求。外部服务可能正常读取账号信息；若凭据需要重新登录/刷新，或需要其他域名，停止，不扩大范围。
- 本次固定程序最多3次：交互审核1次（180秒）；正常退出后只读hooks/list 1次（10秒）；只有10条自有通知全部信任且无其他来源/错误/警告时，创建只读空会话1次（10秒）。网关和凭据只用于第一个交互进程，后两次仍完全禁外网/ephemeral；仍不发模型任务。
- 新助手仅 `runtime/review-network-documents.cjs`、`runtime/review-network-check.cjs`，0600排他创建；中断准备后的同名助手仅在内容/归属/权限/单链接全同且当前源码编译一致时复用，不覆盖，其他情况停止。结果仅 `network-review-status.json`、条件生成 `network-review-start.json`，0600排他创建，固定类别/计数/匿名事件，不保存原始输出或秘密。
- 用户在 `/hooks` 中亲自审核本产品10条，脚本绝不写信任hash或跳过审核。遇到登录、额外信任范围、其他条目或错误即停，保留证据；不自动重试。
- 原dev、Claude/pi、token/hooks/配置保持；不打包、不安装依赖、不推送。

## 授权后的用户入口

```sh
cd '/Users/gan/Desktop/🥷/agent-pet'
/Users/gan/.nvm/versions/node/v22.22.3/bin/node integrations/codex-hooks/test-support/trust-review.mjs --run-authorized-account-network
```

此命令保留为历史入口；审核已完成，当前不要重复。AGENTS.md要求“真实目标操作仍需精确范围、预览与授权”；此前明确禁止外网，复用本机凭据的授权不等于允许将它用于外部账号请求。新增网络例外、两个助手和两份结果需要这次确认。

## 准备验证

40项检查程序测试、pnpm typecheck、desktop源码build通过；两项网关聚焦复核通过。测试仅连接自有loopback fixture，覆盖精确目标/认证、拒绝其他目标和普通HTTP、不发出未授权外连、活动隧道双向数据及关闭清理；没有访问chatgpt.com、读取实际凭据或运行真实Codex。未进行真实网络复验，不能宣称原生审核、账号路由或Codex接入通过。

## Main实际终端复验（2026-10-19）

用户报告EEXIST，固定路径metadata确认两个review-network助手均存在（600/本人/普通单链接），临时auth和两个network结果均不存在。Main用原命令与真实PTY复现同一EEXIST，退出1，尚未启动Codex。修复network入口的准备续接：复用已核对且与当前编译逐字相同的助手，未知/改动/过宽权限/链接仍拒绝；结果和临时auth仍保持排他，不删除或覆盖。

随后Main在原精确范围内用真实PTY完成一次有界原命令复验。准备通过、Codex0.163.0显示loading，随后仍报account/read的workspace routing discovery failed（-32603），review-interrupted退出1。没有发送任务、打开hook审批或改信任，也没有追加运行/切换协议/扩大域名。不能把TUI loading视为可用主界面，更不能宣称账号或通知接通。

退出后metadata确认临时config/auth.json已删除；原auth为本人/600/普通单链接；隔离config属于预期原字节或精确已知UI增量；两个network结果均不存在。网关由finally关闭。本轮没有足够网络请求级证据区分“客户端未使用代理、代理/上游连接失败、账号路由本身失败”等原因，保留这些未决项，不把网络策略单独标为根因。

7项准备/入口聚焦回归以及完整40项检查程序测试、typecheck、desktop源码build通过；无打包/推送。按[AGENTS.md](../AGENTS.md)“仍失败则记录证据、剩余工作与安全停点”，本轮真实测试在此结束。下一阶段需要先收窄账号初始化诊断方案，不能继续让用户重复本命令或默认扩大网络/读取日常配置。

## 本轮继续的具体诊断与验证范围

用户再次要求保持隔离并解决连接；随后明确授权Main代为审核信任这10条并继续退出/查询/空会话。增加的内存计数只输出固定数量、错误类别和字节数，不记录地址/headers/正文/秘密。旧通道实际拒绝5条并发连接，固定chatgpt.com:443无凭证TCP检查成功；修复为最多32个已跟踪客户端、8个活动上游及有界等待队列，全通道合计2MiB预算（原先每隧道2MiB）、180秒总限/15秒空闲。外部目标仍仅chatgpt.com:443，包括同一主机省略默认443的authority，不加新域名。

修复后真实TUI已进入审核，Main经用户授权在原生界面信任10条并正常退出。只读hooks/list真实确认10启用/10trusted，其余类别/错误/警告0；空会话创建成功，但初次仅收到SessionEnd。已经发现检查程序收到thread/start确认就立即退出，隔离回归证明会漏掉随后启动通知。修复为显式等待经认证的SessionStart，最多2500ms且仍受原10秒总限，无turn/start或模型任务。

继续验证仍限原隔离root，只新增runtime/review-wait-documents.cjs、runtime/review-wait-check.cjs及wait-review-start.json（600排他），保留已有network结果；最多一次离线app-server空会话检查，不打开TUI、不读取/复制凭据、不访问外网或再次改信任。配置检查仅允许原设置加已观察的精确10条自有hooks.state.sha256信任记录；只读验证，不手写信任hash。未知源/重复事件/额外设置仍拒绝。

## 最新实测结果：账号与审核通过，启动事件仍未通过

用户再次要求隔离解决后，本轮只保存/输出内存固定类别计数。最小诊断证实Native使用了网关且认证通过，旧socket限制拒绝5个客户端。另一次无凭证的固定chatgpt.com:443 TCP探测成功。修复后自有12并发fixture通过；真实Native随后进入Hooks need review，再进入可输入的主界面。它显示的启动警告与尚未授权的其他目的地保持被阻止，没有因此扩域。

用户明确授权Main代为审核并信任这10条。Main在Native界面核对源与命令，使用其trust all；列表显示各项Active 1，再正常/quit。没有发送模型任务。退出清理后config/auth.json不存在。配置实际增加hooks.state对应的10个原生trusted_hash，原两项与UI标志保持；读取上限从1KiB调整为4KiB并严格接受这个已观察原生格式，只允许这10种事件、原hook来源、索引0:0及sha256格式；不写hash，不允许其他源/重复/未知设置。原配置权限仍600/本人/单链接。

之后在完全离线/不带凭据模式完成hooks/list：own10/enabled10/trusted10，foreign、disabled、untrusted、modified、managed、errors、warnings全0；network-review-status.json为0600。首次空thread/start成功，只收到session-ended，结果保存在network-review-start.json，未覆盖。

探针时序回归先失败（ACK之后到达的启动通知被杀掉），修复等待真实认证事件后自有fixture通过。一次新的离线空会话复验保存在wait-review-start.json：initialized/threadStarted为true，outcome为hook-not-observed，stdout3140/stderr241字节，仅session-ended，无session-started。等待2500ms没有补出启动事件，故时序缺陷不能被当作本机缺失启动事件的已确认唯一原因。stderr原文/原生会话ID/对话/凭据未写入结果文件。

**通过：** 隔离Native账号初始化、界面进入、原生信任审核及持久查询、空会话、真实SessionEnd→认证loopback。**未通过：** SessionStart来源/输入契约及CLI完整生命周期、Main正式连接页/首页、真实任务/桌面端/发布。不把SessionEnd或空会话成功映射为在线。需要下一阶段针对启动事件的安全形状检查，不能通过放宽输入、伪造在线或发送模型任务来补证据。

最终45项检查程序测试/typecheck/desktop源码build通过；完整自有进程回归与macOS沙箱/凭据清理/旧响应保护保留。临时凭据最终核对不存在，日常auth metadata保持600/本人/普通单链接；原dev与日常配置不改、无打包/推送。按AGENTS有界失败规则，启动事件本轮等待复验失败后不再继续真实重试。

独立只读subagent复查未发现本轮diff的确定缺陷；自有fixture 3文件/17项通过，未访问真实Codex或凭据、未联网。其结论同样明确：真实SessionStart缺失尚未解决，不能宣称正式接通。

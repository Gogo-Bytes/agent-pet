# Claude CLI 任务反馈：实现与验证

2026-10-19，**隔离验证、代码复核及真实常用任务反馈验证完成**。真实收到读取、写入/修改、Bash 执行和模型请求出错反馈；当前会话无 Glob/Grep，查找反馈未验收。动作请求不代表资产具备对应动画。先前冷启动3秒超时仍作为稳定性风险保留。用户已授权并完成日常升级，保留原配置和 hooks；本轮没有自动启动 Agent、请求模型或打包。

## 用户可以得到什么

新连接设置可观察任务事件，旧连接通过「启用任务反馈」预览、确认升级。正常启动 Claude 即可，不增加专用启动命令，不重复安装。升级后需要新开 Claude 会话。

| 收到的实际依据 | 宠物表现 | 不推断的内容 |
| --- | --- | --- |
| 同一已验证运行、明确当前 prompt 的 PostToolUse | 读取、修改、查找或运行命令后的 2 秒近期反馈 | 不声称工具仍在执行，也不声称整个任务完成 |
| 同一 prompt 的 PostToolUseFailure，且 is_interrupt 明确为 false | 短暂「遇到问题」 | 不把单工具出错当整个任务失败；缺少标志时不猜 |
| 同一已知 prompt 的 StopFailure | 回答出错及未读提醒 | 不解析错误正文；不代表 Claude 进程退出 |
| SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、permission_prompt、Stop、整理事件 | 保存必要关联或清除近期反馈 | 不伪造工作、完成、取消、持续等待或整理状态 |
| 已知 OS 进程退出、应用暂停 | 清除近期动作并断开；保留已知未读错误 | 不伪造成功、失败或取消 |

参考 [Claude 官方 hook 语义](https://code.claude.com/docs/en/hooks)。其中一些字段可能晚于已核对的 npm 2.1.301；缺少 prompt_id、tool_use_id 或必要标志时保持未知，不归到“最近一个任务”。本次不宣称所有 Claude 版本、安装方式或桌面宿主可用。

## 模块与约束

- `native-hook-entry.ts` 先通过 `normalize.ts` 丢弃正文、路径、工具输入/输出等，再发送 schema2 元数据；不输出 hook 决策，不控制 Agent。
- `native-presence.ts` 每次核对真实 hook 祖先、UID、确切 Claude PID/微秒出生身份。Main 私有回调带接收器生成的 run UUID；原生 session/prompt/tool ID 只在 Main 私有关联层使用。
- 旧 schema1 载荷只提供 presence。schema2 SessionStart 固定当前原生会话；退休会话不能回切。单 OS 运行最多保留 32 个会话编号，不淘汰后重新认领旧身份。接收按完整请求体到达顺序串行验证，不声称这是原生业务因果顺序。16 个待处理任务、32 个 OS anchor、有界超时和 1024 个近期 event ID 去重；去重窗口淘汰后，mapper 的 prompt/tool 墓碑仍阻止重复业务反馈。
- `observations.ts` 将原生身份换成随机别名，只发布统一 `SessionObservation`、类别与能力。每个会话最多 256 个 prompt、1024 个已解决 tool ID；达到上限停止该会话的新业务反馈，保留在线与已有错误，需新开会话。迟到旧 prompt/子任务/无身份结果不归到当前工作。唯一 2 秒计时器只结束已经收到的近期反馈，不补造完成/取消；退出、切换、停止均清理。
- Domain 新增 `unknown`，区别于已知 idle。同 work 的未知更新不能抹掉已知未读结果；新 work 不继承旧结果。`recentActivity` 是短暂结果反馈，`activities` 仍为空；共享 `projectPetPresentation` 供桌宠和首页使用。缺动画继续按统一可选目录回退，完全没有动画则静态显示。
- `Configurations` 仍按配置 UUID 关联同一 Application 状态；两条 Claude 配置或多个运行不合并身份。旧 presence-only 首页保持静态陪伴。

## 兼容升级与保留

`claude-user-hook.ts` 默认仍支持 schema1，显式完整白名单生成 schema2。旧注册升级保留 SessionStart 原条目，只追加另外 11 个自有 hook 组；其他设置/原 hooks 原始字节不重写。禁用 hooks、目录身份变化、共享设置修改、未知或重复引用都停止应用。

`ClaudeNormalPresence.preview/confirm` 复用既有类型化 IPC，不增加执行 Agent 的入口。恢复旧注册不换源码、不加 hooks。升级前 `ClaudePresenceStore` 独占保存 0600 `upgrade-before.json`（旧 observer、hook、activation 和 receipt），保留最初 settings-before；再保存 prospective ownership、observer、activation 和 receipt，最后局部追加共享设置。中途异常保留材料并停止，不整份回滚用户后续设置。严格检查成功后才进入 task-events；撤回要求全部自有组无歧义且未修改，不能只撤回一部分后宣称完成。

## 验证与证据

通过的范围：schema1 兼容、完整注册/显式升级/取消/共享设置变化/失败现场保留/选择性撤回；Main 回调测试替身→配置身份→Domain→首页；重复/迟到/子任务/缺 ID、近期反馈到期、退出回调、停止清理、错误未读、缺能力回退。真实 macOS helper 的旧 presence 祖先验证正常；**新 schema2 事实→mapper 的真实自有进程链路于2026-10-19复验通过；此前失败保留在下方历史记录**。测试 doubles 只存在测试文件与正式 Renderer 的 `test-support/review-bridge.ts`，不进入正式 Electron 入口。

源码 dev 的正式 React/R3F 页面已实看旧连接入口、预览、取消回焦及首页聚焦反馈；数据为明确隔离示例，不能作为真实 Claude 任务证据。[升级预览](evidence/claude-task/upgrade-preview.png)、[首页反馈](evidence/claude-task/home-feedback.png)。

全量首轮 1111 passed / 2 failed / 1 skipped：既有 launcher READY 3 秒超时，原文件 5 项复验通过；既有 pi Bucket 500ms 精度断言复验仍失败。有界修复仅将该测试的合成时间取整数，保持原 500ms 和全部限额/断言、生产逻辑不变，原文件 20 项复验通过，独立提交 `687f35d`。加入自有真实进程 schema2 测试后的全量为 **1118 passed / 1 failed / 1 skipped / 94 files**，不新增依赖、应用包或真实安装操作。`pnpm typecheck` 与 `pnpm --filter @agent-pet/desktop build` 通过。

独立 Review 初审 243 项通过，另发现迟到 SessionStart 回切会话导致新任务 403 的 P2；已用失败回归修复，退休编号与 32 会话上限不再允许复活。最终复核与命令结果在 MVP 计划统一记录。

### 历史：未通过的新进程用例与安全停点（2026-10-18）

`native-presence.test.ts` 的 `delivers real descendant metadata facts through OS binding and opaque Application observations`：自建 Node 父进程/子 hook 发送 startup→submit→tool-succeeded，预期 `HOOK_EXIT:0`，实际 `HOOK_EXIT:1`；目前只知道客户端被拒绝/请求失败，未记录具体失败环节，不能归因为 Claude 本体或权限。

一次有界假设修复：为同一 hook fixture 的多次请求禁用 HTTP 池化（`agent:false`），保持生产接收守卫、超时和断言不变。原文件复验 **38 passed / 1 failed**，仍是相同结果，假设未成立。按 AGENTS 停止本轮排查，不继续试错、不放宽守卫、不执行真实升级。新代码/失败测试及证据留在工作区，未提交为完成阶段。

后续工作：先定位自有 fixture 的具体 HTTP 拒绝/失败环节，核对 schema2 真实进程与 mapper 的接线，再复验相关路径与最终全量/类型/构建/独立审查；通过后才可请求日常升级授权。现有日常 Main 未重启、observer/hooks 未替换，原 Agent 运行不受本轮写入影响。

### 用户续查后的新证据（2026-10-18）

最小命令为 `pnpm test integrations/claude-hooks/native-presence.test.ts -t 'delivers real descendant' --maxWorkers=1`。fixture 输出已增加无凭据的 HTTP 状态信号：第一个 SessionStart 为403。只在隔离测试期间的临时边界日志表明：hook PID 的首次 helper 调用被250ms超时终止（SIGTERM/killed），并非 schema 解析、mapper 回调或 HTTP 池化；临时生产源码日志已全部删除。

进一步将 helper 独立编译到自建临时目录，仅查询检查脚本自身 PID：冷启动250ms调用于252ms超时，同文件一次3秒就绪调用于1849ms成功，随后250ms调用于3ms成功。只说明首次执行成本，未核对 macOS 内部延迟机制；没有访问 Agent、安装或日常配置。

本轮唯一假设修复：生产 native server 在 listen/activation 前，给同一 helper 一次固定自身 PID 的3秒完整身份/UID自检；实际 Agent/祖先仍250ms，peer仍1秒，无重试。不可用助手不再开放监听。controller 跟踪 pending open，stop等待其结束并关闭，不让关闭完成后继续安装；新增关闭期间等待和不可用助手回归均先红后绿。controller 的配置文件测试使用原有 probe 测试接口，不执行占位 helper；真实helper测试保持真实执行。

复验 `pnpm test integrations/claude-hooks/native-presence.test.ts apps/desktop/src/main/claude-normal-presence.test.ts --maxWorkers=1`：**55 passed / 1 failed / 2 files**。失败已从首个hook的403提前到启动自检：`Claude native observation unavailable`，耗时约3010ms；说明本机这次冷启动仍超出3秒，修复尚不足以通过。controller16项及native39项通过，但不能标真实schema2链路通过。`pnpm typecheck`及`pnpm --filter @agent-pet/desktop build`通过；未重跑全量，未提交/部署此阶段。按AGENTS再次安全停止，保留全部失败回归，不增加预算/重试或绕过身份守卫。

下一步先测量受控冷启动的耗时及停止资源行为，再确定自有助手启动预算与取消方案；不能仅靠给真实Agent检查延长时间来“修复”。后续仍需原链路、最终全量、独立复核通过后再请求日常升级授权。

### 再次复验（2026-10-19）

用户要求“再试试”。保持同一源码与所有时限，最小真实链路1项通过（1480ms），随后全量 `pnpm test --maxWorkers=1` 为 **1121 passed / 1 skipped / 94 files**，75.54秒，其中原schema2链路1218ms。`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过，仅源码构建，没有应用打包。没有为了通过而更改测试断言、Agent守卫或启动预算。

另在三个独占临时目录文件中各编译同一助手，仅查脚本自身PID，首次耗时315、338、391ms，紧接同文件执行2、8、3ms，均返回完整有效元数据；十秒测量上限未触发，测量临时目录已删除。与上轮相比，冷启动延迟明显变化；不能推断macOS内部原因，也不增加生产重试。生产3秒自检仍可能拒绝启动，这时不会开放接收或误报在线。独立代码复核未发现新确定缺陷；检索性审查指出验证段的旧结论已修正，并将旧停点标为历史。审查未重跑测试，命令证据由Main提供。真实日常任务仍须精确授权与用户操作。

## 尚未完成

真实 npm Claude 2.1.301 的常用工具反馈链路已通过；Glob/Grep、受控工具错误、正常/异常退出及并发会话的完整任务矩阵仍未完成。原升级已获授权并执行，范围见 [精确操作预览](CLAUDE-TASK-UPGRADE-PREVIEW.md)。普通任务完成、取消、持续等待、连续执行/思考目前没有充分 hook 依据，保持未实现；不通过读取对话/猜测计时或控制 Agent 来填补。PATH、其他安装方式、Codex/Antigravity 和桌面宿主仍为后续工作，发布未验收。

### 日常升级与新会话（2026-10-19）

用户已按升级预览授权。原dev未运行，使用原daily-bootstrap及同一userData启动新版dev；Vite临时配置的默认打包报vite/internal错误，改为同配置native loader一次复验通过。用户打开升级预览，Main通过正式按钮确认后显示等待启动。私有ownership为schema2，12组自有hooks均存在；过滤自有hooks后的原设置摘要与升级前一致，原settings-before摘要一致，upgrade-before存在。接收器监听、安装的observer与本轮源码构建一致。未修改pi、shell或Node安装。

用户使用原 `/Users/gan/.nvm/versions/node/v22.18.0/bin/claude` 启动，并明确确认「Claude已进入输入界面，Agent Pet已连接」。CUA当时仍显示等待启动且AX缺少内容，因此旧画面不能作为断线证据；新会话连接以用户实时确认记录，不宣称自动化已验证任务动作。快捷入口提议尚未获授权、未创建。按原升级预览独占创建测试目录 `/tmp/agent-pet-claude-task-20261018-a83c9f` 及source.txt，等待用户发起限定任务。

### 真实任务结果（2026-10-19）

用户按 [实测预览](CLAUDE-TASK-LIVE-VERIFY-PREVIEW.md) 授权匿名状态记录并自行执行任务。任务结束时记录15行、7111字节、1个匿名会话，文件0600，上限128KiB；未提交原始记录。reading 1次、writing 2次、executing 2次，均约2秒后结束近期反馈；另有error 2次，connected持续为true。这是应用状态快照计数，不是原生事件总数，也不证明模型资产具备对应动画。

用户确认首轮查找实际使用Bash，因此executing映射符合所用工具；两次前置错误来自模型请求，与记录中的error相符。未采集错误正文，不能进一步认定错误根因。读取、写入/修改、命令执行和模型出错的统一反馈通过实测。

用户随后确认当前会话的直接和按需工具中均无Glob/Grep，未执行补测、未改用Bash、未改文件或访问其他目录。查找类别记为工具不可用、未验证，不算已证实的适配缺陷，也不修改用户工具配置来凑验收。完成、取消、持续等待仍未实现。

收尾正常退出记录版dev，并以相同userData、移除AGENT_PET_DEV_EVIDENCE_DIR的普通dev启动；原token、hooks与连接配置未修改，不操作Claude/pi进程，不打包。正常退出时追加1行离线快照，最终16行、7588字节；普通dev启动后复查保持不变。重开后的Claude旧会话不自动认领，需用户下次正常新开会话。

# Codex CLI 细分动作、取消与失败实测预览

2026-10-19，用户已按本页精确范围授权，正在执行。日常基础上线见 [记录](CODEX-DAILY-CONNECTION-PREVIEW.md)；用户要求继续使用dev，保留原配置/hooks，不打包。

## 最终实测结果（2026-10-20）

用户随后明确将开发验证委托Main自行完成，最终才由用户验收。Main已在固定测试目录独立启动日常Codex CLI 0.163.0默认TUI，使用原服务/配置，亲自发送限定任务并只取消本次新任务。现有用户会话/任务、配置/hooks/token未修改；没有安装、CLI更新或打包。原10组通知未重装，未修改原生信任或权限设置；CLI显示原有YOLO模式，本轮未启用/改变该模式。

| 场景 | 实际输入与证据 | 结论 |
| --- | --- | --- |
| 执行/读取/查找 | 真实命令工具读取source.txt、查找txt和sleep 6；匿名App记录executing，结束回idle | 执行近期动作请求通过；读取/查找不具备独立动作，不额外标通过 |
| 写入/修改 | 原生apply_patch实际创建并修改result.txt；记录恢复后补测“动作→验证→动作”，App记录writing及writing=supported | 写入近期动作请求通过；文件最终为“动作测试” |
| 取消 | 新任务printf固定标记+sleep 30；TUI出现本次后台终端运行后按一次Esc，显示Conversation interrupted | App确实收到occurrence=cancelled、cancelled=supported，约2秒后idle，连接保持；未误报error。迟到事件实际是否到达未记录，抑制逻辑仅由隔离测试证明 |
| 工具失败 | 新任务只执行一次exit 7，CLI确认退出码7 | App为executing→idle、tool_error仍unknown，无虚假completed/cancelled/error；独立出错反馈**未实现**，不是“错误状态支持通过” |
| 结束/清理 | 本次TUI正常/quit退出0；测试sleep已结束，不停止共享日常daemon。记录版Main退出0，匿名流最终connected=false | 记录关闭并恢复未启用证据变量的普通dev；不将TUI关闭自动等同会话结束 |

日志是共享Application实际输出，未注入模拟事件。本次恢复后的记录仅一个匿名会话，与自行驱动测试的时间段一致：`.agent-work/codex-task-live-20261020/states.ndjson`共16行/7643字节（0600、上限128KiB），actions含idle/executing/writing/cancelled，唯一occurrence为cancelled；SHA256 `9d8e6ae3753672b6c1ec8677e84065a9cd066c9799a1bae1ef478d612b511387`。能力/动作是共享状态与渲染请求证据，不是已亲眼验收每个资产动画；本轮原生CUA工具不可用，没有新实际UI截图/完整可视动画验收，不拿旧截图代替。

首轮模型任务完成但昨天记录已停止更新（旧文件49行/23333字节），因此首轮App接收判为未验证，保留原证据不回填。只做一次有界恢复：旧SingletonLock指向PID54290，定点ps确认进程不存在；启动新日期记录dev，原文件不覆盖，然后补测一次。没有结束用户已有Agent。最后只对新dev的SingletonLock PID91048核对UID/确切Electron路径/锁一致后发送SIGTERM，dev命令退出0；普通dev会话89152在localhost:5173继续运行。临时记录不再启用，测试证据仅留本机。

本次共4条限定模型任务（首轮、一次记录恢复后的补测、取消、非零退出），另有原生CLI标题请求；没有无限重试。原CLI同时提示computer-use MCP入口缺失，本轮只记录为既有环境限制，不修改此配置，不将其误判为Agent Pet连接故障。

验证：normalize/observations/normal-bridge/dev-observation-evidence共53项测试、pnpm typecheck、pnpm --filter @agent-pet/desktop build通过，仅源码构建。没有修改接入实现源码。可交付范围为执行/写入/明确取消的真实动作请求验证；模型错误、独立工具错误、读取/搜索、持续工作/等待、子Agent/并发/系统重启/桌面端与缺动画资产的视觉验收仍未完成。本条覆盖下方历史待验证停点。

## 已核对的真实能力边界

当前Main mapper仅把canonical Bash的PostToolUse投影为executing、apply_patch投影为writing，持续最多2秒的近期动作；并不承诺工具运行全程动画。其他工具名为other，不解析命令正文猜读取/查找。根会话同轮明确Interrupt才能投影cancelled；后到的工具返回不能覆盖取消。工具返回不等于成功，Stop不等于任务完成，PermissionRequest不等于持续等待。normalize/mapper没有独立模型/工具失败字段，因此故意失败的命令用于验证不制造成功/取消或错误标签，不能据此宣称已具备“出错动作”。模型级错误、读取/搜索独立动作等缺口如实保留，不读取正文或错误文本补猜测。

## dev与记录范围

- 正常退出Agent Pet，再重开同一userData的dev，临时启用既有 `AGENT_PET_DEV_EVIDENCE_DIR`。只中断观察/清空气泡，不退出、启动、重载或取消既有Codex/Claude/pi任务，不操作它们的后台。原产品恢复会读取配置/偏好、已存接收材料及Claude原settings自有hooks校验，更新本产品activation/receipt；不写任何Agent设置/hooks、不读登录或对话。沿用[日常预览](CODEX-DAILY-CONNECTION-PREVIEW.md)中的同一固定userData和目标/恢复范围，pi仍手动恢复。
- 独占新建 `/Users/gan/Desktop/🥷/agent-pet/.agent-work/codex-task-live-20261019`（0700），仅 `states.ndjson`（0600，最多128KiB）。只记录时间、运行期随机匿名编号、online/状态/动作/能力类别；不记录名称、原生ID、路径、工具参数/结果、对话、token或服务地址。既有记录器观察整个共享状态，其他已接入会话也仅以相同匿名白名单记录；不把无法归属的其他会话状态当成Codex证据。
- 日常Codex原10组hooks不变、原连接配置/登录/token/shell/程序不变，不安装依赖，不扫描，不新增/替换observer、不修改信任或关闭安全保护，不自动发模型请求。
- 结束后正常退出记录版，去掉该环境变量重新开启普通dev；记录关闭并留本机，不进Git、不自动清理。保存/恢复失败按有界规则停止，不标在线。

## 用户限定任务目录与操作

独占新建 `/private/tmp/agent-pet-codex-actions-20261019-c83f72`（0700），仅预建 `source.txt`（0600，固定普通测试文字），无凭据。已存在则停止不覆盖。之后文件只由用户主动运行的Codex在这个目录创建/修改。用户自己决定正常工作目录信任/工具权限，使用原模型额度；不批准其他路径/联网/安装或修改配置。

就绪后请用户新开正常Codex，分三轮，每轮完成再告知结果：

1. 细分动作：命令工具读取source.txt；如有原生apply_patch，创建result.txt写摘要、再改一个词（无此工具就跳过，不改用Bash冒充apply_patch）；命令工具查找本目录txt文件、执行sleep 6；不访问其他路径或联网。核对executing/writing近期动作和结束后回落，读取/查找不单独宣称通过。
2. 取消：只发一条新任务，命令工具在该目录执行sleep 30；用户确认已开始后只取消这条新任务（Esc），检查是否收到cancelled与迟到结果保护。Agent Pet不代为取消任何任务。
3. 工具失败：只在该目录用命令工具执行一次 `exit 7`，这是故意失败，不重试/修复、不读写其他内容。用户只报告是否看到非零退出，不复制输出/对话。核对仍能正常继续、未假造成功/取消；“error”独立能力保持未实现。若用户正常测试中恰有模型错误，只确认类别；不为制造模型错误修改token、服务或模型配置，不擅自新增测试Provider。

验证应用共享状态→可选动作请求；资产缺动画可静态回退，不能把静态外观当事件未接收。完整错误支持/持久工作态/等待/子Agent/并发和桌面端不随这三轮自动标通过；如需实现扩展先核对同版本原生契约，再补代码和隔离测试。

AGENTS.md要求真实操作有精确范围、预览与授权；原日常接入记录已关闭，且不包含上述新记录/任务目录，因此需本次确认。用户确认后这三轮按授权执行，不重复请求同一写入/记录权限。


## 执行进度

前置53项normalize/mapper/normal bridge/匿名记录器测试通过。用户授权后从应用菜单正常退出普通dev（会话71349 exit0），排他创建两个精确目录与0600 source.txt，启动记录版dev（会话30893、localhost:5173；Main/preload源码构建通过，无打包）。states.ndjson已创建、0600/当前用户、初始0字节，未伪造事件测试记录器。未修改任何Agent hooks/settings、token、shell或程序，不操作既有Agent任务。第一轮限定任务已交用户，待其正常Codex/apply_patch/命令工具实测后读匿名记录；后续取消与失败未开始。测试结束仍需关闭记录并回普通dev。


## 2026-10-20 Main自行验证

用户明确要求未确定的开发验证由Main自行在终端完成，最终可交付时才交用户验收。这覆盖上述相同3轮任务的操作者变更：Main仅在独立新Codex测试会话发送限定任务、只取消该会话本轮新任务、不操作已有会话/任务，不扩大模型任务内容/文件/配置权限。已在原任务目录正常启动固定CLI（无新启动模式/连接环境变量），TERM=dumb提示选择继续；不改shell设置。首轮模型回复完成且result.txt存在，但旧匿名记录mtime仍为2026-10-19，无法证明本轮App接收，因此不判通过。

为保留旧证据并恢复同种有界记录，Main将正常退出当前Agent Pet、独占新建同仓库 `.agent-work/codex-task-live-20261020`（0700），仅states.ndjson（0600、最多128KiB，原白名单不变）并重开记录dev；旧20261019目录不改/不覆盖。仍使用原已批准任务目录、原3轮任务及同一产品配置。此为用户新委托内必要的同类开发验证调整，不收集新增类型数据、不改变Agent hooks/token，不再逐步请用户操作。基础设施恢复仅一次；失败保留证据和安全停点。终止测试会话正常/quit，仅退出本次TUI，不停止共享日常后台；App最后回普通dev并关闭临时记录。

# 日常 Codex CLI 接入与 dev 验证预览

2026-10-19。用户已按本页精确范围授权，基础日常上线验收通过，细分状态矩阵未完成。代码已在 d88e9cd 完成，隔离默认启动两轮结果见 3a6254c 与 [默认实测](CODEX-DEFAULT-START-PREVIEW.md)。本次不打包，不更新/安装 Codex。

## 最终结果（2026-10-19）

用户已完成原生通知审核及一次正常模型测试，明确确认“已连接，首页有宠物”。Main receipt/state核对有效、disabled=false/removed=false、10事件原命令匹配，pi/Claude/Codex三条连接记录保留。Assistant随后在实际普通dev的原生AX中读到“聚焦 Codex 的小伙伴（Codex CLI）”，真实GLB宠物截图见[首页](../.agent-work/codex-daily-home-live-raised.jpg)，不是测试桥接数据。真实连接页“已连接”由用户确认，Assistant此前亲自确认了配置预览/等待首次任务页；最终模型点击因noWindowsAvailable未验证，不宣称本轮原生聚焦交互验收通过。

普通dev仍运行于 localhost:5173（源码启动，无打包）；临时匿名状态记录已在故障排查停点正常关闭，最终真实任务发生在普通dev中，没有为该任务新增日志采集。不依赖专用Codex启动指令，用户照常codex启动。首次任务前不会凭空在线，程序升级/其他安装方式仍需兼容核验；自动扫描Codex、桌面端、完整工具/错误/取消/等待/并发及系统重启矩阵未验收。

配置保持边界：未读写config.toml、登录/token、shell或程序；原hooks.json不存在，新增内容只有本产品10组通知；原pi/Claude配置记录、原备份保留。应用户要求做过一次暂停/撤回对照（仍killed），又明确恢复同命令；换新终端后用户确认能启动。具体killed根因未定，不能将它简单归因于旧标签或宣称此前操作绝对无关。独立隔离--version也SIGKILL的记录与日志分类器缺陷保留，见[诊断](CODEX-KILLED-CHECK-PREVIEW.md)和[撤回/恢复](CODEX-DAILY-WITHDRAW-CHECK-PREVIEW.md)。没有重装/重签名/安全属性更改。

本阶段再次运行12项Main/hooks/正式React回归、pnpm typecheck、pnpm --filter @agent-pet/desktop build，均通过。仅源码构建，无打包；Three重复导入的已有测试warning保留。未修改实现源码，本阶段提交只记录授权与实际验收证据；不是正式发布验收。

## 目标和读取范围

- 日常配置目录固定 `/Users/gan/.codex`。读取祖先/目录 metadata，只读 `hooks.json`（最多64KiB），检查格式、权限、禁用意图与重复；不输出原命令/内容。若你日常使用不同 CODEX_HOME，应先更正目标，本次不搜索其他目录。
- 仅检查 `/Users/gan/.local/bin/codex` 的有界链接/祖先/实际程序 metadata，及目标内 `packages/app-server-daemon/current`、`packages/standalone/current` 对应的有限链接/程序 metadata。只核对四个固定旧布局状态文件的存在/类型：`app-server.pid`、`app-server.stderr.log`、`app-server-updater.pid`、`app-server-updater.stderr.log`，不读其内容。只接受现有支持的0.163.0路径，不执行版本检查或安装。
- 同一 Agent Pet userData `/Users/gan/Library/Application Support/@agent-pet/desktop`：读取配置列表/偏好和原产品接收记录；记录只用于保留现有配置并正常恢复。原 Claude 私有目录 `claude-normal-96b61d46-b8b4-4c45-bb1e-7415b4f6f312` 的 hook/observer/activation/receipt 及 `/Users/gan/.claude/settings.json`（最多64KiB）仅供原有恢复逻辑校验；不输出内容，不修改 Claude settings/hooks。不读取任何 Agent 登录凭据、auth、对话或会话文件，不读 Codex config.toml。
- 对文件身份/持久身份检查复用现有 Main，包括自身进程自检、已知 hook 和至多15级祖先的 UID/精确程序/出生时间校验、已识别宿主的存活检查；不读取进程参数、环境或整机进程列表。磁盘身份仅用现有 df/diskutil 查询。

## 写入与生效

1. 正常退出当前 Agent Pet，使用同一 userData 启动新版 dev。会短暂中断观察/清空气泡；不结束、重载或启动 Codex/Claude/pi，不停止它们的后台。原 Claude 接收器按既有规则恢复并轮换本产品 activation/receipt；pi保留当前配置，不在此次操作其恢复/部署。Electron正常写本产品缓存/窗口偏好。
2. 正式连接页手动添加一条 Codex CLI 记录（若同目标已有记录则使用原记录，绝不再建重复项），更新产品 `configurations.json`，保留已有名称、路径、绑定与偏好。由原生选择器选择上述既有程序并查看正式连接预览；检查不通过即停，不手改 guard 或安装方式。
3. 确认后，仅追加 `/Users/gan/.codex/hooks.json` 中本产品10组通知：SessionStart、SessionEnd、UserPromptSubmit、PreToolUse、PostToolUse、PermissionRequest、Stop、Interrupt、PreCompact、PostCompact。保留现有JSON值、无关内容和原权限；通过独占 `hooks.agent-pet.pending.json` 保存。禁用/重复/编辑/权限/旧预览失败则保留并停止，不覆盖未知数据。
4. 新记录UUID由Main生成：在上述 userData 下独占建立 `codex-registration-<本次UUID>`（0700），`state.json/receipt.json`（0600）保存原hooks备份和归属；`codex-normal-<同一UUID>`（0700）内 `observer.cjs/activation.json/hook.json/receipt.json`（0600）为本产品接收材料。保存/恢复使用各模块既定 pending/next 文件，校验并fsync；未知/并发编辑保留。监听独占认证loopback端口，无公网监听。不输出/复制接收凭据。
5. 独占新建 `/Users/gan/Desktop/🥷/agent-pet/.agent-work/codex-daily-live-20261019`（0700），仅 `states.ndjson`（0600，最多128KiB），使用已有 `AGENT_PET_DEV_EVIDENCE_DIR`；记录匿名状态/动作/能力类别，不记录名称、原生ID、任务内容、路径、token或服务地址。其他已接入会话也只记录同样白名单字段；已存在则停止、不覆盖。测试完成后正常关闭记录版dev，再不带此变量重开同一dev；不删除证据。最后一次重启仅验证保存和接收恢复，不自动发送任务。

## 用户操作与验证范围

由你在可信目录新开终端照常运行 `codex`，自行决定正常账号/工作目录信任提示。在原生 `/hooks` 中只审核本产品新增10条（不替你信任日常hooks、不直接写信任文件），保留其他条目。已有会话不接管、不退出、不取消。

由你发送一条“仅回复测试完成，不使用工具、不读写文件、不联网”的任务；这使用你原本的模型/服务额度。Agent Pet不发送模型请求、不读取或改变服务/登录配置。核对连接页从等待首次任务变为已连接、首页出现对应宠物、能聚焦及退出；匿名状态链路收到真实事件才算在线。Stop不冒充任务成功，空CLI不冒充在线；是否有动作取决于事件和可选动画。后续细分工具/错误/取消矩阵需限定任务后继续，不随本次基础上线一并宣称通过。

你若不愿发送真实模型任务，可停在“等待首次任务”；不会把已安装/已信任当作真实在线验收。本次也不包含Codex桌面端、其他安装版本/方式、额外Provider部署或推送。

## 失败与撤回

原JSON/禁用意图/版本/权限/加载异常即停，保留证据，不通过重试或特殊启动命令绕过。配置编辑/未知hooks不删除，失败保留原配置及新私有记录。暂停只停接收，不影响Codex；正式“移除连接”仅选择性撤回精确匹配且未编辑的本产品组，保留原hooks、所有用户文件和私有备份，不整份恢复旧文件。实际撤回按用户决定，不因测试结束自动移除希望保留的连接。

授权依据：AGENTS.md要求“真实目标操作仍需精确范围、预览与授权”。先前隔离目录的安装/信任/运行同意不涵盖本次日常 hooks.json 写入、新连接记录、dev状态记录及真实任务。用户确认本页后可执行上述范围，不逐项重复请求同一授权。

## 执行记录（历史停点按顺序保留）

已核对现有CLI为standalone `0.163.0-aarch64-apple-darwin/bin/codex`、默认宿主为独立app-server-daemon同版本路径，均通过正式Main metadata核验。日常hooks.json原先不存在；应用原列表仅pi与Claude两条。只读核对助手首试误传空编译文件名导致Node退出，尚未读取目标；修正为明确字符串文件名后一次复验通过，无配置写入。

新版记录dev在 localhost:5173 启动（源码构建，无打包），证据文件独占创建。原生正式连接页完成位置授权→Codex类型→名称“Codex CLI”→保存，列表显示3条，原pi/Claude仍保留。当前停在原生程序选择器，尚未确认连接预览、未写hooks；路径快捷键未成功，应用菜单重新显示选择器后，后续操作报告用户切换及ScreenCaptureKit读取失败，按有界规则停止自动化，已请用户手动选择核对的程序。尚无真实Codex任务、登录或信任操作；匿名记录仍开启，测试结束必须关闭并恢复普通dev。未把半完成阶段提交。


用户手动选择程序并回复预览已打开后，Main实看确认目标hooks.json、默认宿主程序与10条追加范围一致。首次点击被界面切换中断，重读仍在预览，按当前状态再次确认后保存成功；正式UI显示“等待首次任务”，原pi/Claude仍在。仅输出计数/类型的有界核对确认hooks.json为0600、10个预定事件/10组、各组仅一个本产品命令，未读取config.toml或登录文件。真实Electron截图保存为 `.agent-work/codex-daily-waiting.jpg`，不是示例数据。已请用户照常新开codex、在原生界面审核自有通知并发送一条不使用工具的测试；日常原生审核、真实在线、首页宠物及最终关闭匿名记录仍待用户操作后核验。


后续用户正常运行codex报 `zsh: killed codex`，因此原生审核/首次任务未完成。按另行精确授权的只读诊断，隔离--version仍SIGKILL，静态签名通过且无quarantine；两次有界日志的证据限制见 [终止诊断](CODEX-KILLED-CHECK-PREVIEW.md)，具体根因未定，不归因新增hooks、不重装/重签名。按原预览正常退出记录版dev（exit0），已关闭匿名记录；重新不带证据环境变量启动同一普通dev（会话71349、localhost:5173，Main/preload源码构建通过，无打包）。Codex配置和10条hooks保留，不操作现有Agent；未做真实模型请求。新普通dev原生菜单可打开管理首页，后续导航AX点击未切页且截图返回宠物窗口，未据此宣称重启后的连接详情UI已验证。当前日常上线仍停在CLI启动故障；本轮不是已完成交付阶段，不强行提交预览草稿。

# Claude Code CLI 实施与验收 · 2026-10-16

状态：**Claude CLI 的连接与静态陪伴已接入正式 Main、连接页与首页，完成隔离 dev 验证。真实日常 Claude 交互接入尚未验收；任务动作、完成/出错提醒尚未启用。** 继续 dev，不打包；没有读取或改动日常 Claude 设置、原有 hooks、shell 配置或现有 Agent 进程。下方前三阶段是历史证据，最新范围见末节。

## 顺序与边界

用户确认Claude Code CLI → Codex CLI → Antigravity CLI，全部CLI先做，Codex与Antigravity桌面端最后分别验证。一种宿主通过不能推断另一种通过。未实施的新Provider继续如实显示不支持，不把安装、配置可用或回调送达当在线连接。

## 已实施

- 第一阶段`6f03314`：64KiB原生输入白名单，只保留安全事实；后补原生prompt_id/agent_id，缺失时不补造，agent_type不当子任务身份。原生会话编号不是进程运行编号。
- 第二阶段`d8bdf26`：发送前/接收后两次收窄字段、认证loopback回调、近期去重、资源上限、关闭/回调重入保护。外部可信运行绑定必需，消息不能自行登记；不把接收顺序冒充原生因果顺序。没有凭据持久化或安装器，pi原传输及managed guard不变。
- 第三阶段：独立Node入口限定stdin/时间/显式接收环境，只传安全事实，无文件读取、输出、重试、许可决定或任务控制。插件文档生成器只返回标准文件内容，不写入现有设置，也不启动Agent。库入口不退出宿主，仅独立进程入口安静退出0。

Stop、工具失败和工具中止不冒充整个任务成功或取消；短命hook退出不发Agent离线。缺可靠运行/工作关联时不发布SessionObservation，不猜最近任务或在线状态。模块契约以 [README](../integrations/claude-hooks/README.md)、[输入](../integrations/claude-hooks/normalize.ts)、[传输](../integrations/claude-hooks/transport.ts)、[调用脚本](../integrations/claude-hooks/command.ts)及行为测试为准。

## 验证与修复

- 相关`pnpm exec vitest run integrations/claude-hooks/normalize.test.ts integrations/claude-hooks/transport.test.ts integrations/claude-hooks/command.test.ts`：47通过。实际编译脚本在独立Node进程运行，覆盖正常、未知运行、拒绝/失联接收器、畸形/过大/未关闭输入、管道异常、清理和路径引用。均为自有合成输入/loopback，不启动真实Agent。
- `pnpm test --maxWorkers=2`：**811 passed / 1 skipped / 81 files**。
- `pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过；build仅编译，没有打包。
- 独立Review复验47项通过，确认排队错误回归已修复；没有将原生加载标为通过。

上一轮因标准Readable超限后排队I/O错误导致退出1/stderr而安全停止；用户本轮要求继续后，重新运行原失败回归并用标准Readable探针证明closed标志早于error/close事件。保留错误处理至事件送达、延后已关闭流清理后，原回归通过；没有删除/放宽静默退出断言，没有生产探针。

输入契约明确限本机stdin（启用close事件）。独立Review发现的P3为自定义emitClose:false异步销毁流可能保留监听，已明确不支持这种自定义输入；独立入口立即退出，不存在该进程内残留。旧`/tmp/agent-pet-claude-plugin-review-20261016-f38b9d`来自未修复初版，STOPPED标记保留，不能加载。

## 尚缺的正式接入条件

1. 原生manifest校验已按[精确授权](CLAUDE-PLUGIN-CHECK-PREVIEW.md)通过；另按[启动检查授权](CLAUDE-NATIVE-START-PREVIEW.md)实际--init-only加载插件，退出0、无输出，真实收到startup/SessionEnd。仅覆盖隔离初始化运行，没有prompt，不能推断工作/子任务编号与交互事件；日常部署仍未授权/完成。
2. 原生producer的运行身份及工作/子任务关联；不能用hook子进程PID、会话编号或最近事件冒充运行绑定，缺失prompt_id不归到最近一轮。
3. 可靠生命周期/在线表达及真实等待、失败、取消；没有后置结束证据时Stop不是completed-unread，不用定时器补造。
4. Provider controller、Configurations、Main/UI接线，以及精确部署预览、独立授权、激活、重启恢复、选择性撤回和现有设置保留。
5. Claude验证后依次实施Codex CLI与Antigravity CLI；桌面端最后。真实新Provider与发布验收均保持未通过。

CLI程序已按本轮用户授权更新；[原入口版本、备份与撤回范围](CLI-UPDATE-PREVIEW.md)。原生隔离启动/结束也通过；不把程序更新、manifest或短命初始化回调当正式新Provider接入通过。

## 用户终端入口的进程绑定基础

`launcher.ts`新增独立调用库，由未来用户终端入口显式调用，不接Main/UI。每次独立UUID/token和真实ChildProcess，根SessionStart且子进程有效才报告观察；其他hook、SessionEnd或短命hook退出不完成运行。停止观察只关闭接收，不发信号/等待/结束Claude；实际退出后再清理。用户环境与参数保留，AGENT_PET_*控制环境剔除，仅添加三项hook环境。报告异常/拒绝Promise只撤销观察，不终止子进程。

相关58项（含11个真实自有Node子进程用例）通过；最终全量`pnpm test --maxWorkers=2`为822 passed / 1 skipped / 82 files，typecheck与desktop build通过。独立Review另复验11项，无确定问题；显式回调重入和已有--plugin-dir尚缺专项测试，原生参数/终端信号/派生进程生命周期仍未验收。此阶段没有新的真实Claude执行或配置读取。设计范围见[连接与陪伴](CLAUDE-CLI-PRESENCE-DESIGN.md)。

尚缺：可执行终端入口及信号行为、独立认证Main控制通道、私有材料预览/部署/撤回、正式管理窗口和首页接线。当前dev仍只有pi正式连接；不能用此调用库给用户显示成功连接按钮，任务动作和提醒也未启用。


## 正式连接与首页切片（2026-10-16）

- 正式 `Configurations` 分派 Claude 专用 controller，保留 pi 接口及 guard。手动添加、原位重命名、绑定宠物、预览/确认/取消、显式恢复、暂停和移除共用既有类型化 bridge。Main/UI不创建 Agent 进程。
- 首次设置由用户原生选择程序；只核对有界安装 metadata。目前支持已验证的 npm2.1.301/`bin/claude.exe`，其余安装如实提示不支持。配置路径仅保存作区分，不读取 Claude settings。
- 确认弹窗列出精确自有文件/权限/保存与生效方式。独占创建私有材料，固定树/权限/owner/identity/digest 校验；恢复原子轮换激活信息。异常、未知文件和失败残留全部保留，停止使用。
- 用户终端入口持有直接子进程，通过独立认证长连接报告三类生命周期枚举。Main收到有效根hook和有效子进程后才显示在线；多运行部分退出不影响其余运行。hook凭据无法登记控制通道；通道失联仅撤销观察，不终止 Agent。
- 首页按配置显示静态宠物，点击/键盘聚焦沿用正式场景。`presence` 是无业务动作的静态投影，缺动画正常回退；不发布 SessionObservation，不用 idle 冒充已知任务。暂停/离线/移除会离场。
- 重开应用只读恢复元数据，不自动监听；显式继续连接后须用命令打开新的 Claude。移除只删除本产品配置记录，保留 hook/运行文件，避免影响仍运行的 CLI；本切片不自动清理残留运行材料。

验证命令：`pnpm typecheck`、`pnpm test --maxWorkers=1`、`pnpm --filter @agent-pet/desktop build`。本轮没有 application package。首次完整双并行运行一项终端fixture未在3秒内就绪（其余923通过/1跳过）；原文件5项独立复验通过，一次有界完整单并行复验 **924 passed / 1 skipped / 87 files**；未更改生产deadline或放宽断言。独立 Review 另复验140项通过。

隔离 dev 使用正式 Main/preload/Renderer 和自建 Node 程序，原生程序选择器仅在测试入口替换；没有使用真实 Claude 或模拟业务任务事件。原生 npm Claude manifest/`--init-only` 的旧证据不等于本轮日常前台任务验收。实际截图与独立产品检查见下节；桌面宿主、新Provider、Claude任务动作及发布保持未验收。


### 正式 dev 页面证据与独立产品检查

隔离目录：`/private/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-claude-ui-1u6w7qbf`。仅此测试入口替换原生程序/目录 picker，生产代码无 mock；Renderer 5476 dev、正式 Electron Main/preload、独立 userData，原日常 dev 未切换。独立 Review 无确定缺陷；独立 Product Test 在实际窗口完成：

- 手动添加三步、预览/取消/Escape与焦点恢复、确认后等待且首页无宠物。
- Main生成的六份文件 → 公共命令 → Electron Node 模式入口 → 生成的 `hooks.json` 命令 → 实际合成根hook → Main/UI在线。自有程序输出固定说明，不是真实Claude；没有模型调用或对话内容。
- 连接后首页一只静态宠物，Application Session/气泡仍为空；自有程序通过stdin正常退出后宠物离场。Main另实看键盘聚焦、姓名/配置/范围说明与完整顶部栏。
- 暂停/恢复通过；修正触发按钮消失后的焦点丢失，再以实际Enter复验焦点分别到“已暂停”“等待启动”。移除确认后仅记录消失，六份运行文件全部保留。
- 900×680、390×844、900×400页面实看，无横向溢出。长路径/命令单行截断，完整值可选择或title查看。

截图均来自正式 Electron dev： [连接](evidence/claude-cli/native-connected.png)、[首页聚焦](evidence/claude-cli/native-home-focused.png)、[确认弹窗](evidence/claude-cli/native-preview.png)、[窄窗口](evidence/claude-cli/native-narrow-connected.png)、[矮窗口移除](evidence/claude-cli/native-short-remove-preview.png)、[手动添加](evidence/claude-cli/native-manual-add.png)、[新记录等待](evidence/claude-cli/native-manual-waiting.png)。原首页全景截图顶部裁切疑点在Main当前同窗口检查中未复现：聚焦前/键盘聚焦/选择后shell/content/document滚动均0，顶部栏y0/53px；未据此修改场景CSS。

收尾：自有程序均自然退出，独立dev保留“Claude CLI · 手动隔离验证”记录，状态等待启动。没有启动/重载/暂停真实Claude或pi、改写日常Agent配置、依赖安装、模型消费、打包或推送。终端错误恢复提示/文案/焦点修正后相关19项及typecheck/build再次通过；完整924项属于此前同实现核心范围，未重复全量消耗。

仍待：精确预览/授权后的本机真实Claude前台交互、原配置/hooks并存和多真实运行验证；后台/脱离/重新执行派生进程支持；任务/子任务事实适配、等待/出错/取消与动作提醒；Codex/Antigravity及其桌面宿主；发布验收。

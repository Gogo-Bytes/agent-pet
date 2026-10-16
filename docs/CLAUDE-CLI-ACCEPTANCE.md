# Claude Code CLI 实施与验收 · 2026-10-16

状态：**输入白名单、本机回调传输、独立调用脚本与插件文档生成器已实现并隔离验证。真实CLI的隔离启动/结束回调通过；尚未接通正式产品，未注册Main/连接页面或部署到日常配置。** 继续dev，不打包；日常Agent配置、pi及既有Agent进程保持原状。

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

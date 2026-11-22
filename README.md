# Agent Pet

面向多个 AI Agent 的本机桌面宠物。只观察已授权接入的 Session，以宠物动作和独立气泡表达状态，不启动、审批或控制 Agent，不读取对话正文。

当前开发以单用户 macOS 为主，已有 pi、Claude Code、Codex CLI 的有界接入；各自支持的版本、宿主和事件不同，不代表全部任务状态可观察。桌面和首页按**在线且显式绑定的配置**展示宠物；支持内置及本地 GLB 宠物包，所有动画均可选。

## 我的 Agent 能显示哪些状态？

**在线不等于正在工作。** 下表是当前 macOS 被动接入的能力范围；其他版本和安装布局的兼容性未知，扫描到可执行文件不代表支持。

| Agent、版本与接入方式 | 桌宠能依据什么显示状态 | 不能据此判断什么 |
| --- | --- | --- |
| [pi 0.85.1 TUI](integrations/pi-extension/README.md)，从实际配置目录加载用户扩展 | `agent_start` 表示开始工作；整轮结束且回到空闲时，结合本轮终止信息区分完成、错误或取消。可观察扩展发起的输入等待。 | 单个工具结束不代表整轮完成；业务重试未知。此接入不支持 SDK/RPC。 |
| [Claude Code 2.1.301 CLI](integrations/claude-hooks/README.md)，npm 原生 `bin/claude.exe` 布局。首次连接默认 `~/.claude` 时，Agent Pet 安装用户级观察插件；自定义配置仍使用 `settings.json` hooks，已有连接不迁移 | 与当前提示匹配的 `StopFailure` 可显示回答出错；工具返回只用于确认本轮确实执行过，不单独提示。压缩上下文不会切换桌宠动作。 | 提交提示不证明持续工作；权限提醒不证明持续等待；`Stop` 不证明整轮成功，也不能据此判断取消。 |
| [Codex CLI 0.163.0](integrations/codex-hooks/README.md)，standalone 安装，通过 hooks 观察 | 首轮收到已验证事件后才可能出现桌宠；Bash 和 `apply_patch` 返回后可显示执行或写入反馈，当前轮次压缩完成可短暂提示，根会话显式中断可显示取消。 | 打开空 CLI 不保证立即在线；不能推断持续工作、等待、整轮成功或一般命令、模型错误。 |
| [Codex 桌面内置程序](integrations/codex-hooks/README.md)，仅限已核对的 macOS `ChatGPT.app` 签名布局（外层版本 `26.1111.21308`） | 接收端只接受所选配置的 `SessionStart` / `SessionEnd`，并校验发送进程。 | 会话结束不代表任务成功或应用退出；不能套用上一行 CLI 的工具和取消反馈。 |

已有 Claude 任务事件连接不需要重装插件或重新绑定。即使旧观察程序仍发送工具分类，Agent Pet 也不据此播放读取、搜索等动作。

**尚未实测的入口：** Claude 用户级插件的真实事件送达、Claude Desktop 本地 Code 会话，以及 Codex 桌面内置程序的事件送达。Codex 的 hook 需用户在宿主中审阅并信任；尚未实测 CLI 和 Desktop 首次配置时是否主动显示审阅入口。

**重启与下一轮：** Agent Pet 重启后，pi 配置需要显式恢复观察；重新连接时上报当前状态，不补播离线期间的完成事件。Claude 和 Codex 的未暂停配置自动恢复观察，下一轮只依据新收到的匹配事件。三者都不能从桌宠保证跳回原终端会话。动画还取决于绑定宠物包的映射；具体信号见[触发能力对照](docs/PET-TRIGGER-AUDIT.md)。

## 项目入口

- [开发、运行与验证](apps/desktop/README.md)
- [文档导航](docs/README.md)
- [当前优先级与任务入口](docs/MVP-EXECUTION-PLAN.md)
- [产品需求](PRODUCT-REQUIREMENTS.md) · [领域术语](CONTEXT.md)
- [宠物作者指南](docs/PET-ARTIST-GUIDE.md)
- [工程规则](AGENTS.md) · [GitHub 工作流](.agents/skills/github-workflow/SKILL.md)

本地构建和自动化测试不等于原生交互、跨机器或正式发布验收。真实配置读写、模型请求、推送及线上仓库操作分别确认授权；生产签名、公证和完整隔离验收仍不作为已通过能力宣传。

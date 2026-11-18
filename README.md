# Agent Pet

面向多个 AI Agent 的本机桌面宠物。只观察已授权接入的 Session，以宠物动作和独立气泡表达状态，不启动、审批或控制 Agent，不读取对话正文。

当前开发以单用户 macOS 为主，已有 pi、Claude Code、Codex CLI 的有界接入；各自支持的版本、宿主和事件不同，不代表全部任务状态可观察。桌面和首页按**在线且显式绑定的配置**展示宠物；支持内置及本地 GLB 宠物包，所有动画均可选。

## 我的 Agent 能显示哪些状态？

**在线不等于正在工作。** 下表是当前 macOS 被动接入的能力范围；其他版本和安装布局的兼容性未知，扫描到可执行文件不代表支持。

| Agent、版本与接入方式 | 桌宠能依据什么显示状态 | 不能据此判断什么 |
| --- | --- | --- |
| [pi 0.85.1 TUI](integrations/pi-extension/README.md)，从实际配置目录加载用户扩展 | `agent_start` 表示开始工作；整轮结束且回到空闲时，结合本轮终止信息区分完成、错误或取消。可观察扩展发起的输入等待。 | 单个工具结束不代表整轮完成；业务重试未知。此接入不支持 SDK/RPC。 |
| [Claude Code 2.1.301 CLI](integrations/claude-hooks/README.md)，npm 安装且使用原生 `bin/claude.exe` 布局，通过 hooks 观察 | 可显示近期读、写、查找、执行反馈；与当前提示匹配的 `StopFailure` 可显示错误。 | 提交提示不证明持续工作；权限提醒不证明持续等待；`Stop` 不证明整轮成功，也不能据此判断取消。 |
| [Codex CLI 0.163.0](integrations/codex-hooks/README.md)，standalone 安装，通过 hooks 观察 | 首轮收到已验证事件后才可能出现桌宠；Bash 和 `apply_patch` 结果提供短暂执行或写入反馈，根会话显式中断可显示取消。 | 打开空 CLI 不保证立即在线；不能推断持续工作、等待、整轮成功或一般命令、模型错误。 |

**重启与下一轮：** Agent Pet 重启后，pi 配置需要显式恢复观察；重新连接时上报当前状态，不补播离线期间的完成事件。Claude 和 Codex 的未暂停配置自动恢复观察，下一轮只依据新收到的匹配事件。三者都不能从桌宠保证跳回原终端会话。动画还取决于绑定宠物包的映射；具体信号见[触发能力对照](docs/PET-TRIGGER-AUDIT.md)。

## 项目入口

- [开发、运行与验证](apps/desktop/README.md)
- [文档导航](docs/README.md)
- [当前优先级与任务入口](docs/MVP-EXECUTION-PLAN.md)
- [产品需求](PRODUCT-REQUIREMENTS.md) · [领域术语](CONTEXT.md)
- [宠物作者指南](docs/PET-ARTIST-GUIDE.md)
- [工程规则](AGENTS.md) · [GitHub 工作流](.agents/skills/github-workflow/SKILL.md)

本地构建和自动化测试不等于原生交互、跨机器或正式发布验收。真实配置读写、模型请求、推送及线上仓库操作分别确认授权；生产签名、公证和完整隔离验收仍不作为已通过能力宣传。

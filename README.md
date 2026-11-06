# Agent Pet

面向多个 AI Agent 的本机桌面宠物。只观察已授权接入的 Session，以宠物动作和独立气泡表达状态，不启动、审批或控制 Agent，不读取对话正文。

当前开发以单用户 macOS 为主，已有 pi、Claude Code、Codex CLI 的有界接入；各自支持的版本、宿主和事件不同，不代表全部任务状态可观察。桌面和首页按**在线且显式绑定的配置**展示宠物；支持内置及本地 GLB 宠物包，所有动画均可选。

- [开发、运行与验证](apps/desktop/README.md)
- [文档导航](docs/README.md)
- [当前优先级与任务入口](docs/MVP-EXECUTION-PLAN.md)
- [产品需求](PRODUCT-REQUIREMENTS.md) · [领域术语](CONTEXT.md)
- [宠物作者指南](docs/PET-ARTIST-GUIDE.md)
- [工程规则](AGENTS.md) · [GitHub 工作流](.agents/skills/github-workflow/SKILL.md)

本地构建和自动化测试不等于原生交互、跨机器或正式发布验收。真实配置读写、模型请求、推送及线上仓库操作分别确认授权；生产签名、公证和完整隔离验收仍不作为已通过能力宣传。

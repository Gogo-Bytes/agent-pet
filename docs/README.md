# 文档导航

仓库文档只维护项目知识、规范和使用方法。当前优先级及尚未迁移任务见 [MVP 执行计划](MVP-EXECUTION-PLAN.md)；已迁移任务动态状态只维护于 [#15 Provider 收尾](https://github.com/Gogo-Bytes/agent-pet/issues/15)、[#16 细类来源](https://github.com/Gogo-Bytes/agent-pet/issues/16)、[#17 持续状态动画](https://github.com/Gogo-Bytes/agent-pet/issues/17)。

## 产品与架构

- [产品需求与交互原则](../PRODUCT-REQUIREMENTS.md) · [领域术语](../CONTEXT.md)
- [界面内容设计规范](UI-CONTENT-DESIGN.md)：文案取舍、信息层级、授权与无障碍边界
- [架构设计](ARCHITECTURE-DESIGN.md) · [Three.js 场景与 HTML 控件 ADR](adr/0001-threejs-scene-html-controls.md)
- [安全与数据保护边界](SECURITY-BOUNDARIES.md)：权限、文件所有权、managed 生命周期、D6/发布限制
- [桌面开发与本地构建](../apps/desktop/README.md)
- [工程规则](../AGENTS.md) · [GitHub 工作流](../.agents/skills/github-workflow/SKILL.md)

## Agent 接入

- [pi 扩展](../integrations/pi-extension/README.md) · [pi Adapter/休眠 managed 核心](../packages/adapter-pi/README.md)
- [Claude hooks](../integrations/claude-hooks/README.md) · [Codex hooks](../integrations/codex-hooks/README.md) · [共享 hook runtime](../integrations/hook-runtime/README.md)
- [业务重试与输出限制的版本化来源](PROVIDER-ANIMATION-EVIDENCE.md)
- [Codex 错误事实边界](CODEX-ERROR-FEEDBACK-LIMIT.md)

## 宠物资产与播放

- [作者指南](PET-ARTIST-GUIDE.md)：包格式、预算、可选映射及自然循环制作
- [触发能力表](PET-TRIGGER-AUDIT.md)：Provider 事实、本地输入、回退与播放限制
- [持续状态 in / loop / out](PET-ANIMATION-TRANSITIONS.md)：已确认、尚未实施的有界设计
- [内置素材与生成器](../packages/pet-runtime/assets/README.md) · [依赖补丁边界](../patches/README.md)

这些文档和开发命令不授予真实目标操作许可；测试、原生/GPU和用户验收不相互替代。当前能力只按明确版本与观察面表达。

# 文档导航

当前优先级与尚未迁入 Issue 的任务统一从 [MVP 执行计划](MVP-EXECUTION-PLAN.md) 进入。文档维护长期契约和可追溯证据，不另建进度表。首批迁移已核查：[Provider 收尾 #15](https://github.com/Gogo-Bytes/agent-pet/issues/15)、[细类来源 #16](https://github.com/Gogo-Bytes/agent-pet/issues/16)、[持续状态动画 #17](https://github.com/Gogo-Bytes/agent-pet/issues/17)。这三项的动态状态只维护在 Issue，计划保留优先级与链接；其他任务仍未迁移。

## 产品与架构

- [产品方向](PRODUCT-DIRECTION.md)：定位与交互原则；带日期的原型迭代单列为历史。
- [产品需求](../PRODUCT-REQUIREMENTS.md) · [领域术语](../CONTEXT.md)：可观察行为和统一语言。
- [架构设计](ARCHITECTURE-DESIGN.md) · [Three.js 场景与 HTML 控件 ADR](adr/0001-threejs-scene-html-controls.md)：边界、职责及实现入口。
- [桌面开发说明](../apps/desktop/README.md)：运行、构建及测试边界。
- [工程规则](../AGENTS.md) · [GitHub 工作流](../.agents/skills/github-workflow/SKILL.md)：小修直接闭环，跨轮任务按授权迁移，合并不等于验收。

## Agent 接入

- 当前接线与字段边界：[pi 扩展](../integrations/pi-extension/README.md)、[Claude hooks](../integrations/claude-hooks/README.md)、[Codex hooks](../integrations/codex-hooks/README.md)。
- [被动观察原则与早期接入拆分](AGENT-INTEGRATION-PLAN.md)。
- Claude：[普通启动](CLAUDE-NORMAL-START-DESIGN.md)、[安装发现](CLAUDE-DISCOVERY-DESIGN.md)、[任务事实](CLAUDE-TASK-OBSERVATION.md)。
- Codex：[扫描配置与连接](CODEX-CLI-CONNECTION.md)、[错误事实限制](CODEX-ERROR-FEEDBACK-LIMIT.md)。
- [连接重启恢复](CONNECTION-RESTART-RECOVERY.md) · [输出限制／重试的一手证据与阻塞](PROVIDER-ANIMATION-EVIDENCE.md)。

## 宠物资产与播放

- [作者指南](PET-ARTIST-GUIDE.md)：当前可导入的包格式、可选映射及制作要求。
- [导入边界与历史实施](PET-ASSET-IMPORT-PLAN.md)：私有快照、文件保留、资产与绑定职责。
- [触发审计](PET-TRIGGER-AUDIT.md)：目录、来源、接线和验收的区别。
- [持续状态 in／loop／out](PET-ANIMATION-TRANSITIONS.md)：已确认、待实施的有界扩展；不是当前包格式。
- [格温制作与诊断证据](GWEN-LOOP-DIAGNOSIS.md)：已交付片段、被拒候选及许可边界；不随仓库再分发用户资产。

## 验收与历史资料

以下保留原版本、范围、失败和授权记录，不把旧“下一步／待授权”当成当前任务或再次执行许可：

- [MVP 人工验收](MVP-MANUAL-CHECKLIST.md)、[重启清单](MVP-RESTART-CHECKLIST.md)、[剩余行为验收](MVP-REMAINING-ACCEPTANCE.md)。
- [正式管理界面迁移](MANAGEMENT-MIGRATION-ACCEPTANCE.md)、[pi 真实扩展反馈](PI-EXTENSION-LIVE-ACCEPTANCE.md)、[Claude 验收记录](CLAUDE-CLI-ACCEPTANCE.md)、[Codex 日常操作记录](CODEX-DAILY-CONNECTION-PREVIEW.md)。
- [旧管理组件迁移实测](MANAGEMENT-UI-COMPONENTS.md)、[原型配置交互验收](CONFIGURATION-UI-REVIEW.md)、[首页原型验收](HOME-SCENE-REVIEW.md)、[Renderer 迁移验收](RENDERER-R4-ACCEPTANCE.md)。
- [P2 实施证据](DESKTOP-P2-IMPLEMENTATION.md)、[本机安全决策](P0-LOCAL-SECURITY-DECISION.md)、[文件系统与 D6 边界](DESKTOP-P2B2-FILESYSTEM-POLICY.md)：历史排期不决定本机 MVP，安全约束与未通过结论继续有效。

已被当前需求、架构和阶段结果取代的早期选型、旧实施计划及弃用的视觉建议已删除，不再作为开发入口。必要的原稿依据在引用处给出固定 Git 版本；实测结果、失败记录、授权范围与尚未关闭的安全约束仍保留。

`*-PREVIEW.md` 是特定操作范围；`*-ACCEPTANCE.md`、`evidence/` 和 `screenshots/` 是分层证据，不代表所有后续版本或真实环境均已通过。恢复工作前回到当前执行计划，再读取所需专项材料。

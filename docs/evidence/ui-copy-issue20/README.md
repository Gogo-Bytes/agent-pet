# #20 界面文案验收

2026-11-13，文案基线 `d7f00c3` 加本记录所在提交。清理与显示验收完成，尚未推送或合入。

## 来源清点

| 用户入口 | 检查的文案来源与处理 |
| --- | --- |
| 首页、宠物、收藏、导入 | `CompanionScene`、`PetsView`、`PetImportControl`、`PetSizeControl`：缩短空状态和切换提示；保留文件要求、许可、错误和操作名称。 |
| 连接列表、扫描、添加、详情、移除 | `ConnectionsView`、`DetectedCliResult`、`DetectedSetupDialog`、`ManualConnectionDialog`、`RemoveConnectionDialog`：删除重复说明，保留目标、范围及结果。 |
| 三种 Provider 的状态与预览 | `DeploymentControls`、`ClaudeConnectionControls`、`CodexConnectionControls`、`connection-copy`、共享 `pi-preflight`：去掉重复的技术错误解释，缩短设置与移除说明；保留事件、文件、脱敏声明、独立审核和能力限制。 |
| 设置与关于 | `SettingsView`、`settings.css`：删除重复副标题、过时项目介绍、开关的同义说明和对应失效样式；无说明时不渲染空节点或无效描述引用。 |
| 原生弹窗、菜单及通知 | `configuration-ipc`、`management`、`preferences`、`use-session-notice`、`BubbleStack`、`Toolbar`、`ManagementApp`：选择器改用文件夹等用户用语；Session 改为会话；简短状态和必要错误保留。 |

扫描范围包含 `apps`、`packages` 中的 TS/TSX/HTML 文案来源。`prototype`、`test-support` 为设计/展示辅助，不进入产品包；无引用的旧 `PiPreflightPanel`、`PiConnectionPanel` 也不在当前产品入口中。本轮没有把工程文档或示例说明当成产品文案删除。

## 实际核对

- **原生打包版**：此前完成首页、宠物、收藏、设置、关于、读取授权、手动添加、pi 未连接详情、预览和取消、重命名及移除确认。最终包再次核对渲染/软件/提醒设置及真实保存的 pi 详情。合成配置位于临时隔离目录，未确认扩展/hooks 写入，未启动 Agent 或模型。
- **显示层操作**：使用仓库已有 `management-review.html` 展示入口，逐项打开在线、暂停、重新打开、等待连接，以及 Claude 首次设置/任务反馈、Codex 完整通知预览。它们使用正式组件和合成数据，验证文字与布局，不代表真实宿主上线或恢复通过。
- **静态核对**：其余错误分支、菜单、通知与权限文案检查源码；不做故障注入，不为覆盖文案重做 Provider 生命周期验收。

截图：`native-*.png` 是最终 macOS 包；`online.png`、`paused.png`、`resume.png`、`waiting.png`、`codex-preview.png`、`claude-preview.png`、`claude-upgrade.png` 是展示入口操作。

`node_modules/.bin/tsc --noEmit`、`pnpm package:mac`、`git diff --check` 通过。未新增或运行测试用例。最终 `app.asar` SHA-256：`62452a94e8c5a44f41f80dbaec9cc79f354e6cf23857db084aaecbd64fb48775`。

桌面切换后的电脑工具异常另见 [#22](https://github.com/Gogo-Bytes/agent-pet/issues/22)，本轮只记录。此记录不宣称所有错误均被原生触发，不扩展 #15/#19 的接入结论。

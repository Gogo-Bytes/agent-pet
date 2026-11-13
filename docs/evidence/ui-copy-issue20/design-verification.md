# #20 设计规范与增量验证

2026-11-13；代码基线 `9c6902c`，研究与规范提交 `c6462a3`。此前 README 的截图仅对应此前版本；本文件记录规范落地后的增量。

## 改动与静态检查

- 研究：网络检索并读取 Apple、NN/g、DWP、GOV.UK 六篇一手来源，收录于 `docs/UI-CONTENT-DESIGN.md`；修改前批判见 `design-critique.md`。
- 连接空状态删除按钮复述，加载中仍显示状态。
- Claude 日常能力说明改用原生 details；启用确认仍直接显示能力与限制。有具体 notice 时不再显示泛化正文。
- Codex 在线删除对状态标题的屏幕阅读器重复；有具体 notice 时不再叠加“请查看提示”。
- pi 删除在线、待设置、重新连接时复述状态或按钮的正文；有具体 notice 或设置预览时不再显示泛化正文。保留暂停后果、等待时的 `/reload` 提示及授权信息。
- 删除失效样式；空状态容器通过 `:empty` 不再占据 flex 间距。
- 检查三种 summary 的调用方：仅各自控件及 `ConnectionsView`。父组件继续提供状态标题，接口、业务状态、权限、文件写入和恢复逻辑未改变。

## 环境阻塞及恢复

首次隔离 Electron launch 因显式传入包装器保留的 `--user-data-dir` 被拒绝；按工具契约移除此参数后，遇到全局 `agent-browser 0.33.2` 不兼容。停止重试，没有切换协议或绕过版本检查。

用户明确授权后执行 `npm install -g agent-browser@0.43.0`，未修改项目依赖。原生工具 `--version` 返回 0.43.0；本机已安装的 `pi-agent-browser-doctor` 检查 Node、浏览器 CLI、Pi 和重复来源，全部通过。不需要 reload 即可继续使用。npm 提示未执行 postinstall；没有为此改变全局脚本许可，实际工具已可启动浏览器和 Electron。

## 真实桌面入口

通过包装器启动本次构建的 `apps/desktop/out/main/index.cjs`，使用自动生成的隔离 profile；目标为正式 `out/renderer/management.html`，不是展示 bridge。

- 首页 → 连接：显示“还没有连接”，扫描与手动添加入口可访问；没有复述按钮的副说明。
- 打开手动添加：出现配置文件夹输入、选择位置及禁用的验证按钮。
- Escape 取消：弹窗关闭，焦点回到“手动添加”，仍为空列表。没有选择或读取真实配置文件夹。
- 截图 `design-native-empty.png`，900×680，保存后已核实文件存在和画面。
- 验收后包装器 cleanup 确认进程、调试端口、托管会话及隔离 profile 均已清理。

## 正式组件的显示层核对

使用现有 `management-review.html?case=…` 展示入口，未新增或运行测试用例。场景使用内存示例数据，不证明真实宿主连接、暂停或恢复通过。

| 场景/操作 | 实际结果 |
| --- | --- |
| `claude-task-upgrade` → 连接 → 展开“支持哪些反馈？” | 默认不铺开能力清单；展开后可见仅支持连接/退出、未启用任务动作的限制。 |
| 点击“启用任务反馈” | 确认弹窗仍直接显示目标配置、程序路径、生效要求、撤回说明和不支持项。未点击确认。 |
| Escape 取消预览 | 弹窗消失，焦点回到“启用任务反馈”。 |
| Claude 640×680 窄视口，聚焦 summary 后按 Enter | details 展开，焦点仍在 summary；文档宽度为 640，无页面横向溢出。截图中控件和路径未重叠。 |
| `codex-online` | 详情有“已连接”标题，没有“Codex 已连接。”重复正文。 |
| `codex-error` | 保留具体文件变化/无法读取的错误与重新连接操作，没有泛化正文。 |
| `detail-error`（pi） | 保留具体预览失败、未改文件的说明及设置入口，没有“请查看下方提示”。 |
| `detail-resume`（pi） | 保留重新连接按钮，不再重复解释按钮。 |
| `detail-paused`（pi） | 保留“不关闭 pi、连接文件保留”和继续连接按钮。 |
| `detail-waiting`（pi） | 保留打开 pi 或空闲时 `/reload` 的必要动作。 |

截图 `design-claude-preview.png`、`design-claude-narrow.png` 均已保存并核实画面。窄视口为浏览器显示检查，不代表原生窗口最小尺寸验收。

## 工程检查与边界

`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`git diff --check` 通过。未新增或运行单元、集成及其他测试用例。

未重做真实 Provider 生命周期、Claude 暂停/错误分支、罕见错误故障注入、屏幕阅读器语音及完整打包版验收；这些状态仅检查相关源码，不能扩大显示层结果。没有确认扩展/hooks 写入、启动 Agent/模型或改动日常配置。

本轮是 #20 已有清理后的设计增量，不替代 #15/#19 接入验收。未推送，未更新或关闭线上 Issue；无关的 #15 未跟踪验收文件保持原样。

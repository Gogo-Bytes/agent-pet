# 本机菜单栏图标恢复（2026-10-15）

状态：**VERIFIED（当前 macOS/dev 图标可见，用户确认）**。保留菜单栏功能，没有修改图标或偏好实现，没有打包。正式包重开、图标菜单点击、深浅色、多屏和发布验收不在本次通过范围。

## 原因与恢复

本机 macOS 把开发实例的菜单栏显示与启动它的 ChatGPT 应用关联。系统设置中 Agent Pet 已允许显示，但 ChatGPT 被关闭；仅打开 Agent Pet 自身的开关不能解除系统阻止。用户授权只打开系统设置「菜单栏 → 允许在菜单栏显示 → ChatGPT」，有效则保留、无效恢复。打开后 Electron 项也出现在系统列表中，状态为开启；同代码、同隔离配置的 dev 再次启动后，系统从阻止改为正常接收，用户明确反馈“能看到了”。最终保留 ChatGPT 开启。

已核对的证据：

| 检查 | 结果 |
| --- | --- |
| 修改前系统页面 | Agent Pet=on，ChatGPT=off；没有单列 Electron |
| 修改前 dev PID 56675 | ControlCenter `appStatusItems`：`Starting to track blocked host; (bid:com.github.Electron-Item-0-56675)`，17:30:43.809828 +08:00 |
| 修改前进程来源 | Electron → node/pnpm → zsh → `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT`；因此用户运行命令的那次测试仍不能算独立外部 Terminal 来源 |
| 修改后系统页面 | ChatGPT=on；新增 Electron=on |
| 修改后 dev PID 92254 | `Starting to track host; (bid:com.github.Electron-Item-0-92254)`，17:34:33.201402 +08:00；随后创建并添加菜单栏项，所读日志没有再次进入 blocked |
| 真实可见性 | 用户明确确认图标出现；没有用坐标或图标对象存在代替可见性验收 |

原 dev PID 56675 在切换开关之前已经退出，并非开关导致退出。发现后用原独立配置重新启动 dev，未重启日常正式应用或恢复连接。当前 dev 配置为 `/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-dev-bq99b8uw/profile`，由正常 electron-vite 开发命令运行；它没有日常连接记录，首页空态不代表用户的 pi 离线。

底层 `trackedApplications` 文件读取被 macOS 隐私保护拒绝，用户终端运行只读检查也被拒绝。本次没有改用其他 API 绕过，没有取得或修改内部映射；不声称知道其具体存储内容。其他应用也有相同的关联阻止报告，属于解释线索：[CodexBar 原作者问题记录](https://github.com/steipete/CodexBar/issues/1440)。本机结论以以上实际开关、日志和用户确认共同支持。

## 排除误判与边界

- 图标绘制代码从首次引入以来未改变，早于本轮 UI 迁移的 P1 文档已记录不可见。没有找到最近 UI 引入的新图标回归。
- 原排查曾得到存活图标、非空模板图片和屏内坐标，仍不可见；这些信号不能证明成功。完整性签名比较也没有证明它是原因，不能通过重签、换图片、GUID 或升级 Electron 宣称修复。
- 系统菜单栏 AX/截图检查超时，停止该自动化路径。当前可见性依据为用户反馈；没有宣称原生图标菜单操作或截图验收通过。
- 仅改变了用户授权的 ChatGPT 菜单栏显示开关。没有重置控制中心、结束系统守护进程、扩大隐私权限、注册登录项、安装依赖或改变正式 appId。
- 没有扫描/部署/恢复/重载/退出 pi，没有读取日常 pi 配置或凭据。旧诊断脚本留在明确的临时排查目录，没有进入正式产品代码或包。
- 本轮不关闭宠物尺寸、其他设置实际效果、真实任务矩阵、正式签名/公证或发布验收。

## 验证

- `pnpm typecheck`：通过。
- `pnpm exec vitest run apps/desktop/src/main/index.test.ts apps/desktop/src/main/preferences.test.ts`：**61 passed / 2 files**，是现有代码回归，不代替原生图标证据。
- `pnpm --filter @agent-pet/desktop build`：通过，仅编译代码，没有生成 `.app`。
- `git diff --check`：通过。历史 native smoke fixtures 和已有未完成的设置实机记录原样保留。

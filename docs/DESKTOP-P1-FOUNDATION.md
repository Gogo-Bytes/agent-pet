# P1：桌面管理基础

状态：已实现并通过自动化边界测试、类型检查和构建；**隔离原生实例已启动并列出双页面，但交互验收被浏览器工具阻塞，未打包发布**。本阶段仅 P1，不代表 P2 一键接入已完成。

## 已实现

- 一个 Main / Application / pi Adapter 所有者。启动先获得 Electron 单实例锁，失败的实例不创建窗口、IPC 或 Adapter。
- 普通、不透明、独立 React 管理窗口：默认 **Agent 连接**，另有 **宠物**、**设置**。沿用 React、Lucide、现有颜色 tokens；无新增依赖。
- 管理窗口关闭只隐藏；托盘/菜单栏、应用菜单、Dock activate、second-instance 可重开。全部窗口关闭也保留托盘入口。
- 菜单提供管理窗口、宠物显隐、明确退出。退出等待正在启动的 Adapter 返回 handle，再 await stop，一次清理后真正退出。不会操作 pi 进程。
- 宠物显隐和大小由 Main 管理，在 Electron userData 的 `preferences.json` 保存。默认显示、140 DIP；大小输入为 80–600 整数，实际屏幕布局继续使用既有限制。管理设置和原宠物工具栏缩放使用同一偏好写入口及既有 overlay 布局。
- 只有 `starter.glb` 当前宠物说明，没有假模型库、导入、下载或第二个 Canvas。
- 登录自启默认不注册。只有 packaged macOS 可由用户显式切换，读取系统实际 `openAtLogin` 并校验写后状态；不支持、失败或未应用均明确呈现。开发模式不读取/写入登录项 API。系统登录项是自启状态的权威，不在启动时拿文件偏好覆盖系统设置。

## 安全与持久化边界

- 两个独立 HTML entry、两个独立 sandbox/contextIsolation preload。pet preload 保持不变；管理 preload 只有 getState / updatePreferences / setLogin / subscribe，不提供 IPC 通道参数、文件路径、shell、Session 内容、端点或凭证。
- Main 按预期窗口 webContents、mainFrame 身份、精确入口 URL 校验每次 IPC；跨窗口、子 frame、已导航页面拒绝。导航/重定向/子 frame 导航限制到各自精确入口，新窗口和 webview 均拒绝。
- 偏好带 schemaVersion=1、严格字段/类型/范围校验和 4 KiB 读取上限；拒绝跟随偏好文件 symlink。缺失文件使用默认值而不写；损坏/未知版本回退并提示，保留原文件直到用户再次保存。
- 同目录随机 `wx` 暂存，文件 mode 0600，写入并 fsync 后 rename 发布；失败保留之前内存和磁盘值，清理暂存并显示脱敏错误。宠物工具栏/托盘保存失败会打开管理窗口提示，而不悄悄丢弃错误。
- 这是非秘密、单 Main 写入的基础偏好文件，不是 P2 私有安装/凭证存储。不承诺父目录防竞态、跨用户 ACL 或断电目录耐久性；未进行 directory fsync。崩溃可能留下不读取的随机 `.tmp` 文件，不自动删除未知残留。
- 小型同步写入确保几何仅在持久化成功后应用，无异步写入乱序。相同值无重复落盘；实际缩放操作的磁盘延迟仍需原生体验/性能验收。

## 明确未实现

连接页是**不查询连接的 P1 能力说明**，不展示假在线、假会话数或安装成功。现有环境变量配置的开发 pi 桥接保持原行为；本页不读取或显示配置。未实现 discovery、安装器、私有凭证桥、修复/撤销、Codex/Claude、Agent 执行或真实端点访问。Open Session 仍为既有 unsupported。

P2 需要独立批准和安装/权限/撤销边界实现；P1 不修改真实 Agent 配置或用户登录项。无新增模型，无包签名/公证，无 Windows 发布声明。

## 自动化证据

- `pnpm test`：27 个测试文件、157 项全部通过（主会话修复审查问题后的独立全量复跑）；保留原 pet/Application/Adapter/extension 回归。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过，生成两个 renderer HTML 和两个独立 CJS preload。
- `git diff --check`：通过。

新增/扩展边界测试：

- `main/preferences.test.ts`：真实临时目录、schema/defaults、重启恢复、旧 inode 完整性、mode、symlink、大小上限、非法输入、open/write/fsync/rename 失败注入与清理。新增 FIFO 回归：独立子进程运行实际 store，3 秒 watchdog；修复前 ETIMEDOUT，POSIX 非阻塞 open + fd 类型检查后通过，不改 FIFO。
- 主会话另修复管理窗口在首次 ready-to-show 前关闭后被重新显示的问题，新增 close→延迟 ready→activate 回归。
- `main/index.test.ts`：实际 Main entry + Electron mock；原 overlay/hit 回归、双窗口身份与 URL 权限隔离、单实例失败不启动、关闭隐藏/重开/托盘、持久偏好、显隐恢复不被 ready-to-show 覆盖、写失败不改变几何、开发登录项拒绝、macOS 登录项失败反馈、退出等待 stop/延迟 start。
- `preload/management.test.ts`：真实 preload 暴露面、固定 IPC、事件对象不泄漏、监听清理和失败传播。
- `renderer/management/ManagementApp.test.tsx`：真实 React DOM/键盘/checkbox/range 事件、导航默认值、无假操作或 Canvas、偏好推送与失败反馈、用户显式登录选择与开发禁用。

Electron、登录项和托盘在上述测试中是替身；这些不是原生系统效果证明。测试只写隔离临时目录。没有运行真实 pi、访问真实端点、修改用户配置或启动桌面应用。

## 原生验收尝试与阻塞

用户已允许继续验收。主会话准备了临时启动入口：删除继承的 pi endpoint/token 和 dev URL，仅在工具提供独立 user-data-dir 时加载当前构建；不修改产品入口或实际用户配置。

使用 `agent_browser.electron.launch` 分别指定已安装 Electron 36.9.5 executable 和 `.app`，两次均在启动前被工具拒绝：`Electron launch rejected: target does not have Electron framework evidence.` 没有获得 launchId、页面或截图，不能将它记为应用崩溃或任何原生场景通过。未转而连接/重启用户正在使用的应用，也没有操作登录项。

用户随后批准普通进程方式启动隔离实例。使用 `/tmp/ap-p1-check.36yeug/bootstrap.cjs`，明确 setPath 到临时 userData，删除继承的 pi endpoint/token 与 dev URL，未改真实配置/登录项。启动的 Electron PID=57989，CDP 127.0.0.1:58260；agent_browser connect 成功，tab list 返回管理 management.html 和桌宠 index.html，get url 确认管理入口，进程日志仅见 DevTools listening。

但 snapshot 与显式 open 管理入口均被工具拒绝：`Browser access to local .agent-browser storage is blocked because state files can contain authenticated cookies and storage. Use guarded state commands instead.` 实际目标是本仓库 out/renderer/management.html；原因未确认，未绕过保护。无截图、DOM 操作或托盘证据。

已关闭浏览器连接。SIGTERM 后 3 秒内本次独占 Main 仍存活且端口仍监听；核对启动命令身份后仅对本次 Main SIGKILL，复查 PID 与端口均消失。此为测试资源清理，不是菜单/Cmd-Q 正常退出验收；SIGTERM 不退出的原因未诊断，不据此推断标准退出通过或失败。临时 profile 保留供诊断，不含 pi 凭证或用户状态。以下原生项仍待验收。

## 用户验收失败：关闭后无恢复入口

用户确认宠物仍在、关闭管理窗口后菜单栏与 Dock 均无可辨认入口；截图只阅读定位，未复制入仓库。

隔离原生探针直接启动当前构建，关闭实际管理 BrowserWindow，记录 app.dock.isVisible、Tray.getBounds 与屏幕交集。修复前 Dock=false、tray bounds=(0,1169,32,22)，唯一屏幕为 (0,0,1800,1169)，没有屏内托盘矩形。仅判断 tray 存活/尺寸非零会误报，测试因此加入屏幕交集。最早一次拦截 Electron.Tray 导出没有生效导致空记录，已改为只观察实际 Tray.prototype.setToolTip；不将该空记录作为根因证据。

根因定位：pet 的 setVisibleOnAllWorkspaces 默认会转换 macOS 应用进程类型。只加 skipTransformProcessType:true，隔离实验 Dock 即恢复；正式代码已保留这一选项，避免透明宠物改变整个管理应用的类型。[Electron 官方说明](https://www.electronjs.org/docs/latest/api/base-window#winsetvisibleonallworkspacesvisible-options-macos-linux) 描述其默认进程类型切换行为。当前 regular 应用使用此选项后完整全屏 Space 行为尚待用户回归，不以 isVisibleOnAllWorkspaces=true 代替。

实际 Main 参数回归先红后绿；最终 27 文件 / **158 测试**、typecheck、build、diff-check 均通过。最终探针不修改工作区/图标/窗口策略，仅观察实际构建：关闭管理窗口后 Dock=true，发出 activate 事件后原管理窗口重新显示，petAllWorkspaces=true。

证据：[修复前](evidence/desktop-p1/recovery-entry-before.json)、[修复后](evidence/desktop-p1/recovery-entry-after.json)。探针临时路径 `/tmp/ap-entry-check.VnmvMD/probe.cjs`，无 pi endpoint/token，独立 userData，结束 app.exit；没有重启用户 pi/Pet。没有浏览器 UI 绕过或真实 Dock 点击，activate 是测试触发，待用户确认物理点击。

**未关闭项：托盘报告位置仍在屏外，临时添加文字标题也未改善，不能认定图标是原因。** 此次独立修复恢复 Dock 后备入口，不宣称托盘已修好。开发态 Dock 可能显示 Electron 而非最终 Agent Pet 名称/图标。需用户重启 Pet 后确认 Dock 点击恢复，并回归全屏/多 Space。

## 手工验收清单（工具覆盖不足的项目由用户验收）

- [ ] 在独立 userData 下启动 dev，默认打开管理连接页和宠物；不存在 pi 配置也无致命错误。
- [ ] 管理关闭只隐藏；托盘、菜单、Dock、二次打开恢复同一管理窗口，不创建第二桥接。所有窗口隐藏后仍有恢复入口。
- [ ] 宠物显隐和大小从管理/工具栏互相同步；跨屏与小屏布局不回归；隐藏后 ready/reload 不闪现。退出重开保存状态。
- [ ] 菜单明确退出：窗口、托盘和 Adapter listener 全部释放；不杀 Agent。测试退出发生于 Adapter 正在启动/运行时。
- [ ] 管理键盘、焦点、窗口缩放、窄窗口、减少动态效果与屏幕阅读器体验；原宠物气泡、拖动、缩放、穿透回归。
- [ ] 保存失败/损坏偏好显示明确提示，不假报成功，修复权限后可重试；快速缩放性能可接受。
- [ ] 在单独授权的 packaged macOS 环境中验证登录开关、系统实际状态、失败提示与重启；dev 不注册 Electron。当前没有安装包，不能以 vite build 替代此项。
- [ ] 托盘图标的原生菜单栏可见性、深浅色与高 DPI；macOS 关闭/重开/退出手感。Windows 尚未原生验证。

独立审查认可窗口权限、持久化和生命周期边界，提出 FIFO 阻塞问题及原生覆盖缺口。主会话已修复 FIFO 与延迟 ready 可见性，复跑 test/typecheck/build/diff-check 通过。原生覆盖缺口保持上述待验收状态。

本阶段以独立本地代码提交交付，不推送；提交排除既有未跟踪 P0 设计/证据。此提交代表可自动验证的 P1 基础实现，不代表原生或发布验收完成。

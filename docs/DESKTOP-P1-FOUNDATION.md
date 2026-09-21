# P1：桌面管理基础

状态：已实现并通过自动化边界测试、类型检查和构建；**未启动应用进行原生验收，未打包发布**。本阶段仅 P1，不代表 P2 一键接入已完成。

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

## 待授权后手工验收清单

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

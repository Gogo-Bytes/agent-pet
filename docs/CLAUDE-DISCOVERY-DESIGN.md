# Claude 安装发现与首次接入

2026-10-17：实现、隔离验证及获授权后的本机扫描/已有配置查看完成；不表示其他安装方式已通过连接验收。

## 流程与模块

连接 → 自动扫描 → Claude Code → 一键配置 → 检查并预览 → 原有连接设置确认。Main 自动提供默认配置和程序，不再要求进入隐藏的 NVM 安装目录。多个入口按实际程序路径去重，不同安装可选；已有默认配置直接查看，不重复创建、不切换程序。手动添加仍支持自定义目录。

- `main/claude-discovery.ts` 负责有界 metadata、链接、候选身份与取消；`shared/claude-discovery.ts` 只传非秘密安装事实。
- `pi-preflight-files.ts` 复用路径/NVM 发现预算，增加命令参数；Claude 不复用 pi 的版本契约。
- `configuration-ipc.ts` 校验可信窗口、取得扫描范围同意、按请求取消、重新核对 Main 候选 ID，再准备默认目标。Renderer 不提交程序路径或任意默认目标。
- `Configurations.previewDetectedClaude` → `ClaudeNormalPresence.preview` 跳过程序 picker，进入原有精确预览；确认和恢复仍重新检查程序，真实进程归属校验不变。
- `ConnectionsView` / `DetectedClaudeResult` / `DetectedSetupDialog` 分别呈现可接入和待验证，保留返回、取消、手动入口与原有写入确认。

扫描最多 32 项 GUI PATH、三个固定入口、NVM 一层最多 64 项/16 个版本，每份 package.json 最多 64 KiB、链接最多 8 次，受共享操作预算/3 秒期限约束。不执行程序、不递归 HOME、不读 shell、Claude 配置或凭据。准备前另展示默认目录/settings 的只读范围，确认前不部署。原设置、hooks、选择性撤回和不确定文件保留复用原实现。

取消传到 Main 并清候选，旧取消不影响新扫描；Claude 扫描先完成而组合页仍等待 pi 时也能取消。已发出的 OS 请求不能强制中断，返回后不继续读取/发布，其间保留单次读取保护。

## 安装方式与兼容性

| 安装线索 | 当前发现依据 | 当前连接范围 |
| --- | --- | --- |
| npm / NVM 原生布局 | 安全包 metadata、名称/版本/bin 声明 | 仅已实测 npm 2.1.301 |
| 官方安装 versions 目录 | 路径线索，目录名不作为版本证据 | 待验证，禁用接入 |
| Homebrew stable/latest Caskroom | 路径线索 | 待验证，禁用接入 |
| 旧 npm cli.js / 未知版本或入口 | 能核对包时显示版本，否则未知 | 不启用，不认领任意 Node 进程 |

[官方安装文档](https://code.claude.com/docs/en/setup)确认：目前 npm 使用与官方安装相同的原生程序；官方安装管理 `~/.local/bin/claude` 与版本目录；Homebrew 提供 stable/latest cask。macOS 有程序签名，发行版本另有签名校验清单。后续以来源校验、确切版本及该版本 hook/PID 验证扩展兼容，不能凭路径、文件名或一个有效签名单独宣称兼容。本轮没有下载或安装另一份 Claude。

GUI 发现不代表终端 PATH 已修复。本轮不改 shell、不将固定 NVM bin 提到 PATH 前面，不创建可能和官方安装器冲突的启动入口。下一阶段先核对用户级入口，再提供无冲突链接或安装迁移预览。自动更新改变路径/版本后仍须重新确认，不自动接纳新程序。

## 验证与限制

- 相关 118 项通过；最后的小幅 UI 调整后管理页/Claude 控件 48 项再次通过。独立审查发现取消只停页面的问题，修复后独立 63 项复查通过，无新的确定问题。
- `pnpm test --maxWorkers=1` 最终 1032 passed / 1 skipped / 92 files。首次原 launcher-entry 的 READY 等待超时，保留期限/guard，原文件 5 项复验及唯一一次完整复验通过，不宣称历史超时已修复。
- `pnpm typecheck`、项目原目录 `pnpm --filter @agent-pet/desktop build` 通过；没有制作安装包。临时构建副本因 node_modules/task-state 链接被 pnpm 拒绝，一次目录修正后仍拒绝子目录，停止该副本方案，未放宽校验。副本 pnpm 自动依赖检查报告 Already up to date，没有新增/升级依赖或修改项目锁文件。
- 自建 HOME/userData 启动正式 Electron/Main/preload/Renderer，bootstrap 在测试边界排除宿主固定安装目录。确认启动和原生扫描授权入口；CUA 原生内容滞后，未据其旧画面宣称 Electron 全流程通过。
- 已实际操作同一正式 React 页的浏览器测试边界：安装选择 → 只读确认 → 原设置预览 → 取消 → 已有配置查看；420×640 窄窗口页面宽度 420、首次选择器宽 330，无横向页面溢出。合成数据，不是真实扫描/连接；doubles 不进入 Electron 入口。
- 原型认可、正式 React 隔离验证、此前真实 Claude 普通启动/首页证据分别记录。本机扫描后来已获授权，实际发现 npm Claude 2.1.301 一处和 pi 0.85.1 两处，已有默认配置复用通过；原 UUID/路径和两条记录保留，未重新配置。pi 扫描 complete，Claude 受限，没有宣称完整覆盖。执行记录与正式 Electron 实际截图见 [本机检查结果](CLAUDE-DISCOVERY-CHECK-PREVIEW.md)。终端入口、其他安装方式真实加载、任务动作、桌面宿主和发布仍未验收。

截图与隔离 bootstrap/profile：`/private/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-discovery-ui-ssrrkfix`，含 `scan-react-isolated.png`、`preview-react-isolated.png`、`narrow-new-react-isolated.png`。均为正式 React 代码，不是旧 prototype；数据为示例。

浏览器测试入口：`pnpm exec vite --config apps/desktop/vite.management-review.config.ts`，打开 `/management-review.html?case=claude-scan-multiple`。正常开发入口仍为 `pnpm --filter @agent-pet/desktop dev`；测试 bootstrap 不能用于日常接入。实际接入历史见 [Claude 验收](CLAUDE-CLI-ACCEPTANCE.md)。

# Codex CLI 自动扫描只读验收

## 范围与授权

用户在本轮只读预览后确认“继续”。仅检查当前用户安装入口、程序链接、安全 metadata，以及必要的 package metadata；不启动 Codex、不请求模型、不读取配置正文、凭据、会话、对话或 hooks，不改文件、不重启现有 dev。允许的自有临时验证产物与工程证据不属于日常 Agent 配置写入。

实际 HOME 为 `/Users/gan`，当前进程未设置 `CODEX_HOME`，因此目标为 `/Users/gan/.codex`。使用当前进程 PATH、固定 `.local/bin`、Homebrew/`/usr/local/bin`、NVM 一层和目标 `packages/standalone/current` 的两个固定入口；限制沿用正式 `ReadBudget`，不递归搜索 HOME。

## 执行与结果

通过现有 Vite 将正式 `codex-discovery.ts` 与 `pi-preflight-files.ts` 编译到新建临时目录，再由 Node 调用 `CodexDiscovery.detect()`；未运行 Electron、Codex 或其后台程序。测试封装统计 metadata 调用，并限制 JSON 读取只能是 `package.json`。

- `notice: none`，`scan: limited`，耗时约 5ms。
- 找到一处去重后的安装：`/Users/gan/.local/bin/codex`。
- 解析程序：`/Users/gan/.codex/packages/standalone/releases/0.163.0-aarch64-apple-darwin/bin/codex`。
- 来源：standalone；布局兼容：verified；`version: null`。目录名不是本轮二进制执行版本证明，未执行 `--version`。
- 默认配置路径：`/Users/gan/.codex`；未读取目标配置内容。
- 扫描完成后的候选可用于后续预览；`invalidate()` 后候选失效检查通过。未调用 prepare/preview/confirm。
- 共 151 次 metadata 调用、0 次 JSON 正文读取、0 次捕获到的 metadata API 异常。
- `limited` 的具体触发候选未在本轮定位；没有扩大扫描范围或放宽安全检查。不能宣称整机完整覆盖。

本机原始摘要及自有编译产物保留在：
`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-codex-readonly-5UUc5w/result.json`。
临时文件可能被系统清理，本页保留可恢复的结果摘要。

## 验证与准确边界

- `pnpm test apps/desktop/src/main/codex-discovery.test.ts apps/desktop/src/main/claude-discovery.test.ts apps/desktop/src/main/configuration-ipc.test.ts --maxWorkers=1`：40 passed / 3 files。
- `pnpm typecheck`：通过。
- 既有实现提交 `b7c821e` 的完整复验为 1332 passed / 1 skipped，源码 build 通过；本轮未重新构建、打包或推送。

**VERIFIED：本机正式扫描模块的有界只读发现与候选撤销。** 不等于原生 Electron 扫描界面、一键配置、hooks 部署、在线连接或任务/动画验收。此前日常连接证据保持原范围。

## 正式 Renderer 隔离验收

使用正式 React Renderer 的 management review 页面和自有 `codex-scan-new` 示例数据，未启动 Electron Main、Codex 或真实配置操作。检查 1280×720 页面：

- 连接页→自动扫描显示 Codex CLI 卡片。
- 两处安装详情默认折叠，展开后正确区分“独立安装/可接入”和“npm 0.163.0/待验证”。
- 一键配置打开 Codex 专用检查对话框，路径显示为示例 `.codex`，未混入真实路径或秘密。
- 检查范围默认折叠，取消按钮和右上角取消均可关闭；没有调用部署、确认或真实文件操作。
- 截图证据：`/tmp/agent-pet-codex-scan.png`、`/tmp/agent-pet-codex-setup-dialog.png`（临时产物，不提交）。

本范围 **VERIFIED：正式 Renderer 的示例数据布局、安装详情展开、Codex 检查对话框与取消交互**。不等于真实 Electron 原生窗口、真实 Main IPC、hooks.json 读取、部署、Codex 审核或在线连接通过。

## 真实目标只读配置预览

用户随后同意进入只读预览，精确目标为 `/Users/gan/.codex`，只读取 `/Users/gan/.codex/hooks.json`、目标祖先目录 metadata，以及固定 standalone CLI/host metadata。未执行 `apply`、`confirm`、Codex 或任务。

- `hooks.json` 已存在。
- hooks 结构与安全检查通过，`canApply: true`。
- 既有 hooks 保留；预览算法只准备追加式变更，不覆盖原文件。由于现有事件数组均已存在，内部 ownership 的 `createdEvents` 为 0；这不是“没有 10 个事件”，而是后续会向已有事件数组追加自有条目。
- CLI 与 host metadata 核对通过，布局为 standalone 0.163.0。
- 写入：false；启动 Codex：false；启动任务：false；确认部署：false。
- 摘要脚本编译产物位于临时目录 `/tmp/agent-pet-codex-preview-ASzDdC`，只保留脱敏 `result.json`，不会提交。

本范围 **VERIFIED：真实日常 Codex 目标的只读 hooks 预览与程序 metadata 核对**。仍不等于用户授权部署、原生 `/hooks` 审核、在线连接或任务验收。后续若执行追加，必须再次展示精确文件/条目预览，并单独确认写入与撤回范围。

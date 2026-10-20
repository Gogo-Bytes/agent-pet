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

下一步先补正式 Renderer 的 Codex 扫描结果、多安装/未验证安装与已有配置查看的视觉/交互验证，使用自有示例数据、不改日常配置。真实“一键配置”会读取 hooks.json 及固定后台入口 metadata，超出本轮授权；执行前必须另列精确读取范围。现有已配置目标优先查看原记录，不能为验收重复部署或撤回原 hooks。

# Issue #15 有界验收证据归档

本记录保存 2026-11-11 的事实，不复制动态待办表。任务状态以 [Issue #15](https://github.com/Gogo-Bytes/agent-pet/issues/15) 和 [Issue #19](https://github.com/Gogo-Bytes/agent-pet/issues/19) 为准；归档不等于关闭、推送或发布授权。

## 来源与版本

验收执行者为用户委派的 Codex 会话，环境为 macOS arm64。pi/Claude 本轮产品提交为 `f9e4ce5cebd337f685ed314502c0d95b0cc36b8f`，宿主分别为 pi 0.85.1、Claude Code 2.1.301。

- [总报告](https://github.com/Gogo-Bytes/agent-pet/issues/15#issuecomment-6797092300)：记录核对了隔离副本 392 个跟踪文件及 17 个产物；原始 pi/Claude/Codex 提交独立审查无新增阻塞发现。Codex 历史缺口由后续提交修复，不用原审查掩盖缺口。
- [pi 双配置](https://github.com/Gogo-Bytes/agent-pet/issues/15#issuecomment-6795048867)。
- [Claude 双宿主](https://github.com/Gogo-Bytes/agent-pet/issues/15#issuecomment-6796825774)。
- [Codex 分版本记录](../codex-issue19-2d4de76/README.md)：C2–C10 对应 `2d4de76`；标注复验对应 `b522448`，不一律归到最新 HEAD。

本归档者重新读取线上记录、本地 `/private/tmp/ap15-closure-01/result.json` 和两份测试日志，核验其中 8 个截图/辅助功能树文件哈希，查看并保存下列两张截图。没有重新运行宿主、测试或原生验收；双配置/双宿主的完整现场没有再次逐文件复核。

## 原生与自动化分开判断

| 范围 | 已取得的原生证据 | 自动化与未测边界 |
| --- | --- | --- |
| pi 双配置 | A 上线不影响 B；A/B 同时在线后，退出 A 时 B 保持在线，退出 B 后各自等待重连。选择性撤回 A 不改变 B 扩展哈希；撤回 B 后扩展移除，保留宿主新增的合成设置。 | 两个 TUI 身份不同，不能证明同一身份旧 peer 乱序。 |
| pi 同身份旧连接 | 无确定性 TUI 乱序复现。 | Unix socket 集成测试覆盖迟到 metadata/companion、旧连接关闭、当前工作及其他配置保留；4 项隔离补验覆盖已存在成功/错误未读结果的保持。这是集成测试，不是原生 TUI 通过。 |
| Claude 双宿主 | A 上线、B 上线；A 定向 SIGINT 退出后仍已连接；B SIGINT 退出后等待启动。 | Ctrl-D 未触发退出；通过范围是 SIGINT。内部回调异常、重入和计时器清理由自动化覆盖。 |
| Claude 同宿主 Session 替换 | 同一 PID、启动时间、程序路径下，在空会话执行一次本地 `/clear`，宿主 Session 标识摘要变化，管理页前后已连接；SIGINT 后会话登记消失、管理页等待启动。 | UI 连续在线不独自证明内部旧 Session 退役。该内部行为与异常清理依赖自动化断言；无模型任务反馈验收。 |
| Codex | 详细预览、取消重试、自定义目标、陈旧计划拒绝、部署、重启和选择性撤回；标注另有原生复验。 | 一般 I/O 故障、初始化后并发变化停止观察及禁用材料保留仍原生未测；原生 `/hooks` 只验证产品提示，未启动 Codex。 |

## 本地交叉证据

`/private/tmp/ap15-closure-01/result.json` 记录：同宿主为 true、Session 已变化；宿主和桌面退出码均为 0；7 个记录身份无残留，TCP 与 Unix socket 消失，会话登记文件移除，hooks 设置哈希保持；85 个文件扫描中 token/API 地址原文字面匹配数为 0。这是该次执行报告，不是对当前全机状态的重新检查，也不构成全面秘密检测保证。

- [替换 Session 后仍已连接](A-after-clear.jpg)。
- [宿主退出后等待启动](after-host-exit.jpg)。
- [8 个原始文件哈希](native-files.sha256)：仅上述两张图复制入仓库，其余文件名相对于原临时现场。哈希不能恢复缺失文件。

前后已连接画面的图片哈希相同，等待启动画面亦相同；不能靠相同截图证明 Session 变化，变化证据来自宿主身份及 Session 摘要交叉核对。没有归档原 Session 标识、PID、凭据、配置地址或原始 hooks。

本地日志核对结果：

- `regression.log`：7 个仓库测试文件，138/138 passed。
- `pi-unread.log`：当时 4/4 passed，运行于隔离 `pi-check`。后续已将这四个场景并入仓库 `apps/desktop/src/main/configurations-socket.test.ts`，复用真实 socket、双配置和 Application/Home 链路；先建立成功/错误未读，再发送旧 peer 的 metadata/companion 并关闭旧连接，比较 Session、气泡、Home 和配置连接提示，避免覆盖随临时目录消失。
- 后续测试归档阶段实际执行 `node_modules/.bin/vitest run apps/desktop/src/main/configurations-socket.test.ts packages/adapter-pi/src/connections.test.ts integrations/claude-hooks/observations.test.ts apps/desktop/src/main/codex-connection.test.ts apps/desktop/src/main/configuration-ipc.test.ts apps/desktop/src/renderer/management/CodexConnectionControls.test.tsx --maxWorkers=1`：6 文件、107/107 passed；`node_modules/.bin/tsc --noEmit` 和桌面 `electron-vite build` 通过。未重跑全量或原生验收，没有改变产品运行代码，不能将新增集成覆盖写成 TUI 原生通过。

## 权限与收尾边界

Claude 原生验收报告记录了另外批准的隔离 API 配置、两个工作目录的原生信任及必要祖先元数据读取；网络限制为本轮本机观察器，未调用模型。它们是执行者当时的有界授权，不授权后续访问凭据、复用环境、批准信任或扩大网络。历史启动/文件选择问题及最终绕行由报告保留，不视作已证明的产品修复。

仍需由任务所有者明确接受或安排后续工作的边界：

1. pi 同身份乱序的确定性原生 TUI 触发；不能从双配置通过推导通过。
2. Codex 一般 I/O 与初始化后并发改动的原生故障路径。
3. Codex 同路径程序 inode 未绑定、路径检查非原子 CAS等既有能力限制。

此前 `darwin-files-port.test.ts:455` 间歇 `path-changed` 没有修复证据。没有通过归档修改 Issue 验收标准或把未测项勾选完成；未知/不确定材料继续保留。临时证据可能过期，后续定位原件需重新核实路径，不自动启动旧脚本。

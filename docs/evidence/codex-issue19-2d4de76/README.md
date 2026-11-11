# Issue #19 Codex 隔离原生复验证据

本记录归档 2026-11-11 的验收事实，不是动态任务状态。状态仍以 [#19](https://github.com/Gogo-Bytes/agent-pet/issues/19) 与 [#15](https://github.com/Gogo-Bytes/agent-pet/issues/15) 为准。

## 版本、来源和结论

- 被测产品：`2d4de764f3caa6fe5dadbc206f27fff880db2971`，macOS 26.1、Electron 36.9.5。
- 当时工作区 HEAD `558fb1eec48a200d65191be5299ec4befdf1a986` 只多验收操作文档，不是另一个产品构建。
- 原生执行者：用户委派的 Codex 验收会话，使用原生管理窗口与合成配置。本归档者读取两阶段报告、核验全部 22 张截图 SHA-256，并抽查 C2/C6 图像；没有重新执行原生流程。
- 线上结果：[完整子范围](https://github.com/Gogo-Bytes/agent-pet/issues/19#issuecomment-6792030060)、[#15 Codex 更新](https://github.com/Gogo-Bytes/agent-pet/issues/15#issuecomment-6792037835)。
- 结论：最初的 C2 预览明细缺失、C6 目标变化提示不准确已通过有界原生复验。不是所有故障路径、所有 Provider 或真实会话验收通过。

## 逐项结果

| 场景 | 结果与证据范围 |
| --- | --- |
| C2 | 预览显示目标、10 个事件、command 类型、脱敏命令及 timeout 2，说明不是完整可执行命令；未显示合成私人标记。预览与取消后目标字节不变，没有新增私有注册/运行材料。授权前读取顺序仅由 UI 与源码交叉核对，未做系统调用跟踪。 |
| C3/C4 | 取消后复用有效扫描；已有未配置记录可继续授权预览，无程序文件选择器。 |
| C5 | 自定义目标的授权、预览和安装指向所选目录，不回退默认目标。发现扫描卡片可访问名称误含“默认配置”，见下方后续修复。 |
| C6 | 预览后分别替换目录、同字节替换 hooks，新旧目标保持；确认拒绝并要求重新扫描，旧预览失效。操作前后身份/哈希及目录清单未发现新增私有材料。未知 pending 保留，预览不可确认。 |
| C7 | 单独授权后追加 10 组通知，保留原有 hook 和合成配置；未读取真实登录信息。 |
| C8 | 冷启动恢复“等待活动”，hooks 哈希不变，不重复安装。 |
| C9 | 产品显示原生 `/hooks` 独立审核提示；未实际启动 Codex 或批准信任。 |
| C10 | 修改一条测试 hook 后移除被拒，文件/记录保留；核对完整哈希后仅还原测试字节，再由产品撤回完整自有条目，hooks 逐字节恢复到安装前。私有运行/注册材料保留。 |
| 停机 | 报告记录两次退出码均为 0，两组各 5 个进程身份退出，按独立 bundle 路径复查无本轮残留。本归档未重做实时进程检查。 |

## 截图及留存范围

仅归档已查看且不含凭据、私人命令或本机用户名的两张关键截图：

- [C2 脱敏结构及信任说明](c2-redacted-preview.jpg)：原文件 `r5-c2-structure.jpg`。
- [C6 拒绝旧计划并要求重新扫描](c6-rescan-required.jpg)：原文件 `r5-c6-dir-refused.jpg`。图中路径是合成临时目标。

[native-phase1.sha256](native-phase1.sha256) 与 [native-phase2.sha256](native-phase2.sha256) 保留全部 22 张原生截图的原文件名和哈希索引；其中 `screenshots/...` 相对于下述原现场，不是本仓库路径。其余 20 张没有复制入仓库，哈希索引不能恢复图片。

原现场：`/private/tmp/agent-pet-issue19-2d4de76/run-02/`。

- 写入前报告：`logs/cua-session-oddd2e8p/result.md`。
- 写入/重启/撤回报告：`logs/cua-session-_6yinhup/result.md`，覆盖前报告中“等待批准/仍在运行”的临时状态。
- 图片：`screenshots/`；各阶段日志包含文件对比和停机身份记录。

临时现场可能过期。未复制原始 hooks、activation、注册材料、凭据或整份运行目录；未知 pending、C6 保留目录与其他不确定材料不得因归档而删除。

## 标注修复及验证边界

后续提交 `b522448` 将共享 CLI 扫描卡片的可访问名称改为“Codex CLI 扫描结果”/“Claude Code 扫描结果”，不修改路径或连接逻辑。

- 自定义目标回归先失败，修复后通过，保留授权/预览指向自定义目录的断言。
- `node_modules/.bin/vitest run apps/desktop/src/renderer/management/CodexConnectionControls.test.tsx apps/desktop/src/renderer/management/ClaudeConnectionControls.test.tsx apps/desktop/src/renderer/management/ManagementApp.test.tsx apps/desktop/src/main/configuration-ipc.test.ts apps/desktop/src/main/codex-connection.test.ts --maxWorkers=1`：122 passed / 5 files。
- `node_modules/.bin/tsc --noEmit`：通过。
- `cd apps/desktop && ../../node_modules/.bin/electron-vite build`：通过。
- 本轮未重跑全量；`2d4de76` 的历史全量结果为 1613 passed / 1 skipped，不能写成标注修复后的重跑结果。
- **标注修复后的原生可访问名称与截图仍待复验**，旧截图保留其原始版本，不能替代新版本验收。

## 未测与既有限制

一般 I/O 故障分类、初始化后并发变化时停止观察及禁用材料保留，没有确定的原生复现；自动化覆盖不能冒充原生通过。未启动 Codex、模型或真实会话，未验收 pi、Claude。

程序仍只有路径/layout 重验，不绑定同路径替换的 inode；路径检查不是原子 CAS。此前 `darwin-files-port.test.ts:455` 的间歇 `path-changed` 未取得修复证据。归档和代码提交均不构成关闭 Issue、推送或发布授权。

# pi 包规则与取消等待修复 · 2026-10-15

本轮用户要求保留原 pi 配置、解决部署误阻止和取消后禁用。用户精确批准只读检查后，对 [具体部署预览](PI-DAILY-CONNECTION-PREVIEW.md) 选择“只更新修复，暂不部署”。交付范围据此收缩为实现、隔离验证、正式应用更新和只读验证；日常部署/通信验收保持未完成。

## 根因与实现

本机只读摘要：`packages` 是 5 条字符串来源，顶层 `extensions` 未设置，没有根 manifest、固定根入口、ignore 或 `agent-pet.ts`。不输出来源、其他设置或凭据，不读取 auth/Session。旧检查把任意非空包列表当成扩展过滤规则，因此误报。此前已授权的 pi 0.85.1 源码 `dist/core/package-manager.js` 中，`resolve()` 先解析包，再独立调用 `addAutoDiscoveredResources()`；用户自动发现的扩展仅应用顶层 extensions overrides。字符串包来源不等于禁用用户默认扩展。

检查器现在接受最多 128 条、每条 1–4096 字符、无控制字符/override 前缀的字符串包来源；不解析、执行、安装或修改包。非空顶层 extensions、未知包对象/格式、ignore、manifest、符号链接、权限与所有权保护继续拒绝。自动入口仍需已识别的支持版本；检查函数本身不宣称检测正在运行的 pi 版本。原 settings 字节、metadata 和配置都不写。

旧一键流程把整个 IPC 和全局 busy 绑定在原生 `showMessageBox()` Promise 上。该 Promise 不结束时，窗口失效只改 generation，不能释放回复或按钮。现在用已有 React `Dialog` 展示 Main 固定路径的检查范围，明确同意后才发送请求；不再等待原生弹窗回调。任意 Renderer 路径仍不能成为快速流程目标，其他手动原生批准入口未放宽。

每次请求带独立 requestId；Main 增加 `cancelDetected`、AbortSignal、3 秒预算和回复 race，Renderer 有独立的取消 race。关闭、Escape、导航、超时可释放等待；取消失败可见提示。底层 OS 文件读取不能强制终止，直到实际结束仍保持单飞；迟到结果不能新增部署、跳页或误杀新计划。完成/进行中的撤销均比较 requestId 和 planId，不能按配置 id 取消较新的预览。Dialog 在 opener 重新启用后恢复焦点。

## 回归证据

初始反馈命令：`pnpm test apps/desktop/src/main/pi-preflight-files.test.ts apps/desktop/src/main/configuration-ipc.test.ts`。原实现 **2 failed / 46 passed**：字符串包来源错误返回 `settings-unknown`；未结束的原生批准在 invalidate 后仍悬挂。新实现重点 **113 passed / 4 files**；全量 **671 passed / 1 skipped / 67 files**，`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`pnpm package:mac` 通过。独立只读审查 READY，**116 项 / 6 文件** 通过。

隔离验证包括：五条合成包来源下预览/部署/选择性撤回不改 settings 字节、inode、mode、mtime、ctime；未知/禁用规则仍阻止；真实临时文件的保存与读取失败保护；Main IO 永不返回时取消/超时及时结束、晚结果不发布；旧工作和迟到取消不撤销新预览；Renderer IPC 不结束时取消立即启用按钮、回焦且不接受晚结果。既有 managed、数据保留和撤回测试未删除。

已按授权对实际 `/Users/gan/.pi/agent` 运行新检查器，结果 `findings: []`，settings SHA-256 与最初只读检查相同。只保存校验摘要到自有临时记录，不复制原配置正文。此结果证明本次误阻止已消除，不证明扩展已部署或 pi 已在线。

## 正式应用检查与范围

最终未签名 arm64 包更新到 `/Users/gan/Desktop/🥷/Agent Pet.app`。旧版正常退出，可从 `/Users/gan/.Trash/AgentPet-rules-cancel-backup-20261015-89bcdfcf/previous-Agent Pet.app` 恢复。Main 启动新建隔离 app-data profile 的实际包，原生 AX 确认 `app.asar/out/renderer/management.html`、零配置状态、一键扫描和新页面内检查 Dialog。虽然进程提供了隔离 HOME，Electron 的 `app.getPath('home')` 仍为实际用户 HOME，因此未在界面批准检查或部署；此前实际目标的只读检查使用已授权的有界函数完成。

执行取消后工具提示界面变化，重新读原生 AX 确认已回扫描结果，“一键配置”“重新扫描”“手动添加”均无 disabled；未向 Main 发送检查/部署确认。正在读取时的取消由上面的可控延迟回归覆盖，不把快速实机操作当作悬挂 IO 全矩阵验证。原生截图产生错误窗口范围；一次重新绑定/前置恢复遇 ScreenCaptureKit `-3811` 后停止捕获，坏图不留作证据，不拿旧版/原型截图替代。保留实际 AX 与自动化覆盖边界。

日志：`/tmp/agent-pet-rules-cancel-{red,focused,tests,types,build,package}.log`；隔离运行记录为 `/tmp/agent-pet-rules-cancel-native.json`。未安装依赖，未启动/重载 pi，未发起模型请求，未创建日常扩展、接收凭据或 socket。历史 native smoke fixtures 原样保留。正式 UI 用户认可、日常 pi 通信和发布验收仍未通过。

隔离检查正常退出，已重新打开稳定包的正常用户 profile。自有隔离 profile 没有保存 configurations.json；最终实际 settings 摘要仍一致，`/Users/gan/.pi/agent/extensions/agent-pet.ts` 仍不存在。没有将隔离 profile 留作用户默认启动参数。原生工具在最后恢复页面导航时状态不可靠，不追加重试；不把该范围计为整页导航再验通过。

# #17 工作区停点

## 状态与范围

分支：`feat/17-animation-transitions`，基线 `69da2e0`。本文件随代码阶段本地提交，未推送；效果待用户验收，不能报告完整功能已验收。#17 本轮进度尚未写入 GitHub；此前的整理授权未扩展为持续线上进度写入授权。

工作区已有的 `docs/FRONTEND-FUNCTIONAL-SPEC.md` 删除及未跟踪 `docs/evidence/codex-issue15-acceptance-5b3a8ff.md` 均保留，未纳入本任务。

## 已写入工作区

- manifest schema 3：仅 idle/working/dragging 接受 `{ in?, loop, out? }`；无版本/schema 2 的字符串/null 继续兼容。保留名称与字段校验、主体缺失回退；不增加资源预算。
- 共享播放器维护 in/loop/out/once、最终映射身份和最新目标，保留完成姿态及零时间采样；完成回调按动作与代次隔离。
- 桌面拖动的正常释放与硬取消分别传递；首页和试播沿用同一播放器。隐藏/减少动画不依赖过场完成回调。
- 作者模板、格式说明、设计文档及传递类型同步。没有新增 IPC、依赖或 Provider 信号。

以上列出代码实现范围，不是全部场景的运行验收结论。

## 工程检查

以下命令在最后一次代码修改后通过：

```sh
node scripts/generate-pet-templates.mjs --check
node_modules/.bin/tsc --noEmit
(cd apps/desktop && ../../node_modules/.bin/electron-vite build)
git diff --check
```

未新增或运行单元、集成或其他测试用例。后续真实导入及有界试播结果见下文；工程检查不替代未覆盖的业务验收。

## 原生入口阻塞

尝试用 `agent_browser_electron.launch` 启动仓库自带 Electron 和 `apps/desktop/out/main/index.cjs`：

1. 指定临时 `--user-data-dir` 被工具拒绝：该标志由工具管理。
2. 核对工具文档说明后移除标志，使用工具自动隔离配置进行一次复验；仍在启动校验阶段失败：`target does not have the required Electron runtime and app payload evidence`。

两次均为 validation-error，未返回 launchId 或成功启动证据。未切换启动协议或反复尝试；未操作用户模型、已安装宠物、绑定、Agent 配置或模型请求。

## 本轮恢复：打包入口已可用，等待原生文件选择

只读核查确认：上轮传入的 `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` 实际不存在，dist 仅剩许可证文件，并非已证实的工具误判。本机存在 Electron 36.9.5 缓存压缩包。

使用既有 electron-builder 构建临时包（禁用证书自动发现，不改依赖、不替换已安装应用）：

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false AGENT_PET_BUILD_DIR=/tmp/agent-pet-issue17-build.uJZdRz node_modules/.bin/electron-builder --config apps/desktop/electron-builder.config.mjs --mac --arm64 --dir --publish never
```

构建退出 0；app.asar SHA-256：`37fa7eb087d9905bc4945bd57c86ab674a832e27f3e2e4902a6a5bd6e1742d17`。同一 `agent_browser_electron.launch` 工具已接受并启动临时包，未绕过启动校验。

- 应用：`/tmp/agent-pet-issue17-build.uJZdRz/mac-arm64/Agent Pet.app`。
- launchId：`electron-c045af10-aec4-49c9-9f3b-24ab6d1cd460`，PID 51522，工具自建隔离 profile；恢复时重新 probe，不仅凭 PID 操作。
- 原生管理页已实际进入宠物 → 收藏 → 添加宠物 → 选择文件夹。页面当前显示禁用的“正在读取…”，文件选择请求尚未返回。
- 临时待导入目录：`/tmp/agent-pet-issue17-assets/staged`。仅包含仓库自带 CC0 starter.glb 的副本和 schema 3 manifest；idle/working/dragging 显式引用既有 Idle/Work/Success/Error clips，不含用户素材。模型 SHA-256：`650f235326f341cf474bca3d59c71c22cd5ff44ce1f4351bebaf217b18640c7a`。
- 尝试只读查询该 PID 的原生窗口时，System Events 返回 `osascript 不允许辅助访问 (-1728)`。这是权限边界，未申请或修改系统权限，未改用其他工具绕过。

用户随后完成目录选择。重新 probe 确认原 launchId/PID/调试入口仍有效，产品显示 `stage-review` 导入预览；点击“确认导入”后，收藏出现 stage-review。通过实际 `window.management.petAssets.getState()` 只读回查，确认 schemaVersion 3、三个阶段对象及字符串映射均完整保留，未被导入链路丢弃；importedAt 为 `2026-11-16T09:05:44.900Z`。

当前仍未验证阶段播放：宠物页截图没有模型，实测 `document.visibilityState === 'hidden'`，`document.hasFocus() === true`。工具选择同一 t1 后仍为 hidden；没有据此认定播放器缺陷，也未覆盖 visibility 或关闭隐藏保护。截图 `/tmp/agent-pet-issue17-imported.png` 已核实保存。等待用户将本轮临时应用窗口切到当前桌面并保持可见后继续。应用保留打开；结束后由工具按 launchId 清理其自有进程/profile，临时构建与素材保留为显式产物。

## 本轮可见窗口下的业务操作

用户再次要求继续后，原 launchId 仍存活；实测 visibility 为 visible，截图已显示 CC0 模型。通过真实动作选择器操作了 idle → working → idle，保留录屏并用 ffmpeg 抽取局部帧检查：

- 第一段 `/tmp/agent-pet-issue17-transitions.webm` 已成功停止并核实存在（1,859,836 bytes），回执 `/tmp/agent-pet-issue17-recording-receipt.json`。
- 录屏中可见空闲低幅运动、切到工作后的横向循环，以及返回空闲时连续两段上跳过场，随后恢复低幅空闲运动；与配置的 working.out=Success、idle.in=Success、idle.loop=Idle 一致。未观察到在随后空闲循环中重复上跳。
- 可见模型截图 `/tmp/agent-pet-issue17-visible.png`；抽帧 `/tmp/agent-pet-issue17-idle-working.png`、`/tmp/agent-pet-issue17-working-idle.png` 和总览 `/tmp/agent-pet-issue17-contact.png`。短 Error 过场及完成帧的精确连续性没有充分逐帧证据，不勾选该专项验收。
- 第二段通过动作菜单发出了工作→错误、被拖动→空闲操作，快照显示相应选择值。未使用真实 Agent 或真实窗口拖动。
- 第二段 `/tmp/agent-pet-issue17-interruptions.webm` 已停止并核实存在，但回执仅报告 capturedFrames=2；不能据此确认快速中断、dragging 过场或动作不排队。按钮文字变化也不能替代动画证据。
- 切回内置宠物后页面显示 1/2，但截图没有模型；再次实测 visibility=hidden。没有把这次截图当作旧包兼容失败或成功。工具 errors 返回无页面错误，仍不等于播放验收通过。

原始素材未变，导入和偏好变更仅在工具的临时 profile。没有新增产品代码修改；本轮未形成可完整验收的工程阶段，仍不提交。录制已全部停止，应用暂保留以接续；不要终止同名但非本轮所有的应用。

## 用户调整分工后的代码交付

用户明确要求：Agent 只负责开发代码，效果验收由用户负责，到验收阶段通知用户。不再因原生画面或录制问题反复要求用户配合 Agent 验收；之前的未测结果仍保留。

代码收尾还调整了两处：持续状态的默认 replay=0 与业务空字符串使用相同身份，避免恢复后因身份格式差异重复入场；pointercancel/lostpointercapture 保留 use-gesture 自身处理，只在其最后一次回调中标记硬取消，不覆盖库的清理回调。减少动画仍暂停主体动作，恢复时不重播已消费的业务 cue。

收尾后模板校验、类型检查、desktop build、diff 检查通过；另用既有 electron-builder 完成 macOS arm64 临时包。没有新增或运行测试用例。

- 最新包：`/tmp/agent-pet-issue17-final.AfYAGT/mac-arm64/Agent Pet.app`，未自动启动或安装。
- 最新 app.asar SHA-256：`f65ca8435a2df1d6b34ab2beacb486acecf80c5dbb5ed67c7a8180f4f32ab93d`。
- 前述录屏属于收尾前的 `37fa7eb0…` 包，不冒充最终包效果验收。
- 旧临时应用已用其 launchId 清理成功：自有进程、调试会话和临时 profile 已移除。日常配置未动；显式临时构建、素材和录屏保留。

## 交给用户的效果验收范围

需要持续可见的原生窗口。当前可确认导入及正常试播的有界结果，最终版本的快速中断和生命周期由用户验收。不得通过覆盖可见性或关闭保护冒充真实前台操作。

恢复后通过真实导入与宠物试播入口，在精确授权的独立目录中核对：

- 旧包、阶段包、缺主体/可选片段、非白名单对象的表现。
- in 只播一次、loop 连续、out→in→loop、in 中离开及 out 中改目标/返回原状态。
- 工作细类回退去重、同名片段不同映射、主动重播、业务 cue 去重。
- 桌面/首页/试播、本地反馈恢复、拖动正常释放和硬取消、隐藏/失焦/减少动画、换资产与卸载。
- 真实 Three/Drei 完成帧与零时间交接；不能用代理状态代替画面证据。

用户真实素材的接缝视觉仍须独立授权；不要覆盖原包或自动重绑。按用户最新分工，代码阶段检查完整 diff 后本地提交，效果验收仍待用户完成。推送、PR、线上进度更新和发布分别核对授权。

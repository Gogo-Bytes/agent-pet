# 正式管理窗口迁移与验收 · 2026-10-14

用户已验收 Web 原型基线 `3b2f0cd`，本轮按该布局、视觉、文案和交互迁移，不重新探索设计。旧“等待原型视觉验收”记录已覆盖。实现阶段提交 `4f05049`，未推送。

正式代码状态：**IMPLEMENTED-NOT-ACCEPTED（本轮正式 UI 用户验收与新多配置真实 pi 接入尚未完成）**。以下只说明实际取得的证据；不升级既有 M2/M3/M4/D6 或正式发布状态。

## 用户追加：将窗口操作并入顶部栏

2026-10-14 用户指出外部系统窗口与内层界面形成重复外框，要求右上角操作放入内层。这一确认覆盖原型外层留白与卡片边界在 Electron 中的迁移方式。

管理窗口改为 `frame:false`，正式 UI 去掉外层 padding/max-width/边框/阴影，铺满可用区域；最小化、最大化/还原、关闭在共享顶部栏右侧。顶部空白设为 native drag region，按钮排除拖动。窗口操作通过类型化 preload 与 trusted Main IPC，仅允许三个固定动作；关闭复用原 close handler，继续遵循后台保留/退出偏好并使预览失效。

本次 `pnpm test apps/desktop/src/main/index.test.ts apps/desktop/src/preload/management.test.ts apps/desktop/src/renderer/management/ManagementApp.test.tsx` **46 passed / 3 files**；`pnpm typecheck`、desktop build、`pnpm package:mac` 和 diff check 通过。已启动新包的自有隔离 profile，AX 与实际截图确认不再有系统标题栏/外层留白。390×844 正式 Renderer 检查控件完整，scrollWidth=390；原生完整拖动/最小化矩阵不由此外推。

[实际应用包窗口](evidence/management-migration/window-controls-native.png) · [窄窗顶部栏](evidence/management-migration/window-controls-narrow.jpg)。本次新包：`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-Oa1wCv/mac-arm64/Agent Pet.app`（未签名，临时目录）。下方原迁移截图保留为该阶段历史证据。

## 原型功能 → 正式模块/接口 → 缺口

| 已确认功能 | 正式模块与接口 | 当前能力及缺口 |
| --- | --- | --- |
| 外框、品牌、白页脚、四项导航和滑动选择 | `ManagementApp`、`management.css`、`components/icons`、`components/glass` | 已替换旧后台布局；不导入 prototype/main 或原型路由/演示数据 |
| 在线多宠物、模型/键盘聚焦、退出与离场 | `CompanionScene`、`home-projection`、`createManagementStore`；Main `management:sessions` 与 configurations 订阅 | 每个在线配置独立 ID，Three 与 HTML 消费同一投影；通信以原有 legacy hello/close 为据，不代表所有 Session 的汇总在线证据 |
| 真实宠物及连续动作 | `ScenePet` 复用 `useGLTF`、动画 bounds 与实例 mixer；`PetsView` | starter.glb 的 Idle/Work/Success/Error 已真实加载和播放。只有一只内置宠物；睡觉/六只演示收藏/导入包没有接入，入口明确说明 |
| 收藏、名称、绑定、动作盘与弹窗 | `PetsView`、原生 `Dialog`、`Configurations.bindPet`、Preferences.petName | 收藏单只可选，绑定按配置而非 Provider；解除绑定回到默认，不停用 Agent。导入按钮只说明缺口，不模拟成功 |
| 多配置、重命名、重复阻止、位置检查 | `Configurations`、`ConfigurationsStore`、`ConfigurationLocationsApi` 与 trusted IPC | 保存多种类型的元数据；pi 每条独立 controller/store 与 Session 命名空间，其他 Provider 为 unsupported。40 字、空白及 Main 输入校验；明确批准的位置大小写规范化且拒绝符号链接 |
| 自动扫描与手动添加 | 复用 `PiPreflight.detect`；`ManualConnectionDialog` → 原生选择/粘贴路径批准 → Main inspection → 命名保存 | 自动扫描当前仅支持 pi 安装候选，不能找遍项目配置或证明活跃 root。手动识别不确定时选择类型再检查；当前只支持目录，不能将任意配置文件当作 pi agentDir |
| 部署、等待/失败、恢复、停用、移除 | 原有 `PiConnection` / `PiConnectionStore` / `PiTemporaryDeployment`，正式 `DeploymentControls` | 预览、明确确认、私有凭据保存、显式恢复、选择性撤回完整保留。已部署目标更换须先撤回/移除再添加；edited/unknown/uncertain 保留并给出下一步，不删除程序或用户文件 |
| 设置全部分类、恢复默认与关于 | schema v2 + `PreferenceStore`、Main `applyEntrypoints` / `applyPreferences`、`SettingsView` | 默认值、v1 兼容、校验与原子保存；恢复不修改配置、绑定、资产或宠物名称。登录项是独立系统操作并验证结果，开发模式不注册 |
| 帧率/清晰度/隐藏暂停/减少动画 | `PreferenceRenderLoop`、`PetCanvas`、`PetModel`、`CompanionScene` | 实际绘制受 30/60/120 FPS 控制；75/100/150% DPR；隐藏管理场景停绘、document-hidden 按偏好停绘；减少动画使用静态状态姿态。尚无硬件 GPU/耗电基准 |
| 入口/启动/关闭/离线/置顶/气泡/结果提醒 | Main 与 pet preload → `createPetStore` → overlay App/BubbleStack | 实际 API 路径已实施并隔离验证；Main 拒绝关闭两个入口，Dock 失败保留 Tray。筛选气泡不清除未读数据；本轮不替用户更改实际登录项 |

## 状态源、持久化和安全边界

Main 负责路径、文件、系统设置、部署、保存与校验，Renderer 仅使用类型化 bridge。页面选择、宠物绑定与镜头聚焦不能启动、控制或审批 Agent。

`createManagementStore` 持有各通道单一 IPC 订阅；初始请求不会盖过较新的推送，退出释放订阅。首页与宠物页共用一个常驻 Canvas；连接/设置页保留请求所有者，切页不取消已确认操作或放入 mock 定时器。配置检查、通信健康、任务状态分别建模。

非秘密的配置名称/类型/位置/绑定保存在 `userData/configurations.json`。pi 新配置各自使用私有 `configuration-<UUID>/pi-connection` 保存既有凭据/所有权；秘密不进入 Renderer、普通 preferences、日志或应用包。旧单目标凭证通过 `legacy-pi` 复用，不复制或重新认领。启动只读自身 metadata，不检查目标、不自动监听；恢复仍是显式动作。两份记录的目标不一致时失败关闭并保留两份记录。

Preferences schema v2 原子保存；v1 的显隐/大小只读迁移后补默认，下次显式保存才写 v2。保存失败保留旧运行时值。软件入口约束由 Main 执行，系统 Dock 响应过期或失败时保留 Tray。尺寸输入在释放/键盘提交时保存最终值；提醒筛选和减少动画只影响呈现。恢复偏好不会调用配置移除或资产删除接口。

managed 工厂的 `acl-unverified` guard、所有权/内容检查、fail-closed 和数据保留测试未削弱。没有新增 Codex/Claude 等 Adapter，没有依赖安装或真实 HOME/pi 目标读写；本轮仅使用自有隔离 profile/临时根。

## 自动验证

- `pnpm test`：**620 passed / 1 skipped / 65 files**。保留历史 skip 与 Multiple instances of Three.js 警告；通过数量不升级 D6。
- 最后保存配置后选中详情的小增量：`pnpm test apps/desktop/src/renderer/management/ManagementApp.test.tsx apps/desktop/src/renderer/management/SettingsView.test.tsx`：**23 passed / 2 files**。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过。
- `pnpm package:mac`：通过，使用既有 electron-builder / Electron runtime；未安装新的项目依赖，未签名、未发布。
- `git diff --check`：通过；历史两个未跟踪 native smoke fixtures 未读取、修改或清理。

针对测试覆盖：v1 兼容与全部偏好持久化、失败保留旧值、Main 最后入口与 Dock 失败保护、trusted-frame IPC/精确路径批准/大小写重复/符号链接拒绝、独立配置和 Session 身份、重命名、持久化重启、旧凭证位置不一致失败关闭、部署/撤回/编辑文件保留、授权预览、并发与过期响应、跨页操作、恢复取消与失败、订阅释放、真实 GLB 多实例/动画重播/减少动画/资源清理，以及 config availability 与 task motion 投影。已有 pi 文件保护和 managed 回归原样执行。

## 实际页面检查和独立审查

Main 先实际打开 4174 原型，走查首页、宠物、收藏、Agent 绑定、动作选择、连接/扫描/手动添加以及设置五类和恢复确认。正式原生 Electron 使用全新自有 profile/home，取得实际首页空态截图。

正式 Renderer 的测试入口 `renderer/test-support/management-review.html` 引用**实际正式组件、CSS 与 starter GLB**，仅在独立测试边界注入内存 bridge。真实部署/恢复在该 bridge 中拒绝。该入口及 doubles 不进入 Electron 构建或 ASAR，不是产品演示入口。

Main 实际走查 1280×720、390×844、1000×480：模型直接点击、键盘 Enter 聚焦/Escape 退出、返回全景；实际四个 clips 连续切换；单 Canvas；收藏和手动配置原生模态关闭/回焦；手动选择/类型选择/检查/命名；长名称重命名空白拒绝/Escape 取消；设置分类、恢复取消、最后入口前端依赖、气泡关闭后保留提醒及直接启用、文章内容独立滚动。窄窗 document.scrollWidth=390，未产生整页横向滚动。

修正并复验：全局 Icon display 覆盖设置分类箭头；窄窗分类文字换行；矮窗恢复按钮侵入分类区域；选中分类随窗口尺寸变化保持可访问；键盘入口遮挡聚焦信息；长绑定额外编辑控件遮住模型（名称编辑移入收藏）；拖动尺寸首个请求丢失最终值。独立 Review 发现 legacy Session ID 冒号误判、跨 store 位置不一致和大小写重复，均已修复并增加回归。健康自有部署刷新不再把自身 unchanged extension 当未知冲突，修改后的文件仍需处理并保留。

独立 Product Test 检查正式实际截图及运行 15 项管理 DOM 行为测试；8 项 settings 测试由该 Agent 编写，注明独立性限制。其 CUA 浏览器不可用且一次有界恢复超时，独立点击检查未完成。Main 原生坐标点击接口持续报告 noWindowsAvailable；截图/AX 与菜单入口可用，完整原生点击矩阵未完成，未绕过权限或安装其他工具。浏览器 UI 检查不能外推为真实 pi、系统设置或 GPU 验收。

## 源码外应用包

产物：`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-NMBiKB/mac-arm64/Agent Pet.app`。这个临时目录可能在系统清理后消失；没有覆盖用户旧的 M5.app。

ASAR 共 17 个条目，确认 Main、pet/management preload、management.html 和 bundled GLB 存在；不存在 prototype、test-support、review bridge、workspace/src 或 node_modules。直接运行应用包自己的可执行文件，使用新建自有 `--user-data-dir` 并清除 bridge/dev URL/Node 环境；运行至 50 秒有界停止，退出码 0、smoke stderr 为空。实际观察到 packaged 桌宠，通过菜单“打开管理窗口”得到 `app.asar/out/renderer/management.html` 的正式 AX 首页、空态与四项导航。

隔离检查确认 macOS 的 `HOME` 环境变量**不会**改变 Electron `getPath(home/userData)`；本次明确使用经过验证的 `--user-data-dir`，只读自身隔离 metadata，未点击实际 HOME 扫描、目标选择、登录项或部署操作。旧材料中的 HOME 隔离说法不能作为本次证据。包未签名，未绕过任何 Gatekeeper 警告，不宣称公证或正式分发通过。

## 截图（实际正式代码，无原型图替代）

- [Electron 实际首页空态](evidence/management-migration/electron-empty.png)、[源码外应用包实际首页](evidence/management-migration/package-home.png)
- [正式 GLB 全景](evidence/management-migration/home-formal.jpg)、[聚焦](evidence/management-migration/focus-formal.jpg)、[窄窗键盘聚焦](evidence/management-migration/focus-narrow.jpg)
- [正式宠物页](evidence/management-migration/pets-formal.jpg)、[窄窗宠物](evidence/management-migration/pets-narrow.jpg)、[动作浮层](evidence/management-migration/motions-narrow.jpg)、[收藏](evidence/management-migration/collection-narrow.jpg)
- [正式连接页](evidence/management-migration/connections-formal.jpg)、[窄窗长名称](evidence/management-migration/connections-narrow.jpg)、[手动添加](evidence/management-migration/manual-narrow.jpg)
- [正式设置](evidence/management-migration/settings-formal.jpg)、[窄窗分类/文章](evidence/management-migration/settings-narrow.jpg)、[矮窗分类/正文滚动](evidence/management-migration/settings-short.jpg)

除 Electron/应用包空态外，以上截图来自正式 Renderer + 明示的隔离状态 fixture；在线和任务事件不是本轮真实 pi TUI。不同 viewport 改动后读取实际 DOM 尺寸并取得稳定原始 screenshot，无拼接或图像编辑。

## 后续验收

- [ ] 用户复验正式四页视觉与主要交互。
- [ ] 明确授权的隔离 pi TUI 目标 A/B：真实部署 → hello → 状态 → 多配置独立身份 → 重启显式恢复 → 选择性撤回。需先提供具体目录、读取范围、预览、生效与撤回，不能自动使用日常配置。
- [ ] 实际 macOS 菜单栏/Dock 开关、登录项、关闭行为与多窗口矩阵；当前代码和 mock-OS 结果不代替系统验收。
- [ ] 硬件 GPU、实际帧率/功耗、WebGL 恢复及原生窄/矮窗口矩阵。
- [ ] 更多实际宠物资产与受限包导入；自动配置发现与可靠 Provider 识别；新 Provider 各自兼容验收。
- [ ] 正式签名、公证、跨机器分发与发布；完整 D6 仍 BLOCKED。

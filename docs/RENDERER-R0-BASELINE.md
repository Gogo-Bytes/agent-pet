# Renderer R0：迁移回归基线

> 历史阶段记录：下文的代码路径、CSS 保护、测量与待验收状态均对应该阶段，未改写为 R4 新证据。当前状态见 [R4 验收库存](RENDERER-R4-ACCEPTANCE.md)；用户在 R3 已明确丢弃旧未提交 CSS，当前已提交 CSS Modules/tokens 为权威。

## 范围与证据状态

基于 `main` 的 `4c61d33a7f35fab23fdc16bd48972ea682cfe438` 和开始 R0 时的工作区，而非仅基于 Git HEAD 的 CSS。
本阶段只增加测试、测试数据/bridge 替身及本文档；未改生产 Renderer、Main、preload、pi 协议或用户设置，未安装 React/R3F/DOM 测试依赖，未进入 R1。

**自动化基线及首批视觉/交互参考已验证；完整原生验收仍待补齐。** 已连接用户启动的 Electron，另以受控浏览器预览运行真实 Renderer/Application。下表记录初始测试覆盖，新增实机/浏览器证据见后文；没有把替身边界测试或浏览器预览当作完整 OS 验收。

受保护文件 `apps/desktop/src/renderer/style.css`：

- 开始/结束 SHA-256 均为 `94b27018408011e96d3d25479906c9a18236a1ec388d0a58d28c9b94b0f553a1`。
- 用户已有修改保持原样、未暂存；后续视觉采集应使用这一工作区版本，不用 HEAD 的 CSS 代替。
- 默认宠物尺寸 **140**、最小 **80**（当前上限 600），不是新设计值。

## 当前行为清单与证据边界

路径缩写：`desktop` = `apps/desktop/src`。

| 场景 | 当前应保留的行为 | 自动化证据 / 待验收 |
| --- | --- | --- |
| pi 工作→完成 | `agent_start` 显示 working；assistant `message_end` 记录结果，`agent_settled` 且 idle 才发布终态 | 现有 `integrations/pi-extension/bridge.test.ts` 使用真实扩展函数→真实 socket→Adapter→Application；不是运行中的 pi TUI→UI |
| pi 结果语义 | stop/toolUse→completed，error/length→error，aborted/未知结果→idle；不把 agent_end 当终态 | aborted/stop 有现有 socket 回归；其它映射来自实现阅读，未逐一补齐 socket 用例 |
| 确认/打开 | working 点击后仍可见；完成/错误先确认移除，再请求 Open Session；当前 pi 返回 unsupported；失败不复活已读气泡 | 新 `desktop/renderer/pet-bridge-baseline.test.ts` 调用真实 Application；现有 `packages/application/src/*.test.ts`。**尚无 DOM 点击测试** |
| 更名 | Session key 不变；名字更新；删除显式名回退项目名，再回退 Adapter 名；已确认终态更名不重现 | 现有 socket 测试覆盖改名/删名；新 bridge 基线覆盖可见工作态更名及 stale replay |
| 多 Session | 一个宠物、多独立气泡，无合并；一次确认只影响所选 Session；idle 不展示 | 新 pi-only 受控数据与 bridge 基线；现有 Domain 用例 |
| 重连 | 扩展重连发送当前状态基线（working 或 idle），不是历史通知重播；新 Application 不持久化 unread | 现有 `integrations/pi-extension/reconnect.test.ts` 覆盖 socket 服务重启后 working→completed；终态重连无历史回放尚未单独自动化 |
| 订阅生命周期 | Renderer 先订阅 layout/snapshot，再 requestSnapshot；preload 只转交数据，unsubscribe 移除本监听器 | 新 `desktop/preload/index.test.ts` 执行真实 preload 的公开 API，覆盖同时监听、移除、重订阅、全部 Open Session 结果及拒绝；Renderer 的实际装载/卸载尚未执行 |
| 叠放/展开/滚动 | 显示顺序为 Application 气泡顺序反转；收起最多露出 3 张；pointerenter/focusin 展开，离开且无焦点收起；展开区域滚动 | 来自 `renderer/index.ts` 与当前 CSS；新 Main 用例只验证 expanded 控制的命中区域，**DOM hover/focus/滚动待验收** |
| 气泡显隐 | 隐藏气泡不隐藏宠物；按钮文字/accessible label 在显示/隐藏间切换 | preload 通道与 Main 独立显隐命中已测；按钮交互待验收 |
| hover 操作栏 | app hover 或 toolbar focus-within 显示操作栏；隐藏气泡及缩放按钮；键盘焦点有描边 | CSS 实现清单，**视觉/键盘待验收**；Main 当前始终保留 toolbar 命中矩形，不能把 opacity=0 等同于穿透 |
| 拖动/缩放 | Renderer 用 screenX/Y 差值发命令，pointerup/cancel 结束 interaction；Main 舍入移动、平均 x/y 增量等比缩放，使用 clamp 后 anchor 继续移动 | 新 `desktop/main/index.test.ts` 执行真实 Main 注册的 IPC handler：140/80/600、负坐标、贴边后反向移动、非法值/不可信 sender；真实指针捕获/DIP 待验收 |
| 外置气泡避让 | Main 决定气泡在宠物上/下，工具栏在另一侧；辅助区域处于 workArea 内 | 现有 `desktop/main/overlay-layout.test.ts`；新 Main IPC 用例；小屏/多屏实机未验收 |
| 点击穿透 | 50ms 命中轮询；pet/toolbar 命中；仅可见且有内容的气泡命中；收起气泡区域最大 88 高并贴近宠物，展开用全区域；interaction 强制命中 | 新 Main 测试覆盖上下两侧、空气泡、确认后空、显隐及 interaction 释放，断言 `setIgnoreMouseEvents` 参数；**不等于 OS 后方应用收到点击** |
| 临时提示 | unsupported/not-found/permission-denied 显式提示，异常使用通用提示；成功为空；每次提示重置 3500ms 定时器；卸载清除定时器 | preload 结果/拒绝转发已测；**提示 DOM、替换计时、自动消失与卸载清理待测**。加载失败/快照失败提示不是这一自动消失路径 |
| 模型动画 | idle / working / success / error 对应 Idle / Work / Success / Error；优先级 working > error > completed > idle；缺少可选动画回退 Idle | 现有 `desktop/renderer/pet-motion.test.ts`；扩展 `packages/pet-runtime/src/model.test.ts` 实际解析 GLB，分别检查四态位置、快速切换回 Idle、fallback/dispose。**没有 GPU/画面/裁切验收** |

这些测试不读取源码字符串来冒充行为验证。Main 和 preload 测试调用真实模块的公开边界，但 Electron 本身是替身；Application/Domain/GLB runtime 使用真实实现。

## 受控数据与稳定 bridge 替身

`desktop/renderer/test-support/pi-fixtures.ts`：

- `piObservation(overrides)`：固定时间、revision、process/session/work ID 的 pi observation，调用时返回新数据。
- `piBaselineObservations()`：6 个独立 pi Session，5 个可见气泡（工作、完成、错误、长名称工作、项目名回退完成），另一个 idle 不展示。没有读取真实用户 Session。
- `baselineLayout(position, size)`：center / top-left / bottom-right；默认 size=140，可传 80 或更大值；调用真实 `layoutOverlay` 得到权威形状，不手填几何规则。
- 单态动画基线用空 observations（idle）或单个 `piObservation({ status: 'working' | 'completed' | 'error' })`；不能用混合数据验证 error/success 动作，因为 working 优先。

`desktop/renderer/test-support/pet-bridge-double.ts`：

- `createPetBridgeDouble({ observations, layout, openSession })` 返回 `.api`，用 `satisfies Window['pet']` 校验当前 preload 合约；API 对象保持同一引用。
- `api.subscribeSnapshot/subscribeLayout` 不自动发送初值；订阅后 `requestSnapshot()` 才推送当前 snapshot/layout。未改变状态时 snapshot 引用保持不变。
- `observe` 驱动真实 Application，不复制未读、改名或确认状态机；`publishLayout` 显式推送 layout。
- `openSession` 可注入成功、不支持、拒绝等结果；默认 unsupported 与当前 pi 行为一致。
- move/resize/interaction/显隐/展开是可断言的命令记录，**不模拟原生窗口、拖动或 CSS**。
- `listenerCounts` 和 `dispose` 用于每例清理；unsubscribe 可重复调用且不影响其它监听者。
- 替身只在测试文件中使用，未接入生产入口。未来 DOM 测试可消费同一合约，不应通过它宣称原生验收通过。
- `test-support/visual.html` / `visual.ts` 是独立 dev-only 预览页，消费同一受控 observations 和真实 Application，随后加载真实 `renderer/index.ts`；不复制 Renderer、不连接 socket、不注入用户会话，不作为构建入口。移动/缩放/命中 API 明确为空实现，不能用该页验收原生行为。

## 视觉及原生参考采集清单

使用当前 Renderer 和受保护 CSS 采集；没有创建占位截图。截图均保存于 `docs/evidence/renderer-r0/`，工具已验证文件存在。Electron 页面截图不包含后方桌面；深浅色参考通过临时设置 DOM 背景取得，不证明原生桌面模糊效果。

| 证据项 | 尺寸/数据/位置 | 需观察 | 当前结果 |
| --- | --- | --- | --- |
| 浅色背景参考 | 140，混合 pi 数据，屏幕中部，叠放/展开 | 玻璃边缘、文字/状态对比度、toolbar hover、长名截断 | 已采集 Electron idle 与受控浏览器混合气泡参考，非原生桌面背景 |
| 深色背景参考 | 140 idle / 80 混合气泡 | 不把 Chromium backdrop-filter 当原生桌面模糊保证 | 已采集；气泡文字对比度偏低，未改样式 |
| 四边参考 | 140，top-left/top-right/bottom-left/bottom-right | 气泡与工具栏换侧、避让、无越界、下方叠放方向 | 已有 80 单边原生/fixture 参考；四边组合仍待采集 |
| 最小/较大尺寸 | 80 / 300（及 600 边界），四种单态 | 宠物/跳跃完整取景，不遮住气泡，缩放后动画持续 | 80/140 idle 已采集，其余待采集 |
| 多气泡与键盘 | 5 个气泡，展开滚动，Tab/Enter，再更新名字/状态 | 焦点、滚动、展开保持、独立确认 | 未执行 |
| 提示计时 | 点击 pi working 重复触发 | unsupported 提示、重置计时、最终消失 | 受控浏览器真实 DOM handler 检查通过，非 pi TUI |
| 原生拖动/穿透 | 贴边移动、拖动取消、缩放、气泡显隐 | 后方真实应用收到透明区点击；可见区域仍可交互；释放后不持续挡住 | 用户确认重启后拖拽、点击、显隐、缩放正常；OS 穿透/取消仍待验收 |
| 真实 pi→UI | 已配置 pi 的新工作、完成、确认、更名、重连 | UI 与真实扩展事件一致，不重启现有 pi、不改用户配置 | 未执行；socket 回归不能代替 |

Windows、多显示器负坐标/DPI、全屏 Space、休眠恢复、显示器断开、reduce-motion/高对比实际视觉仍待实机验收。GLB Node 测试没有证明 WebGL 上下文、帧率、GPU 资源或裁切正确。

## 已知风险（记录，不在 R0 修复）

- 当前 Renderer 更新气泡使用 `replaceChildren`；更名/状态更新可能丢失 DOM 焦点，需在 R1 用户事件回归中确认。
- 当前手势处理 pointerup/pointercancel，但未见 lostpointercapture/blur 清理；需要原生复现，不将风险写成已观察故障，也不在 R0 修改 R3 范围代码。
- 现有工具链是 Vitest Node，没有 jsdom/Testing Library/browser runner。本阶段不安装 R1 依赖，也不自造 DOM 模拟器；上表明确保留 DOM 测试缺口。
- 深色预览中气泡文字对比度偏低（见 `fixture-dark-80-top-left.png`），保留现有视觉作为基线，不在 R0 混入改版。
- 首次启动用户报告 hover 有效但点击/拖拽失效；添加调试端口并重启后，用户确认全部交互正常。没有复现或定位根因，不能把调试端口当作修复；启动/热更新交互仍需复测。
- 未覆盖的原生验收不因自动化命令通过而关闭。

## 验证记录与提交边界

环境：Darwin arm64，Node `v22.22.3`，pnpm `12.4.2`，Vitest `3.2.7`。

- `pnpm test`：18 文件 / 66 测试通过（新增 23 测试）；包括现有真实 socket 链路及重连。独立审查发现的重复 callback 注册合并问题已修复：每次订阅保存独立 wrapper，新增 snapshot/layout 重复订阅与幂等退订回归。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过；Main/preload/Renderer 及 GLB/CSS 均打包成功。这不是 Electron 运行验收。
- `git diff --check`：通过；阶段暂存前无已暂存文件；受保护 CSS 哈希未改变。
- 开发中的一次测试运行曾失败：Main 测试保留了被后续命令修改的 anchor 引用，而 mock IPC 不会像 Electron 那样 structured-clone。测试改为保存当时坐标副本后通过，未修改生产代码。最终无已知自动化失败。

## 新增实机与浏览器证据

工具托管 Electron 启动曾被 framework evidence 校验拒绝。用户随后以 `pnpm --filter @agent-pet/desktop dev --remoteDebuggingPort 9222` 启动，主会话用 `agent_browser connect 9222` 成功连接 `http://localhost:5174/`。没有重启 pi 或修改其配置。

### Electron（Darwin，真实 preload/Main）

- 用户确认拖拽、点击、显隐和缩放正常；工具另点击显隐按钮，确认 accessible name 在“隐藏气泡/显示气泡”之间变化。
- 初始 anchor `(1626,980,127,127)`，bounds `(1533,758,313,399)`，DPR=1；`electron-current.png` 为初始空闲透明窗口。
- `electron-idle-140-light.png` / `electron-idle-140-dark.png`：通过真实 resize IPC 调整为 140，DOM 背景分别 `#f1f5f9` / `#111827`，操作栏 hover 可见，GLB 正常渲染。
- `electron-idle-80-edge.png`：真实 Main clamp 后 anchor `(2560,352,80,80)`、bounds `(2560,302,306,352)`，已移到另一显示器边缘，图像为 DPR=2。只证明这一布局位置，不等于四边/全部 DPI 验收。
- 采集后恢复原始 anchor、127 尺寸、透明背景和气泡可见状态，并读取 Main layout 确认恢复；未关闭用户 Electron。

### 受控浏览器（真实 Renderer/Application，替身 bridge）

运行 dev 后访问 `/test-support/visual.html`；支持 `theme=dark`、`size=80`、`position=top-left|bottom-right`，默认浅色/140/center。浏览器截图 viewport=1280×633，DPR=1，fixture 工作区为 `(0,25,1440,875)`，不是 OS 工作区。

- `fixture-light-collapsed.png` / `fixture-light-expanded.png`：hover 前后三层堆叠和五个气泡列表；工具 snapshot 确认展开后的五个按钮可访问。
- 通过工具实际点击 working 气泡后断言仍为 5 个；点击“项目名称回退”的 completed 气泡后断言为 4 个且所选项消失。
- 在真实 DOM handler 上再次调用 working 按钮 `click()`：100ms 检查 unsupported 提示；1800ms 后再次点击，1900ms 后检查提示仍在，再等1800ms检查清空。提示出现、计时重置和消失均通过；这是 DOM handler 验证，不是原生鼠标事件验证。
- `fixture-dark-80-top-left.png`：80 尺寸、气泡在宠物下方的深色参考，长名截断、滚动区域裁切可见。
- 尚未覆盖：用户键盘与实际滚轮、卸载后的计时清理、真实 pi TUI→UI、四边全组合、动作快速切换的 GPU 画面、穿透到后方应用、帧率/资源测量。四态动画及 socket 仍使用上文自动化证据。

交付范围：新测试/辅助文件、dev-only 视觉预览、`packages/pet-runtime/src/model.test.ts`、本文档与七份实际截图；**排除用户 `style.css`**。此交付是可独立验证/回滚的 R0 回归参考，不宣称完整 R4 原生验收。仅本地提交，不推送。

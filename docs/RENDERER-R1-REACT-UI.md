# Renderer R1：React 接管二维 UI

## 边界与当前结论

基于 R0 `7b5f1e4`。本阶段只有 React UI、桥接订阅、既有 Three 场景的生命周期包装、renderer-safe 布局类型、构建/类型配置及测试。**自动化、受控浏览器及 Electron 页面加载冒烟通过；R1 原生交互和真实 pi → UI 验收尚未完成。** 未开始 R2/R3，没有 R3F、Drei、Motion、手势库、设计改版或其它 Agent 接入。没有修改 pi 配置、重启 pi、升级 Electron、提交或推送。

受保护的用户文件 `apps/desktop/src/renderer/style.css` 未编辑、未暂存，开始及验证结束 SHA-256 均为：

`94b27018408011e96d3d25479906c9a18236a1ec388d0a58d28c9b94b0f553a1`

此文件在 Git 中仍显示用户原有修改，不属于 R1 patch。保留所有现有 CSS class/布局，默认 **140**、最小 **80**、上限 **600**，Main 的几何算法、pi 终态与未读状态机均未改变。

## 实现清单

- `main.tsx` 创建唯一 React root，包含 canvas、BubbleStack、Toolbar、通知；StrictMode 启用，beforeunload/HMR 调用 root.unmount。删除旧手工 DOM `index.ts`。
- `app/bridge/pet-store.ts` 为所有消费者共享一对 IPC 监听。先订阅两个通道，再在微任务中请求初值；StrictMode 已撤销的首轮不发请求。快照 getter 缓存同一对象，只有推送变化时更新。卸载/重订阅采用 generation，忽略旧回调与旧请求拒绝；当前推送也不会被初始请求失败覆盖。Application 仍是唯一业务状态来源。
- Session 使用 sessionId key；更名、排序、状态更新保留按钮 DOM 和键盘焦点。工作态点击保留；完成/错误点击由 Application 确认移除，再显示 Open Session 的明确结果。
- hover/focus 展开、离开且无焦点收起、显隐命令与原 class 一致。通知 3500ms 自动消失，重复结果重置计时；卸载清除计时并忽略异步结果，旧点击结果不覆盖新点击。
- 原来的 GLB loader/mixer、camera/light、30fps RAF 移到 `features/pet/pet-scene.ts`，由 `PetCanvas` 的一个 effect 独占。未添加第二套 loader/RAF 或第二个 canvas。StrictMode 首轮在启动 fetch 前退出；清理取消 RAF、abort fetch、退订、移除 resize listener/observer、dispose 模型和 renderer；晚到的 parse 结果立即 dispose。ResizeObserver 跟随 React 已提交的 canvas 布局更新尺寸，不因 Session/layout 更新重建场景。
- 工具栏采用 Lucide `Eye`、`EyeOff`、`MoveDiagonal2`，删除手写 SVG。既有屏幕坐标移动/缩放命令保留，Main 继续裁切/校验。pointer up/cancel 和卸载释放 interaction；lost capture/blur 的完整手势改造仍是 R3 范围。
- `src/shared/overlay-layout.ts` 是纯类型契约；Main 算法显式返回该类型，preload/renderer 使用类型导入。Main 与 preload 除类型 import 外没有行为改动。
- R0 dev-only visual fixture 改为加载真实 `main.tsx`（通过 `main.js` import 解析），没有加入生产构建入口或连接真实用户会话。

## 精确依赖与兼容性证据

环境：Darwin arm64、Node **22.22.3**、pnpm **12.4.2**；electron-vite **4.0.1**、Vite **7.3.6**、Vitest **3.2.7**、Three **0.177.0** 均未升级。

安装前用 `pnpm view <包>@<版本> version peerDependencies engines license --json` 核实以下元数据；manifest 全部精确版本，完整依赖树固定在 `pnpm-lock.yaml`。安装未报告 peer 冲突；另运行 `pnpm install --lockfile-only --frozen-lockfile --strict-peer-dependencies` 通过。`pnpm why react -r` 只有 React 19.2.8 一种版本。

| 包 | 精确版本 | 核实的 peer / engine | license |
| --- | --- | --- | --- |
| react | 19.2.8 | Node >=0.10 | MIT |
| react-dom | 19.2.8 | react ^19.2.8 | MIT |
| lucide-react | 1.47.0 | React ^16.5.1 / ^17 / ^18 / ^19 | ISC |
| @types/react | 19.2.14 | 无 peer | MIT |
| @types/react-dom | 19.2.3 | @types/react ^19.2.0 | MIT |
| @vitejs/plugin-react | 5.2.0 | Vite ^4.2 / ^5 / ^6 / ^7 / ^8；Node ^20.19 或 >=22.12 | MIT |
| vite（显式 devDependency） | 7.3.6 | @types/node ^20.19 或 >=22.12；Node ^20.19 或 >=22.12；CSS 预处理器等为 optional peer | MIT |
| @testing-library/react | 16.3.3 | React/DOM/types ^18 / ^19；@testing-library/dom ^10；Node >=18 | MIT |
| @testing-library/dom | 10.4.1 | Node >=18 | MIT |
| @testing-library/user-event | 14.6.7 | @testing-library/dom >=7.21.4；Node >=12、npm >=6 | MIT |
| jsdom | 26.1.0 | Node >=18；canvas ^3 optional peer，未安装 | MIT |

显式加入已存在的 Vite 7.3.6 仅用于正常解析 `vite/client` 的 ImportMeta/HMR 类型并固定 plugin peer，不是第二套桌面构建系统。根 TS 配置增加 `react-jsx` 与 `.tsx` 收集；electron-vite renderer 使用官方 React plugin。jsdom 测试通过文件级 environment 指令运行，其余 socket/Main/Domain 测试仍在 Node；不修改全局测试环境。

### 已阅读的已安装官方说明/类型

- `@vitejs/plugin-react/README.md`：automatic JSX、renderer plugin、Fast Refresh 导出约束。
- `@types/react/index.d.ts`：useEffect cleanup/deps、useRef、useSyncExternalStore subscribe/getSnapshot；`@types/react-dom/client.d.ts`：createRoot/render/unmount。
- `vite/types/hot.d.ts`：dispose callback，用于入口重载清理。
- `lucide-react/dist/lucide-react.d.ts` / `dist/esm/icons/move-diagonal-2.mjs`：具名图标、SVG props 与方向。
- `@testing-library/react/types/index.d.ts`：render/cleanup/act/StrictMode；`@testing-library/user-event/dist/types/setup/setup.d.ts`、`options.d.ts`、pointer types：setup、advanceTimers、真实用户事件 API。
- `jsdom/README.md`：DOM 模拟边界，不将 jsdom 当 WebGL/原生 OS 验收。

没有使用通用浏览器 shell 抓文档或做浏览器自动化。测试开发遇到 RTL 默认 asyncWrapper 仅为 Jest 推进 0ms timer；通过其公开 configure API，在两项 Vitest fake-timer 用例中使用 React act 包装并在 afterEach 恢复配置，不增加全局 Jest 伪装。初次类型检查发现 Vite client 类型无法从隐式 peer 解析；显式声明同一已安装 Vite 版本后通过。

## 依赖审计：存在未修复风险，不宣称零漏洞

`pnpm audit --json` 退出码 **1**：**36 条**，critical **0**、high **9**、moderate **21**、low **6**。原始结果 `/tmp/agent-pet-r1-audit.json`。

为验证是否原有问题，将 `7b5f1e4` 的 package.json 与 lockfile 用 `git show` 复制到独立临时目录，对该基线执行相同 audit（未改工作区）。结果 `/tmp/agent-pet-r0-audit-comparison.json`：相同 36 个 advisory ID，逐项 findings（版本、路径、dev 标记）与当前完全相同。**本次 registry audit 没有新增发现，不等于没有未知漏洞。**

| 受影响包/路径 | 直接/传递 | 严重程度条数 | 边界 |
| --- | --- | --- | --- |
| electron 36.9.5，`.>electron` | 根直接 devDependency | high 7 / moderate 19 / low 6 | Electron 是实际生产桌面运行时；不能因 devDependency 标记忽略风险 |
| extract-zip 2.0.1，`.>electron>extract-zip` | 传递 | high 2 | Electron 安装/解压工具路径；审计显示无已发布修复，不是新增 UI 依赖 |
| vitest 3.2.7，`.>vitest` | 根直接 devDependency | moderate 1 | 测试工具的 redirect mock 任意文件读取问题 |
| @vitest/mocker 3.2.7，`.>vitest>@vitest/mocker` | 传递 | moderate 1 | 同一 GHSA-82fw-gwwq-j7x9 的传递工具路径 |

运行时 high 包括 context isolation bypass（GHSA-h7rp-cf8h-j98x）、custom protocol 跨域读取（GHSA-v3j7-r9gq-3gjw）、sandboxed iframe navigation popup 绕过（GHSA-9f4c-93c8-jc8g）等；未对本应用做 exploitability 评估，不据此宣称可利用或不可利用。本次没有 critical advisory。按阶段指令不擅自升级 Electron/Vitest major 或使用 audit fix；这些是需要后续单独决策的残留安全风险。

## 验证结果及证据边界

- `pnpm test`：**22 文件 / 88 测试通过**（R0 66 + R1 新增 22）。现有真实扩展→socket→Application 与重连回归继续通过。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过，Main/preload/renderer、GLB、原 CSS 正常打包；renderer JS 约 1.86 MB（未压缩构建报告），尚未做运行时性能预算测量。
- `git diff --check`：通过；`git diff --cached --name-only` 为空；CSS hash 如上。
- 详细有界日志/库存：`/tmp/agent-pet-r1-validation.txt`；R1 文本 diff（含新文件，排除用户 CSS、二进制截图）：`/tmp/agent-pet-r1.patch`。截图文件单独供 reviewer 阅读，库存中记录 hash。

新测试：

| 文件 | 覆盖 |
| --- | --- |
| `app/App.test.tsx`（14） | 实际 user-event 点击确认完成/错误、working 保留、键盘更名/排序/状态更新焦点、hover/focus 展开收起、显隐独立于 canvas、指针 move/resize 屏幕 delta/释放、Main layout 应用、StrictMode 单 listener pair/scene 清理、全部 Open Session 结果/异常、提示 3500ms expiry/reset/unmount、过期点击结果、初始失败 UI |
| `app/bridge/pet-store.test.ts`（4） | snapshot 引用稳定、共享订阅/幂等退订、重挂载旧请求拒绝、先推送后拒绝、当前拒绝恢复、卸载旧 listener callback、请求前卸载 |
| `features/notifications/use-session-notice.test.tsx`（1） | 保留 hook 状态、替换 bridge 触发 effect cleanup/setup：提示必须清空、旧计时器清除，后续提示仍正常到期。先运行失败，再修复为通过；不冒充实际 Fast Refresh 测试 |
| `features/pet/pet-scene.test.tsx`（3） | 实际场景 owner + React effect，替换 WebGLRenderer/parse 与平台计时 API；StrictMode 一个活 RAF/loader、动画选择、尺寸 observer、fetch abort/全部清理、晚到 GLB dispose、加载失败清理。不是 GPU 验收 |

### 父会话受控浏览器检查

父会话通过 native `agent_browser` 对 `http://localhost:5174/test-support/visual.html` 执行并回报：

- 一个 canvas、两个 `svg.lucide`；hover 前后快照中的可访问气泡由 3 变为 5。
- 实际工具点击 working 后仍 5 个；点击 completed 的项目名回退项后剩 4 个且选中项消失。
- 保存并与 R0 目视比较：`docs/evidence/renderer-r1/fixture-light-collapsed.png`、`fixture-light-expanded.png`。布局保留，动画姿态变化正常，Lucide 图形变化为本阶段明确要求。图片由父会话生成，worker 未编辑。

以上是受控 fixture 的真实 React/Application DOM/WebGL 冒烟，不是实际 pi TUI 或桌面穿透验收。

父会话另连接运行中的 Electron（9222，`localhost:5174`）：已有页面出现 Vite import-analysis overlay，涉及 `visual.ts` 的 `../main.js`（实现中间态编辑广播的可能残留，未证明根因）。重新导航同一 root URL 后 overlay 清除，React/Lucide 页面正常加载：一个 canvas、两个 Lucide、真实 `window.pet`、无提示、保留原先 **127px** 布局。未重启 Electron/pi；保留用户窗口运行。这只证明原生容器加载冒烟，不是重现或修复 R0 用户报告的原始点击/拖动问题。

**仍待后续验收：真实 pi 气泡的点击确认专项、原生取消/失焦、OS 点击穿透、深背景/四边/最小与较大尺寸全矩阵、GPU/CPU/资源长期测量。** Windows、多显示器/DPI、休眠等继续按 R4 待验收，不由本次单测关闭。

### 审查修复与 dev 配置重启复测

审查指出 effect cleanup 清除提示计时器却保留 message；主会话新增 effect-restart 测试，先复现失败，再在 effect setup 清空提示。最终重跑 22 文件 / 88 测试、typecheck、build、diff check 均通过，CSS hash 未变。

实际 Electron 在通知 hook 注释更新后出现空 `#app`（canvas=0，toolbar buttons=0），重新导航可恢复。读取当前 dev 返回的 `App.tsx` 转换结果发现没有 `$RefreshReg$` 或 HMR accept；页面也没有 React refresh preamble。该 dev 进程从 R0 持续运行，尚未加载新增 React 插件配置，不能据此认定新配置下 Fast Refresh 正常或故障已修复。因此先重启桌宠 dev（不重启 pi）后复测，不针对旧配置运行态猜测修改 Main。

用户重启后，主会话重新连接 9222：`App.tsx` 转换结果含 `$RefreshReg$` 和 `import.meta.hot.accept`。再次修改通知 hook 注释触发热更新，等待后断言：同一 `performance.timeOrigin`、同一 canvas DOM 节点、一个 canvas、两个操作按钮、无 Vite overlay，均通过。先前旧 dev 配置下的空根现象不再复现；没有宣称定位/修复 R0 最初的点击问题。

同一真实 Electron 会话继续通过 CDP 鼠标事件验证：显隐按钮切换并恢复；canvas 拖动 `(12,8)` 后读取 Main anchor 确认同样位移，释放后 dragging class 清除；缩放按钮拖动 `(10,10)` 后 Main 宽高从80变为90。采集后恢复 anchor `(2229,1139,80,80)`。这覆盖真实 Renderer→preload→Main 布局链路，但 CDP 注入不证明 OS 对后方应用的穿透效果。

此前真实 Application snapshot 为0个 Session，检查发现 `/tmp/agent-pet-pi.sock` 不存在；用户提供的扩展路径若包含字面量 `<0001f977>` 也不存在，实际目录为 `🥷`。指导桌宠和 pi 两侧使用相同 endpoint/token 后，用户明确反馈“这次出现了，状态转变也正常”：真实 pi→桌宠气泡及状态转换通过用户实机确认。没有向用户 socket 注入模拟数据，没有记录 token。用户未单独确认真实 pi 气泡的点击消失；该行为已有受控 DOM/Application 和 socket 回归，仍保留真实场景专项复验。

## 提交边界

独立审查完成，提示 effect-restart 问题已补回归并修复；父会话完成浏览器与 Electron 冒烟，用户确认真实 pi 气泡及状态转换。R1 作为可独立回滚阶段仅本地提交，不推送。提交仅包含 R1 renderer、类型契约/import 更新、配置、精确依赖/lockfile、本文与两张截图；**排除用户 `style.css`**。既有审计风险及上述原生验收缺口未关闭。

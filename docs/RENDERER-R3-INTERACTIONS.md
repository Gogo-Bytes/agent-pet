# Renderer R3：生态交互与统一样式

> 历史阶段记录：下文的代码路径、CSS 保护、测量与待验收状态均对应该阶段，未改写为 R4 新证据。当前状态见 [R4 验收库存](RENDERER-R4-ACCEPTANCE.md)；用户在 R3 已明确丢弃旧未提交 CSS，当前已提交 CSS Modules/tokens 为权威。

## 范围与证据边界

基于 R2 `744267a58a664f7856d32cba74179f7a18fcb512`，仅实现 R3。未改 pi 配置/token/协议、Application 未读规则、3D mixer、Electron 版本；未擅自重启用户进程；本阶段仅本地提交，不推送。

**基线变更须明确区分：** 用户最新明确要求丢弃未提交的 `renderer/style.css`。父会话已在实施前仅将该文件恢复 HEAD，恢复备份在仓库外 `/tmp/agent-pet-user-style-before-r3.patch`。本阶段从干净工作区的**已提交 CSS**迁移并删除该文件，没有恢复被丢弃的样式。R0/R1/R2 截图使用过被丢弃的工作区 CSS，故不能宣称 R3 与这些截图像素等价。

**自动化、受控浏览器、新 Main 的 Electron 手势冒烟通过；用户已确认气泡展开和切换应用后透明区域点击穿透。** 旧 dev Main 不会因 Renderer HMR 自动采用这里的语义；用户进程未由 worker 重启。Windows、多屏负坐标/DPI、桌面后方真实点击穿透等不以 jsdom 或 mock Electron 的通过关闭。

## 实现与所有权

### use-gesture → 窄原生命令

- `shared/use-window-gesture.ts` 使用实际 `useDrag`，删除原 pointer down/move/up 自制识别器；库管理识别、捕获、pointercancel/lostpointercapture 和键盘方向键。
- 适配层只持有 interaction lease、上一条 `screenX/Y` 与捕获目标。每次发**增量屏幕 CSS 像素/DIP**，不使用累计 `offset`，不乘 DPR，也不累积 Main 已 clamp 掉的距离。Main 继续舍入/约束 anchor 和 80..600 尺寸，默认仍 140。
- pointer up/cancel/lost capture、元素 blur、window blur 和卸载均释放；先清 lease，再 release capture/调用 interaction(false)，库随后到达的终止回调不会重复 stop。失焦/卸载调用库 cancel，后续 move 不再发送命令。
- 保留普通点击、Enter/Space；resize 的 Arrow keys 使用库的 `keyboardDisplacement=10`（Main 仍按 x/y 平均增量等比缩放），Shift/Alt 是库原行为。宠物拖动没有添加新的键盘产品动作。
- 平台指针事件/捕获通过 jsdom 边界 shim 补齐；没有 mock use-gesture 本身。DIP 单测不能代替 Electron 跨屏缩放实测。

### Motion 与 Main 命中同步：有意不做退出动画

本阶段选取**边界内 opacity 动画**，不做几何投影、弹簧位移或保留退出 DOM：

- Motion 管理 keyed 气泡入场及 collapsed/expanded 状态的 140ms opacity；variant 名称改变触发状态过渡，避免相同 keyframe 数组被 Motion 优化为无变化。更新名字不替换按钮 DOM。3D 继续由 R3F/Drei 管理。
- 收起/隐藏/删除即时提交，无 `AnimatePresence`，**不存在可见退出节点仍留在已释放 native 区域内**。收起态外层精确限制到 Main 的 88px strip（上方贴底、下方贴顶）；展开态限制到 Main bubble rect；overflow 隔离所有卡片绘制。
- `bubblesVisible(boolean)` 原 API 形状不变，但明确为**实际 presentation presence**，不是用户隐藏偏好。隐藏偏好仍在 App，只有 `!hidden && bubbles.length > 0` 请求存在。Main 初值 false，移除原 `application.snapshot().bubbles.length` 命中门控：最后一次确认后 Main 保留区域直到 Renderer 提交节点删除并报告 false，避免 snapshot 先于 DOM 提交就穿透。
- Renderer 等待既有 visibility/expansion IPC 成功后才 reveal/grow；缩小/移除先提交再报告 false。过期 Promise 完成不能恢复旧 UI；失败通过 Promise 回调内的 `flushSync` 先提交隐藏再尽力撤销 presence/expansion；StrictMode/unmount 清理。无任意 rect 注入、无新增 IPC 通道。
- Main 提取既有 `updateHitPolicy`，在这些布尔 handler 和 interaction/layout 更新中**同步调用 setIgnoreMouseEvents**，然后才返回 IPC；不是只凭 Promise resolve 推断 50ms timer 已经跑过。50ms 轮询继续跟踪以后光标位置。实际 OS 调度及后方应用点击接收仍需原生验证。
- Main 在 `did-start-loading` / `render-process-gone` 重置 presence、expanded、interaction，不依赖 crash 时不可能保证运行的 React cleanup，防止重载/崩溃后空区域永久拦截。
- reduced-motion 时 opacity duration=0；CSS hover 也禁用 transition。读取 Motion 13 的实现发现 `useReducedMotion` 仅 mount 时采样，因此用薄的 `useSyncExternalStore(matchMedia)` 订阅实时偏好变化，包括从进行中的动画切至 reduced。没有新的动画循环。

### Tooltip 与 CSS Modules

- `GlassSurface`、`IconButton`、`Tooltip` 是薄封装；业务 CSS 移到 feature Modules，公共玻璃/按钮各只有一套样式，tokens/globals 替换混合 `style.css`。稳定 class/data hook 只用于测试发现，不重复负责样式。
- 保留已提交版本的布局、圆角、堆叠和 Lucide 图标。删除相互覆盖的 toolbar/focus 规则；没有新增手写 SVG。
- 深色对比度：气泡基底从低透明度提高到 .90、hover/active .96，文字 `#253047` / 次级 `#43516a`；工具栏使用 .94 深底及明亮图标。玻璃高光只用 inset shadow，避免绘制越出命中边界。高对比/减少透明度偏好使用实色。
- Radix 负责 hover 延迟、focus 描述、Escape/blur/click dismiss 和 disabled；不手写另一套 tooltip 事件。无 native `title` 重复提示。
- Portal host 是 Main **始终命中的 pet rect**，挂在 body，避免 toolbar backdrop-filter 成为 fixed containing block。只覆盖 Radix Popper 的位置输出，将内容居中在 pet rect 内（4px 内距，最小80时可换行）；没有假设 portal 能越过 Electron 窗口。
- tooltip 是非交互提示（`disableHoverableContent`），整个 portal/content `pointer-events:none`，离开 trigger 即收起；不拦截宠物拖动、不扩大 native hit area、不抢焦点。已知两条短中文提示在80px区域实测可读；不是任意长富文本容器。

## 精确依赖与已阅读来源

环境 Node 22.22.3 / pnpm 12.4.2，React/react-dom 19.2.8、Three 0.177.0、Fiber 9.7.0、Drei 10.7.8、Electron 36.9.5 保持。R2 Fiber 初始化错误 pnpm patch 注册及 hash 完全保留，真实 WebGL 初始化失败回归继续通过。

安装前 `pnpm view ... version peerDependencies engines license --json` 与 baseline audit：

| 直接依赖 | pin | peer | engine / license |
| --- | --- | --- | --- |
| @use-gesture/react | 10.3.1 | React >=16.8 | 未声明 engine / MIT |
| motion | 13.4.0 | React/DOM ^18 或 ^19 | 未声明 engine / MIT |
| @radix-ui/react-tooltip | 1.2.16 | React/DOM ^16.8 / ^17 / ^18 / ^19 / 19 rc，types optional | 未声明 engine / MIT |

use-gesture 已在 R2 的 Drei 传递树中，本次成为显式直接依赖。同一 lockfile 新增29个 package records：MIT，除 tslib 2.8.1 为0BSD；均未声明 engine 限制。完整新包 license/peer/engine/source manifest 库存 `/tmp/agent-pet-r3-dependency-inventory.json`。严格 frozen peers 检查通过。Motion 的需要 React19.3 的 AnimateView 入口**未使用**，仅采用支持当前 React19.2.8 的 `motion/react`。

实际阅读的官方安装包文件（省略 `.pnpm/<version>/node_modules/` 前缀）：

- `@use-gesture/react/src/useDrag.ts`、`useRecognizers.ts`、声明：bind/Controller 生命周期和 cleanup。
- `@use-gesture/core/src/engines/DragEngine.ts`：first/last/cancel、capture 目标、pointercancel/lostcapture、keyboard displacement；`config/dragConfigResolver.ts`、`support.ts`：threshold=0、pointer keys、浏览器 capability 检测。
- `motion/README.md`、`framer-motion/dist/index.d.ts`：motion/react、MotionConfig reducedMotion 只限制 transforms；`dist/es/utils/reduced-motion/use-reduced-motion.mjs`：mount-only state；`motion-dom/dist/es/render/utils/animation-state.mjs`：variant/keyframe 变化比较；`framer-motion/dist/es/motion/utils/use-visual-element.mjs`：commit/effect 与真实 animation state。
- `@radix-ui/react-tooltip/dist/index.d.ts`、`dist/index.mjs`：Provider delay、Trigger asChild 事件合成、aria-describedby、Portal container、DismissableLayer 不禁用外部 pointer、Escape、disableHoverableContent、disabled 受控 Root。
- `@types/react-dom/index.d.ts` 的 `flushSync`：只在异步 IPC 拒绝回调使用，确保隐藏提交发生在释放 native 区域之前；不在 React effect 内调用。
- 继续使用 Vite client 提供的 CSS Modules 类型和 R1 的 React/Testing Library public API。无 shell browser 自动化。

## 审计：相同既有风险，没有新增 advisory/path

安装前 `/tmp/agent-pet-r3-baseline-audit.json` 与安装后 `/tmp/agent-pet-r3-audit.json` 均 audit exit1：36 IDs，high9 / moderate21 / low6 / critical0。

**逐 advisory ID 及完整 findings（版本、路径、dev/optional/bundled）完全相同**，不只是比较计数；比较结果 `/tmp/agent-pet-r3-audit-comparison.txt`。保留风险路径：

- Electron 36.9.5 `.>electron`（实际桌面 runtime，不能因 devDependency 忽略）；
- extract-zip 2.0.1 `.>electron>extract-zip`；
- Vitest 3.2.7 `.>vitest`、@vitest/mocker 3.2.7 `.>vitest>@vitest/mocker`。

本阶段不 audit fix、不升级 Electron/测试工具 major，不宣称无漏洞或已评估这些风险的应用可利用性。

## 验证

- `pnpm test`：25文件 / **114测试通过**，保留94项基线（按新 presence 意义更新原 Main 测试及 DOM 平台边界），新增20。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过；实际 Main/preload/CSS Modules/GLB/renderer 打包，不代表 Electron native 验收。
- `pnpm install --lockfile-only --frozen-lockfile --strict-peer-dependencies`：通过。
- `git diff --check`：通过；暂存区为空。

新增测试不 mock Motion/use-gesture/Radix：

| 文件 | 新增/更新覆盖 |
| --- | --- |
| `shared/use-window-gesture.test.tsx`（7） | 真 user-event 起始/移动/释放，平台 cancel/lostcapture/window blur/focus blur/unmount，每次恰好一次false；后续move无命令；负屏幕坐标/client变化/DPR2/新手势重置；点击/Enter/Space/右键/库方向键 |
| `features/session-bubbles/BubbleStack.test.tsx`（6） | ack前不展示/不扩区；收起先提交；过期expand/show、快速显隐及IPC拒绝；最后确认立即删除无退出DOM再释放；空快照/新working/隐藏偏好；上下strip；实际Motion opacity运行中几何不变及实时reduced-motion |
| `shared/ui/Tooltip.test.tsx`（2） | 实际Radix focus/aria-describedby/Escape焦点保留、延迟hover/leave/click/disabled；portal host位置/80尺寸。jsdom不验证实际像素包围框 |
| `main/index.test.ts`（+3） | handler返回前实际调用hit policy；reload/crash重置；原测试强化信任边界及last-snapshot仍保持到Renderer false |

开发中测试曾暴露 jsdom pointer capability 缺失（改为仅平台 shim）、Motion 卸载后最后一帧调度（允许排空20ms，再断言无持续 timer）、Radix disabled 从非受控切受控警告（改为始终受控）。最终无已知自动化失败；既有 Three ESM/CJS 测试警告不是本次新增生产重复渲染证据。

## 父会话浏览器证据与未验收项

父会话使用 native `agent_browser`，worker 未运行 browser shell 命令：

- localhost5174 受控 fixture dark80：tooltip实测 rect `(120,239.203,72,45.594)` 完全位于 pet `(116,222,80,80)`；文字可读，pointerEvents none，Escape清除内容。`docs/evidence/renderer-r3/fixture-dark-80-tooltip.png`。
- hover 可访问气泡从3→5；`fixture-dark-80-expanded.png` 是**hover对比度修复前**证据，不作为最终视觉通过截图。
- 父会话发现旧 hover rgba255,255,255,.24 覆盖了新基底（非动画或状态差异）。修复为 tokens 后，dark80 hover复验通过：`fixture-dark-80-hover-fixed.png`，错误卡片可读；实际 mouse-down 确认 active背景 rgba214,225,245,.96 / 字色 rgb37,48,71，随后释放。
- `fixture-light-140-collapsed.png` 为浅色140收起参考。上述截图均是真实 Renderer/Application fixture，不是真实 pi socket 或 OS 后方桌面。

**仍待验收：**气泡 presence/hit 到后方真实应用点击的完整路径、原生窗口移动中的screen/DIP关系与贴边反向全矩阵、原生失焦后后方真实应用点击、80/140/较大尺寸与四边/滚动/键盘全矩阵、不同系统 tooltip字形/放大、长时资源与性能。Windows/多屏DPI/休眠等保持R4待验收，不据本阶段测试宣称完成。

审查产物：`/tmp/agent-pet-r3-validation.txt`（命令日志与变更库存/截图hash），`/tmp/agent-pet-r3.patch`（完整当前文本diff含新文件，二进制截图单独审阅）。独立审查完成，以下两项发现已由父会话修复；新 Main 手势实测和用户穿透反馈已补充；其余R4缺口保留，仅本地阶段提交，不推送。

## 新 Main 的 Electron 复测

用户重启桌宠后，父会话连接9222 / localhost5174。首轮出现非预期窗口变化，用户确认同时在手动操作；该轮不作为键盘/失焦失败或通过证据。用户停止输入后重新采集：

- 原 anchor `(1660,496,140,140)`；CDP canvas拖动 `(-12,8)` 后 Main返回 `(1648,504,140,140)`。
- 缩放按钮拖动 `(10,10)` 后140→150；焦点保留在缩放按钮，ArrowRight后150→155，符合 Main取x/y平均值的约束。
- 再从实际 Lucide `path` 开始缩放10，捕获存在；注入 window blur 后捕获立即释放。随后再移动20并松开，尺寸仍为165，未继续缩放。该项是CDP输入+合成blur经过真实preload/Main，不等于操作系统切换焦点/后方点击验收。
- 调整80尺寸，DPR=2：Tooltip矩形 `(145,239.203,72,45.594)` 完全在宠物矩形 `(141,222,80,80)` 内，pointer-events=none，Escape后关闭。截图 `docs/evidence/renderer-r3/electron-80-tooltip.png`。
- 显隐按钮可切换；结束后恢复本轮原anchor `(1660,496,140,140)`、气泡显示偏好和单Canvas，移除测试临时变量，用户进程保持运行。

### 用户原生验收反馈

用户在上述复测后明确回复：“1. 气泡可以展开，2. 可以”。第二项对应此前要求的拖动后切换应用、透明区域能点击后方应用，记录为用户确认通过。用户没有单独明确反馈本轮点击确认及隐藏后残留区域，不能扩大解释；它们保留为R4专项（点击确认已有R2真实pi及持续自动化证据）。

## 独立审查修复

- 指针捕获目标由 `HTMLElement` 改为 `Element`，覆盖 Lucide SVG/path；DOM平台 shim 对齐浏览器的 Element API。新增真实 use-gesture 的 SVG 起点 blur/unmount 两例：修复前均因 capture 仍存在而失败，修复后均通过，interaction仍仅释放一次。完整114测试、typecheck、build、diff check重跑通过。
- 删除 BubbleStack CSS 中重复玻璃样式、重复定位及无消费者的旧 hashed selectors。GlassSurface重新成为唯一 filter/rim owner，避免覆盖 accessibility media rules。
- 真实浏览器 CSSOM 检查：默认5个气泡 computed backdrop-filter 均为 blur(16px) saturate(1.5)；临时激活共有的 `(prefers-reduced-transparency: reduce), (prefers-contrast: more)` media block 后均为none，随后恢复规则。这验证实际样式层叠，不等同于OS偏好设置实测；浏览器工具不支持这两种偏好的直接仿真。

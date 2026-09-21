# Renderer R4：有界清理与验收库存

## 结论与范围

基于干净 `main` 的 `11e590a`（R0–R3 已提交，114 项测试）。**本机有界验收与清理完成：真实 Electron reload 空根阻塞已修复并完成原始复现实机复验；当前显示器13项布局检查和3次文档资源短采样通过；用户最终确认本轮pi工作→完成→点击确认及隐藏气泡后穿透正常。跨平台、硬件功耗与长时稳定性矩阵仍未完成，不宣称所有平台的R4全面通过。** 自动化通过不关闭原生缺口。

用户在 R3 明确丢弃旧未提交 `style.css`；当前已提交 CSS Modules/tokens 是样式权威，不恢复旧 CSS。本文不增加 Agent、不改产品行为、不升级 Electron/工具链 major、不改 pi 配置/token、不向用户 socket 注入数据、不擅自重启用户进程；仅本地提交，不推送。父会话独占浏览器/原生采集与 `docs/evidence/renderer-r4/`；worker 只汇总其报告，不生成或修改该目录。

证据类型严格区分：**自动化**（真实被测模块，按测试注明平台替身）、**源码检查**（不等于运行通过）、**受控浏览器实测**（fixture 不是原生 OS）、**用户确认**、**原生容器实测**（CDP 输入不等于 OS 后方点击）、**待验收**。R0–R3 是历史证据，不能重标为 R4 新测量。

## 确认后的清理

| 项目 | 证据与处理 | 保持不变 |
| --- | --- | --- |
| 旧 bubble-model | `bubbleLabel` 只有旧单测消费者，实际 BubbleStack 使用中文状态 label；`visibleBubbles` 只是返回 `state.bubbles`，唯一生产消费者是 BubbleStack。删除旧 helper 文件及两项实现专属测试，直接复制/反转 `state.bubbles` | Application 的投影/未读权威、Session key、中文 label、排序、Main presentation-presence handshake 均不变；现有 App/BubbleStack 公共交互回归继续执行 |
| 迁移包装/旧渲染路径 | 源码确认 R1 scene effect 包装、旧 loader/mixer、手工 DOM 入口、旧 style.css 已在 R1–R3 删除；不重复重构活跃的 React/bridge/手势薄层 | 单 React root、单 R3F Canvas/loop、Drei loader/mixer；保留真实资产数据规则 |
| 依赖 | 检查 manifests、源 import、构建/类型/测试用途；未确认可删除的无用依赖，故不改 manifest/lockfile | React/Fiber 版本组合、显式 peer/type/CLI 依赖、Fiber 9.7.0 初始化补丁及 lock hash |
| 活跃 README | desktop 改正“没有真实 Adapter/没有扩展”、补齐 `index.html → main.tsx`、Modules/tokens、真实 pi opt-in 边界；adapter README 改正“未接 Main” | 明确 openSession unsupported、无自动安装/重启；不是新增 Agent |
| 历史文档 | R0–R3 加历史说明但不改写原测量；迁移计划标明旧 index.ts/style.css 是迁移前基线；PROJECT_PLAN 标明初始规划非当前实现清单 | 保留历史失败、旧 CSS hash、旧截图、当时未完成项；不删审计或原生风险 |

未发现其它足以证明应删除的迁移代码，不以清理为名重写业务或样式。发现的 reload 缺陷单独升级给父会话，不由 worker 猜测修改 Main 导航安全策略。

## 自动化验收矩阵（本轮已运行）

| 不变量/场景 | 本轮证据 | 边界/状态 |
| --- | --- | --- |
| 实际 pi 扩展 → socket → Adapter → Application | `integrations/pi-extension/bridge.test.ts`：working/completed、确认、改名/删名不复活、aborted→idle | **通过**；真实扩展函数+隔离临时 socket+合成 pi callbacks，不是运行中 TUI→UI；未使用用户 endpoint/token |
| running extension 重连 | `reconnect.test.ts` 既有 working→completed 重启回归 | **通过**；重启的是测试创建的 Adapter，不是用户桌宠/pi 进程 |
| 终态重连不重播 unread | 新增 stop/error 两例：先观察实际 completed/error unread，重建测试 Application/Adapter，不再触发 pi callbacks，等待扩展自身 retry/hello；相同 Session/work identity 为 idle，所有重连后发布快照均无气泡 | **通过**；补齐 R0 记录的重要集成缺口；断线期间完成、真实 TUI `/reload`、多真实 pi 进程仍不是此测试覆盖 |
| 气泡确认、working 保留、稳定焦点、更名、多 Session、显隐、提示计时 | App（17）、notification hook、bridge store、Domain/Application 既有行为测试 | **通过**；DOM/真实业务实现，WebGL/原生 bridge 有替身 |
| presentation-presence 与可见命中同步 | BubbleStack（6）实际 Motion + Main（当次9）mock Electron IPC tests：ack 前不 reveal/grow，缩小/删除先 commit，过期/失败处理，last snapshot 不提前释放，reload/crash reset | **通过**；本轮清理不改变协议；不等于 OS 调度/穿透全链路实测 |
| 手势与 Tooltip | 实际 use-gesture（9）：cancel/lostcapture/blur/unmount/SVG 捕获、增量坐标；实际 Radix（2）：hover/focus/Escape/disabled | **通过**；平台 shim，不能证明跨屏 DIP、OS 焦点与实际字形 |
| 模型动作与资源所有权 | PetModel（14）：四态、快速切换、重挂载/effect reactivation、共享缓存不 dispose、80/140/300/600 envelope/Bounds、clock pause/resume | **通过**；实际 GLB/Drei/R3F test renderer，无硬件 GPU/长期资源证明 |
| WebGL 初始化失败隔离 | `PetCanvas.webgl.test.tsx`：实际 Fiber Canvas，测量非零、WebGL context 不可用，失败提示且 controls/bubbles 可用 | **通过**；保留 `patches/@react-three__fiber@9.7.0.patch`，不以模型子树 throw 代替初始化路径 |
| preload/布局/可信调用边界 | preload、Main/layout、pi-config、protocol 既有回归 | **通过**；Electron/屏幕替身不等于 Windows 或负坐标/DPI 实机 |
| 开发态 page reload | 父会话发现下述真实阻塞；新增开发/打包入口的实际 Main handler 回归（2）在修复前失败，候选后通过 | **自动化及本机原始复现实测通过**；下文记录真实文档替换及Canvas恢复，非仅mock handler结论 |

### 命令记录

环境 Darwin arm64，Node **22.22.3**，pnpm **12.4.2**，Vitest **3.2.7**。

- `pnpm exec vitest run integrations/pi-extension/bridge.test.ts integrations/pi-extension/reconnect.test.ts`：2 文件 / **4 测试通过**。
- `pnpm test`：cleanup 初轮 **24 文件 / 114 测试通过**；纳入父会话导航候选后的最终重跑 **24 文件 / 116 测试通过**。相对 R3 删除旧 helper 的2项实现专属测试，新增2项实际终态重连回归和2项 Main 导航策略回归。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过；Main/preload/renderer、GLB、CSS Modules 打包。报告 renderer JS 3,095.91 kB、CSS 6.51 kB、GLB 4.16 kB；不是内存或性能预算。
- `pnpm install --lockfile-only --frozen-lockfile --strict-peer-dependencies`：通过，manifest/lockfile/补丁未改。
- `git diff --check`：通过。阶段暂存前无已暂存文件；仅本地阶段提交，不推送。
- `pnpm audit --json`：退出 **1**，仍 **36** 条（high9/moderate21/low6/critical0）；与 `/tmp/agent-pet-r3-audit.json` 的 advisory IDs 和完整 findings 相同。Electron（生产桌面 runtime，虽声明 devDependency）、extract-zip、Vitest/@vitest/mocker 风险未解决，不宣称安全验收通过或已评估应用可利用性。

WebGL 初始化回归仍输出既有 `Multiple instances of Three.js being imported`（测试 ESM/CJS 边界），未据此推断生产存在重复 Canvas。无 Vitest 未处理异常。纳入父会话 reload 候选后已重新执行全量 test/typecheck/build/frozen strict peers/diff check，均通过；Main 现为11项测试。用户重启Main后已执行真实Electron post-fix复验，详见下文；不由mock handler测试替代。

## R4 新原生证据与阻塞修复

### 确认的 reload 缺陷

1. 本轮 BubbleStack import 清理时，运行中的 Electron 出现空 `#app`。`docs/evidence/renderer-r4/electron-140-top-right.png` 是**空白失败/中间态证据**，不是140右上通过截图。
2. 源码：`main.tsx` 在 `beforeunload`/HMR dispose 无条件 `root.unmount()`；Main 在 `will-navigate` 无条件 `preventDefault()`。Vite7 full-reload 发起 `location.reload()`；单凭源码无法判定哪条路径触发空根，因此未作推测性生产修复。
3. 父会话随后在**无源码编辑**时确定性复现：初始 children=4、canvas=1、timeOrigin=`1789978168236.6`；记录 sessionStorage 的 beforeunload/pagehide/unload 后发起 `location.reload()`。结果 timeOrigin 不变，仅 beforeunload（children=0），无 pagehide/unload，canvas=0。证明 page 发起的 reload 被取消，但 React cleanup 已清空当前文档；不是仅凭 HMR 猜测。
4. **修复已实现并通过后续原生复验**。父会话独占修改 `main/index.ts` / `main/index.test.ts`：开发入口先规范化为 URL，打包入口用 `pathToFileURL`；只允许 `event.url === rendererUrl`，继续拒绝不同 path/query/hash/origin/protocol，保留 unload cleanup；不是放开任意同源导航。父会话报告两项实际 Main handler 测试先红后绿，worker 随后全量116项/typecheck/build/frozen strict peers/diff check通过。用户重启Main后，同一 `location.reload()` 复现得到 beforeunload→pagehide→unload 完整序列；timeOrigin 从 `1789978858965.6` 变为 `1789978896815.7`，新文档 children=4、canvas=1。再连续刷新两次仍为单Canvas、两个操作按钮，文档标识均改变。原始取消reload空根阻塞关闭；证据 `reload-result.json`，不把其它导航场景或长期稳定性一并判为通过。

### 本轮已回报测量

| 类型 | 场景 | 结果与限制 |
| --- | --- | --- |
| 原生容器实测（新 R4） | 80、top-left | 父会话报告通过：workArea `(0,40,1800,1129)`、DPR2、bounds `(0,40,306,352)`、canvas80。只证明这一当前显示器角落/尺寸，不推广为完整多屏DPI矩阵 |
| 原生容器失败（新 R4 初轮） | 140、top-right | `electron-140-top-right.png` 是修复前空根证据；该轮随后恢复 `(1660,440,140,140)` 并重新打开页面 |
| 原生布局断言（修复后） | 当前显示器 80/140/300 × 四角 + 600右下，共13项 | 全部Main bounds位于workArea `(0,40,1800,1129)` 内，实际canvas尺寸等于请求值，DPR2；使用真实IPC而非物理指针。结果 `geometry-results.json`；本轮重启后的原anchor `(100,300,140,140)` 已恢复 |
| 原生画面（修复后） | 80左上、140右上、300左下、140右下 | `electron-80-top-left-final.png`、`electron-140-top-right-final.png`、`electron-300-bottom-left.png`、`electron-140-bottom-right.png`；当前idle/透明背景单时刻，无活跃气泡，不等于所有动作/背景通过 |
| R3F短时资源（修复后） | 同一Electron，140尺寸，DPR2；初始及两次reload后各2秒 | 3次均canvas1/root1/frame subscribers2/geometries1/textures0/programs1；各约2秒240帧≈120fps。`resource-samples.json`。这是页面内当前资源计数，不能证明旧GPU上下文/驱动资源已全部释放，也不是长期无泄漏结论 |
| 进程CPU/RSS短测 | 3.041秒，当前Electron进程树 | Main0.66%、GPU Helper5.59%、Renderer3.95% CPU，相对一个逻辑核；RSS分别154192/111232/224272KiB。`process-sample.json`。GPU Helper CPU不是GPU硬件利用率，RSS一次采样不是泄漏/预算结论 |

### 本轮用户最终验收

在新Main修复与上述布局/刷新检查完成后，父会话明确请用户运行一次pi简单任务，确认工作→完成→点击确认，以及隐藏气泡后后方应用仍能点击。用户回复“确认没问题”。这两项记录为 **R4用户实机确认通过**；不扩大为Windows、多屏、真实重连/改名/取消或长期稳定性均通过。

## 历史证据：不冒充 R4 新采集

| 类型/来源 | 已知事实 | 不代表什么 |
| --- | --- | --- |
| 用户确认，R1 | 真实 pi 气泡出现、状态转换正常 | 非 R4 新 TUI 端到端验收 |
| 原生容器实测，R2 `RENDERER-R2-R3F.md` | 真实 pi completed 气泡点击后消失；CDP drag/resize 经实际 preload/Main，随后恢复布局 | CDP 不证明透明区域 OS 后方应用点击 |
| 用户确认，R3 `RENDERER-R3-INTERACTIONS.md` | “气泡可以展开”；拖动后切换应用、透明区可点击后方应用 | 未单独确认隐藏/最后确认后的残留区域；不覆盖所有显示器/Space |
| 原生容器实测，R3 | CDP拖动/缩放、ArrowRight、SVG捕获后合成blur、80/DPR2 Tooltip包含与Escape | 合成blur不是 OS 焦点切换；不是新 R4 数据 |
| 受控浏览器，R2/R3 | 四态单时刻 WebGL、dark80/light140、Tooltip、hover/active；R3 CSSOM临时激活高对比/减透明度规则生效 | 非 OS 偏好实测、非完整动作周期画面；R0–R2 CSS不同，不能做像素等价基线 |
| 浏览器短测，R2 | success140/DPR1，2001.2ms 中120帧≈59.96fps；geometries1/textures0；真实切后台600ms零帧，前台600ms36帧 | 不是 R4 FPS/后台新测量、不是 macOS Space/休眠 |
| 原生进程短测，R2 | 3.045s采样 Main≈0.66%、GPU Helper≈6.24%、Renderer≈3.61% CPU（相对单逻辑核） | GPU Helper **CPU不是硬件GPU利用率/显存/功耗**；无同条件R1对照，不证明省电/预算 |

## 明确待验收/不能推断通过

- 原始reload阻塞已关闭；其它取消导航、完整HMR故障恢复与更长周期重载仍不能仅凭这次修复推断。
- 真实重连/更名/取消/多轮、多个真实 pi 进程与 `/reload` 身份连续性；本轮pi工作→完成→点击确认已获用户确认，但不替代这些扩展矩阵。
- Windows（含命名管道安全/权限）、多显示器负坐标/DPI切换、显示器断开、休眠恢复、全屏 Space、置顶全矩阵；缺设备/未测即待验收。
- 80/140/较大尺寸、浅/深/高对比背景、四边、多气泡滚动/键盘、所有动作完整周期与可见边界；有限截图/投影测试不是完整视觉验收。
- Main presence/hit→OS 后方点击的快速展开收起、拖动/原生失焦/取消各区域全组合；本轮隐藏气泡后的后方点击已获用户确认，不能推广为所有时序/场景均通过。
- 更长周期reload/unmount的事件监听/计时器/动画/驱动WebGL资源增长，长时soak、真实硬件GPU/功耗、同条件性能对照；已测3个文档的当前R3F计数一致，仍不能证明长期无泄漏。可见帧率随显示器刷新达到120fps，高于旧30fps上限，尚无同条件功耗预算结论。
- 既有36项审计风险仍在；不在本阶段擅自升级工具链或执行 audit fix。

## 审查交付

`/tmp/agent-pet-r4-validation.txt` 保存有界命令日志、依赖用途与变更库存；`/tmp/agent-pet-r4.patch` 保存文本diff（含新验收文档，不含父会话二进制截图）。原始 audit 为 `/tmp/agent-pet-r4-audit.json`。父会话新证据位于 `docs/evidence/renderer-r4/`，只按实际生成与回报内容验收。独立reviewer已审查清理、精确入口导航修复及回归测试，未发现新的代码问题；当时保留的真实reload阻塞随后经父会话原始复现实测关闭。本机有界交付不等于跨平台R4完成，上述待验收清单继续有效。

# Renderer R2：R3F / Drei 接管 3D

> 历史阶段记录：下文的代码路径、CSS 保护、测量与待验收状态均对应该阶段，未改写为 R4 新证据。当前状态见 [R4 验收库存](RENDERER-R4-ACCEPTANCE.md)；用户在 R3 已明确丢弃旧未提交 CSS，当前已提交 CSS Modules/tokens 为权威。

## 范围与结论

基于 R1 `660d0ec49c3c9306e33ad204a59004c93dd2e5e3`。仅 R2：Canvas、Drei GLB/动画/取景、相关依赖/测试/文档；不改 Main/preload、pi 配置/协议、Electron、R3 手势/Motion/Radix。本阶段仅本地提交，不推送；没有重启用户进程。

**自动化通过；父会话真实 WebGL 四态加载冒烟通过，Electron preload/Main 交互冒烟通过，完整 OS/性能验收仍有缺口。** 不将 Node 相机投影测试或单张截图写成完整 GPU 动画周期/OS 验收。

用户 `apps/desktop/src/renderer/style.css` 从开始至最终检查保持原样、未暂存：
`94b27018408011e96d3d25479906c9a18236a1ec388d0a58d28c9b94b0f553a1`。
默认 140、最小 80、上限 600 及 Main 权威像素区域不变。

## 实现与所有权

- `PetCanvas` 使用唯一 R3F Canvas，删除 `pet-scene.ts` 的 WebGLRenderer/手工 RAF/fetch/ResizeObserver 包装。Canvas 内只有 Drei 的 frame subscribers，无另一个 RAF、mixer.update 或自制 demand invalidation 循环。
- `.pet-canvas` / dragging class 现在位于 Canvas 外层原生 DOM surface，因为 Canvas 自带测量 div。Main rect 和原生 pointer handlers 应用在该 surface，真实 canvas 填满区域；沿用原 `useWindowGesture`，没有改 R3 的取消/失焦策略。DOM 测试仍从实际 canvas 发 pointer 事件，经冒泡验证屏幕 delta、释放和 resize IPC。
- `useGLTF(starterUrl, false, false)` 加载 Vite 打包的本地 GLB，不启用远程 Draco/Meshopt decoder。Suspense 显示加载提示；局部 error boundary 显示失败提示，只卸载 3D，不卸载气泡或 toolbar。错误后重新打开窗口恢复，不引入重试产品 UI。
- `PetModel` clone 当前非 skinned GLB 的对象层级，实例独占 transforms；geometry/material/texture 仍属于 useGLTF URL cache。`primitive dispose={null}` 明确禁止释放共享资源。没有手动 clear GLTF cache 或 dispose 共享材质；卸载时停止当前 action，Drei 清理 frame subscription 和 actions，实例/mixer 失去引用后由 GC 回收，缓存资源在当前 renderer 页面生命周期内复用。并未声称 GPU 长期资源增长已实测。
- 单个 effect 选择 action：working > error > completed > idle（原 `selectPetMotion`）；对应 Work/Error/Success/Idle。缺可选 clip 回退 Idle，缺必需 Idle 抛加载错误。切换先 stop 旧动作再 reset/play 新动作，不保留持续推进的淡出动作；无第二个动作控制器。
- `Bounds.refresh(envelope).clip().fit()` 负责 camera 距离/朝向/裁切平面，尺寸变化重新取景。初始 camera position 仅是 helper 的观察方向种子；未对模型补 scale。包围范围使用本地资产已知的 **Pet 根节点 LINEAR translation** 的 keyframe 极值并集，包括 Success 跳跃，非 bind-pose-only。对未来 rotation/skinning/cubic/nested tracks 明确拒绝，不冒充自定义资产通用取景器。
- 当前 bind-pose 高度 2.215，完整动画 envelope 高度 2.515（增加约 13.54%）；Bounds margin=1.2。相较 R1 固定相机 + scale=1.1，画面内宠物更小是保留整个动作空间的结果，不是改变 Main 的 80/140 等像素区域。具体屏幕像素占比仍以实机采集为准。
- `Canvas flat` 保持原 WebGLRenderer 的 NoToneMapping / sRGB，灯光颜色、位置、强度沿用 R1。初次父会话截图发现 R3F 默认 ACES 色调偏灰，阅读 source 后改为 flat；没有用颜色/scale 补丁掩盖问题。
- frameloop：可见 `always`（显示刷新节奏，非原 30fps 上限），document.hidden 时 `never`。R3F setFrameloop 停止/重启自身 clock，恢复不会累计隐藏时长。DPR 仍限制到 2。此选择保证持续动画，**不声称节能或达到 CPU/GPU/FPS 预算**。
- 删除 `packages/pet-runtime/src/model.ts` / `./model` export 及仅测旧 loader/mixer 的测试；删除无消费者 `loadPetModel` / `createPetScene` 和包内 Three 依赖。保留 manifest 数据规则及实际由 PetModel 消费的 `animationForStatus`；PetMotion 移到纯数据主 export。
- dev-only fixture 支持白名单 `motion=idle|working|success|error`，`size=80|140|300|600`；未知值回退混合数据/140。保留 theme、position。只驱动本地真实 Application，不向任何用户 socket 发送假事件，不进入生产构建入口。

## 生命周期缺陷：已复现并修复

父会话首次 fresh navigation（success140 与 idle80）报告：加载失败、canvas=0、controls=2，`Cannot set properties of undefined (setting '_cacheIndex')`。失败截图 `docs/evidence/renderer-r2/fixture-success-140.png` **不是通过证据**。

原因是实现初稿在 effect cleanup 中额外 `mixer.uncacheRoot(root)`，而 Drei useAnimations 的 lazy action cache 在 effect reactivation 时仍可能保留这些 action。Three 0.177 的 binding 已从 mixer 移除，旧 action 再 play 触发 `_lendBinding` 对已不存在项写 `_cacheIndex`。删除额外 uncache，保持单一 Drei mixer/cache owner。也采用稳定 `{ current: root }` ref，以避免 Node ESM/CJS Three Object3D `instanceof` 身份差异；未替换实际 useAnimations。

新增 React Activity 的 **同实例 effect cleanup/setup** 回归（Activity 仅存在测试，不是生产 UI）。临时恢复旧清理后此测试精确复现相同 `_cacheIndex` 错误；删除后通过。红灯输出保留 `/tmp/agent-pet-r2-strictmode-regression.txt`。RTTR 嵌套 StrictMode 单独没有触发该 cleanup probe，故没有假称它足够；使用 effect-reactivation 回归及父会话实际 StrictMode 页面一起验证。

## 精确依赖、engine、license 与审计

环境：Darwin arm64，Node 22.22.3、npm 10.9.8、pnpm 12.4.2。保留 React/react-dom 19.2.8、Three/@types/three 0.177.0、Electron 36.9.5、Vite 7.3.6、Vitest 3.2.7。

安装前通过 `pnpm view <package>@<version> version peerDependencies engines license --json` 读取 registry 元数据，并阅读安装包 manifest/source：

| 新直接包 | 精确版本 | peer | engine / license |
| --- | --- | --- | --- |
| @react-three/fiber | 9.7.0 | React/DOM >=19 <19.3，Three >=0.156 | 未声明 engine；MIT |
| @react-three/drei | 10.7.8 | React/DOM ^19，R3F ^9，Three >=0.159 | 未声明 engine；MIT |
| @react-three/test-renderer（dev） | 9.1.0 | React ^19，R3F >=9，Three >=0.156 | 未声明 engine；MIT |

R3F 的 Expo/React Native peers 是 optional，没有安装原生移动栈。严格 frozen-lockfile peer 检查通过。新 lock package records 52 个，安装 manifest 的 license/engine 库存在 `/tmp/agent-pet-r2-dependency-inventory.txt`：MIT/Apache-2.0/ISC/BSD-3-Clause；webgl-constants manifest 未声明 license，已实际读取其随包 `LICENSE` 为 MIT。camera-controls 3.1.2 要求 Node >=22 / npm >=10.5.1，当前环境满足；其它声明的 Node 下限也满足。Drei 自带传递 `@use-gesture/*`、Zustand、媒体 helpers；不是 R3 安装/采用手势框架，本阶段没有 import/使用那些交互功能或新增全局 UI store。

`pnpm audit --json` 安装前、安装后均退出 1：**36 advisory IDs：high9 / moderate21 / low6 / critical0，逐项 findings（版本/路径/dev）完全相同，无本次新增 advisory**。原始输出 `/tmp/agent-pet-r2-baseline-audit.json`、`/tmp/agent-pet-r2-audit.json`。原有 Electron（实际桌面 runtime，虽在 devDependency）、extract-zip、Vitest/@vitest/mocker 风险未修复；不将预存漏洞归因于 R3F，也不宣称无漏洞。未执行 audit fix 或越界升级 Electron。

## 实际阅读的官方安装包 API/source

以下均来自精确已安装版本，而不是根据 API 名称猜测；`node_modules/.pnpm/<versioned-package>/node_modules/` 前缀省略：

- `@react-three/fiber/dist/declarations/src/web/Canvas.d.ts`、`dist/react-three-fiber.esm.js`：Canvas div/canvas DOM、测量、children error 向外抛出、Canvas 卸载。
- `@react-three/fiber/dist/events-156d8d12.esm.js`：`setFrameloop`（约1087行）clock stop/start；primitive/dispose=null 规则（约15218–15238）；flat→NoToneMapping / 默认 ACES、sRGB（约15902）；循环按 frameloop 判断执行。
- `@react-three/drei/core/Gltf.js` / `.d.ts`：useGLTF→useLoader、缓存与 decoder 开关；`core/useAnimations.js`：lazy actions、一个 useFrame mixer.update、stopAllAction cleanup；`core/Bounds.js`：refresh(Box3)、fit/clip、margin、maxDuration、camera/size 行为。
- `three/src/animation/AnimationMixer.js` / `AnimationAction.js`：stop、reset/play、uncacheRoot、binding cache 生命周期；`three/src/core/Object3D.js` / `objects/Mesh.js`：对象 clone 与共享 geometry/material。
- `@react-three/test-renderer/README.md`、`dist/declarations/src/types/public.d.ts` 与实现：create/update/unmount/advanceFrames，真实 reconciler 但无真实 WebGL；测试不将其当 GPU 验收。
- `@types/react/index.d.ts`：useSyncExternalStore、Suspense/error boundary 生命周期和测试使用的 Activity。

## 自动化结果

- `pnpm test`：**22 文件 / 94 测试通过**（R1 88，删除旧实现专属12，新增18）。真实 pi extension→socket→Application 与 reconnect 既有回归继续通过。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过。GLB 4.16 kB、本地 emit；renderer JS 构建报告约2635.77 kB（R1约1.86MB；不是运行时内存或网络性能测量）。
- `pnpm install --lockfile-only --frozen-lockfile --strict-peer-dependencies`：通过。
- `git diff --check`：通过；阶段暂存前无已暂存文件；受保护 CSS hash 未变。

新增 `features/pet/PetModel.test.tsx`（14）：实际解析 GLB、实际 Drei useAnimations/Bounds、四个动作的数值姿态、快速切换、卸载停止 frame subscription、共享几何/材质不 dispose、缓存模型不被改动、重挂载、缺可选/必需动画、同实例 effect reactivation、80/140/300/600 完整 envelope 的相机投影、完整 success 周期的几何包围范围、运行中尺寸更新、真实 R3F clock pause/resume 的小 delta。仅 useGLTF 的网络/cache 返回被替换，非 WebGL 测试。

更新 App DOM 测试（14→17）：移除旧 scene 私有 owner 断言，保留 canvas 发起的公开拖动/缩放与 Main layout/桥接/气泡回归；新增 Suspense loading、模型错误仍可点气泡和 toolbar、StrictMode visibility listener 数量及 frameloop 选择。替换 WebGL boundary，不把 jsdom 当 GPU。

## 父会话浏览器证据及剩余验收

父会话使用 native `agent_browser`，worker 未运行任何 shell browser automation：

- 修复后 fresh success140：一个 canvas、两个 controls、无失败提示，`fixture-success-140-fixed.png` 为 **生命周期修复后、flat 色调修复前**截图。
- idle80、working300、error140 四态分别加载通过；`fixture-idle-80-dark.png` 为 flat 修复前色调，`fixture-working-300.png` / `fixture-error-140.png` 为修复后观察。error140 的 canvas 与 wrapper 实测同一 rect `(86,222,140,140)`。
- 最终 flat 色调截图：`fixture-idle-80-dark-final.png`、`fixture-success-140-final.png`；前述非 final 文件保留为开发中状态证据，不混淆版本。
- Electron 9222 / localhost5174：旧页面在实时迁移期间出现空根，重新导航 root 恢复，没有重启进程。`electron-pi-completed-140.png` 显示真实 pi completed 气泡和宠物；工具点击该真实 completed 气泡，下一次 snapshot 已消失（补齐 R1 的真实确认专项缺口）。
- 同一真实 Electron：CDP 鼠标在嵌套 canvas 拖动 `(12,8)`，Main anchor 恰好变化 `(12,8)`，释放后 dragging class=false。真实 resize button 拖动 `(10,10)`，140→150；采集后恢复原 anchor `(2183,1116,140,140)`，一个 canvas、无提示。此证据经过实际 renderer/preload/Main，不证明 OS 后方应用收到穿透点击。
- 父会话通过已安装 R3F `_roots.get(canvas).store` 只读计数：success140 / DPR1，2001.2ms 内 `gl.info.render.frame` 增加120，约 **59.96fps**，frameloop=always，memory geometries=1 / textures=0。这是一次真实短时帧率/资源数量观测，不是 CPU/GPU 时间或长期泄漏检测。相较 R1 手工30fps上限，可见时刷新节奏增加；能耗/CPU预算仍未验证。
- 以上截图都是单时刻，不证明完整周期/跳跃无裁切；自动化投影/几何测试与实机画面证据分开记录。

补充实测：独立浏览器标签页实际切到后台，visibility=hidden，R3F frameloop=never，600ms 内渲染计数增加0；切回前台，frameloop=always，600ms 内增加36帧。没有伪造 document.hidden；测试监听器和临时变量随后移除。这是浏览器标签页结果，非 macOS Space/休眠验收。

只读采样真实 Electron 9222 所属进程树，3.045秒区间的进程 CPU 时间增量：Main约0.66%、GPU Helper约6.24%、Renderer约3.61%、其它Helper约0%（均相对一个逻辑核）。GPU Helper 的 **CPU 使用率不是 GPU 硬件利用率/显存/功耗**；无同条件 R1 对照，不能据此判定资源预算已达标或省电。

仍待后续验收：R2 原生显隐专项、GPU硬件/功耗与同条件性能对照、长时间资源增长、OS 后方点击穿透、真实 pi 持续状态切换矩阵。Windows、多屏负坐标/DPI、休眠/显示器断开/全屏 Space 保留 R4 待验收。不以此阶段测试关闭这些缺口。

## 独立审查阻塞修复：WebGL 初始化失败

审查发现 Fiber 9.7.0 的 web Canvas 在 async `run()` 内 await `configure()`，但调用处未 catch；Three 的 WebGLRenderer 构造异常发生在子树 error boundary 安装前，外层 React boundary 无法捕获这个 Promise rejection。

新增 `PetCanvas.webgl.test.tsx`，挂载真实 App/Fiber Canvas，提供非零测量尺寸，令 canvas WebGL2 context 返回 null。修复前确实失败：失败提示为空，Vitest 报1个未处理 rejection `Error creating WebGL context`（`/tmp/agent-pet-r2-webgl-red.log`）。没有 mock Canvas 或用 PetModel throw 替代初始化路径。

通过 pnpm patch，为固定 `@react-three/fiber@9.7.0` 的 ESM/CJS dev/prod 三份 web Canvas 入口各增加 `run().catch(setError)`，复用其原有错误状态向 React boundary 传播。补丁、注册配置与 lockfile hash 一并版本化；维护与移除条件见 `patches/README.md`。修复后上述回归验证失败提示、气泡/按钮可用、监听与 ResizeObserver 清理，通过且无 Vitest 未处理异常。测试环境报告 ESM/CJS 多份 Three 的警告，不把它当作生产重复加载证据。

浏览器复验：通过仅测试浏览器的 init-script 令 WebGL context 返回 null。用户旧 dev 的预打包依赖仍返回旧行为；没有清缓存或重启用户进程，另启独立 Vite fixture 服务（新 cache，127.0.0.1:5199）验证实际补丁。页面显示失败提示、1个working气泡、2个控制按钮，初始化脚本捕获的 `unhandledrejection` 列表为空。React dev 仍向控制台/错误事件报告已捕获的 context 错误，不能声称控制台完全无错误。截图 `webgl-unavailable-contained.png`。用户 dev 后续需重启以加载补丁；正常 WebGL 的后续隐藏/恢复检查也使用该独立服务。

## 独立审查产物

`/tmp/agent-pet-r2-validation.txt`：有界命令结果、变更库存、CSS/staging 检查及截图 hash。
`/tmp/agent-pet-r2.patch`：文本 diff，包括新文件，**排除用户 CSS 与二进制截图**。截图由父会话生成，在 `docs/evidence/renderer-r2/` 单独审阅。原始审查阻塞已按上文补丁与真实失败回归关闭；补丁后重跑94项测试、typecheck、build、frozen strict peers及diff check通过。本地阶段提交排除用户CSS；未推送。GPU/功耗、原生穿透和长期资源验收仍未关闭。

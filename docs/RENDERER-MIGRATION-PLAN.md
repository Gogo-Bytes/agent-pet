# Renderer 迁移实施计划

状态：R0–R3 已交付；R4 本机有界验收与清理完成，详见 [RENDERER-R4-ACCEPTANCE.md](RENDERER-R4-ACCEPTANCE.md)。Windows/跨平台、硬件功耗与长期稳定性仍待验收，不宣称全矩阵通过。以下阶段设计与迁移前基线保留为历史计划，不代表当前目录/依赖状态。

当前 Renderer 入口为 `main.tsx`，React + R3F/Drei + CSS Modules/tokens 已接管。用户在 R3 明确丢弃旧未提交 CSS；当前已提交 Modules/tokens 为权威，不再保留或恢复旧 `style.css`。R0–R2 的旧 CSS 保护说明仅记录当时行为。

## 目标与范围

将手工 DOM 和命令式 Three.js Renderer 迁移到组件化前端。维持 pi 路径，用户明确确认前不开发其它 Agent。

保留 Electron main/preload、Application/Domain、pi bridge 和 GLB 资产。迁移不重写业务状态机，不修改用户 pi 配置，不顺便升级 Electron，不增加新建会话/语音等控制能力。每阶段只本地提交，不推送。

成熟依赖优先：已有生态能力直接使用；仅编写业务规则、跨进程连接和薄的设计组件。禁止同时维护两套模型加载器、渲染循环、图标库或手势框架。

## 迁移前现状与保护（历史基线）

- Renderer 的 `index.ts` 同时承担 DOM、订阅、通知、手势、模型和动画；`style.css` 混合多个业务区域。
- `electron-vite` 已提供 Vite；无需再建一套桌面构建系统。
- 根 tsconfig 只收集 `.ts`，迁移需纳入 TSX、JSX 转换和 CSS Modules 类型，并区分 DOM 与 Node 边界。
- Main 是屏幕布局、窗口移动、缩放和点击穿透的权威；浏览器布局库不能替代 OS 工作区约束。
- 规划时发现 `apps/desktop/src/renderer/style.css` 有用户未提交修改。开始 R0 时读取并保留，按当前工作区建立视觉基线；不得覆盖或未经确认混入迁移提交。

## 依赖选择与兼容性（规划时）

规划时通过 npm registry 元数据核实，以下是当时的候选组合；实际安装/验证结果见各 R0–R3 阶段记录及 lockfile：

| 能力 | 候选 | 使用边界 |
| --- | --- | --- |
| UI | react/react-dom 19.2.8 | 同版本安装；StrictMode 下验证订阅清理 |
| 3D | @react-three/fiber 9.7.0 | peer React >=19 <19.3，不能直接装 React latest 19.3 |
| 3D helpers | @react-three/drei 10.7.8 | peer React ^19、R3F ^9；useGLTF/useAnimations/Bounds/Center 按需 |
| 底层 | three 0.177.x、对应 @types/three | 当前版本满足上面 peer；迁移期不另升级 |
| React 构建 | @vitejs/plugin-react 5.2.0 | 兼容当前 Vite 7；不采用要求 Vite 8 的 6.x |
| 图标 | lucide-react | 导入具体图标，不整库注册；替换手写 SVG/文字箭头 |
| 手势 | @use-gesture/react 10.3.1 | 生成移动/缩放命令，Main 做校验和约束 |
| 动效 | motion（React 19 兼容版本） | DOM 堆叠/列表过渡，不控制 3D 动画混合器 |
| 无障碍 UI | @radix-ui/react-tooltip 1.2.16 | 用于图标提示；不安装整套组件库 |
| DOM 测试 | Testing Library + user-event + jsdom | React 19/Vitest 3 兼容版本安装时验证 |
| 3D 测试 | @react-three/test-renderer | 核实与 R3F 9 的兼容性后按需要引入 |

每阶段安装时记录准确 lockfile、检查 peer/engine/license，阅读所用 API 官方说明。稳定版本不等于无漏洞，依赖安全审查也是选型条件。React/R3F 升级联动，不各自追 latest。

暂不引入 Redux/Zustand（订阅快照和少量 UI 状态尚不需要）、Tailwind（CSS Modules 足够）、重型后处理/远程 HDR（常驻桌宠资源预算）。CSS 玻璃不能保证模糊 Electron 后方桌面，不以增加 shader 掩盖原生限制。

## 业务目录与所有权

```text
apps/desktop/src/renderer/
  app/
    App.tsx
    bridge/                 # 窄客户端、快照订阅、布局订阅
  features/
    pet/                    # PetCanvas、PetModel、动作选择、拖动
    session-bubbles/        # BubbleStack、SessionBubble、展开与确认
    pet-controls/           # Toolbar、显隐与缩放
    notifications/          # 临时提示、计时清理
  shared/
    ui/                     # GlassSurface、IconButton、Tooltip 薄封装
    styles/                 # tokens.css、globals.css
  main.tsx
```

- 组件样式在对应 `.module.css`，玻璃、颜色、间距、描边和动效时长集中为 tokens。
- PetCanvas 的实际像素区域由 Main layout 决定，Bounds 只解决模型在 Canvas 内取景。动画最大包围范围要验证，不能让跳跃动作裁切。
- Renderer 只导入 renderer-safe 类型。OverlayLayout 等共享协议从 main 实现文件提取到明确的契约位置，不建立 renderer 对 main 的运行时依赖。
- Session snapshot 由 Application 提供；React 不建立第二套未读状态。展开、hover、可见性属于 UI。
- 不急于创建 `packages/ui`；只有真正存在第二个消费者才抽成 workspace 包。

## 阶段 R0：迁移基线与测试

交付：当前行为清单、受控测试数据、稳定的 bridge 测试替身、深浅背景及屏幕边缘的参考截图。

测试边界：Session 气泡公开交互、Main layout/命中接口、真实扩展→socket→Application 链路、模型动画。DOM 组件采用用户事件而非私有函数测试；不将 mock bridge 的通过当原生 Electron 验收。

基线覆盖：pi working/completed、确认与改名、多个 Session、重连；叠放/展开/滚动；hover 操作栏；拖动/缩放；外置气泡避让；点击穿透；提示自动消失；GLB 四种动画。保留用户已验收值（宠物默认 140、最小 80）和当前未提交 CSS。

完成条件：现有测试/typecheck/build 通过；已知失败明确列出；新增测试能捕捉代表性行为回归。避免以字符串检查源码替代交互测试。

## 阶段 R1：React 接管二维 UI

安装 React、类型、React Vite 插件、Testing Library、Lucide；新增 TSX 配置。

- React root 接管气泡、操作栏、通知；使用 useSyncExternalStore 或等效的单一订阅适配器。
- 订阅先建立再请求初始快照，保持 snapshot 引用稳定，卸载/StrictMode 重挂载不泄漏监听。
- 临时通过单个 effect 封装现有 3D 场景；不复制实现，不增加第二个 Canvas。
- 更名/状态更新使用稳定 Session key，避免 replaceChildren 导致焦点丢失。
- 维持当前视觉，不把审美改版混入这一步。

完成条件：DOM 测试覆盖确认、working 点击不消失、堆叠展开、隐藏、提示计时清理；真实 pi → UI、窗口拖动/缩放无回归。旧手工 DOM 入口删除。

## 阶段 R2：R3F + Drei 接管 3D

安装匹配的 R3F/Drei；Canvas 替代 WebGLRenderer 与手工 RAF。

- useGLTF 加载本地打包 GLB；useAnimations 管理 clips/actions，保留状态优先级及 Idle fallback。
- Suspense 与错误边界分别处理加载和失败，模型失败不卸载气泡/工具栏。
- 用 Bounds/Center/PerspectiveCamera 等适合的 helper 取景，避免固定 camera + 手动比例补丁。
- 保持单一动作控制点；切换动作清理旧 action，结束/卸载不继续推进动画。
- 正确处理 useGLTF 共享缓存与实例资源所有权：不手动 dispose 缓存中的共享材质导致重挂载失效。核实 primitive 与缓存资源释放规则。
- 选择合适的 frameloop；有动画时推进、隐藏时暂停。不能盲目同时叠加 RAF 或 demand invalidation 循环。测量实际帧率/CPU/GPU，而非凭配置宣称省电。

删除旧 renderer 场景创建、旧 `parseBundledPet` 路径和无消费者的手写 loader/mixer；保留资产规范中真正仍使用的纯数据逻辑。调整测试以验证公共行为，不保留只为旧实现存在的测试。

完成条件：GLB 正常加载、四态动画、快速切换、尺寸变化和重挂载正常；浏览器 WebGL 冒烟 + Electron 实机证据齐全。

## 阶段 R3：生态交互与统一设计系统

按需安装 use-gesture、Motion、Radix Tooltip。

- use-gesture 接管手势，屏幕坐标/DIP 映射保留验证；Main 更新边界后使用权威结果，不累积被 clamp 的陈旧偏移。
- 取消/lost capture/失焦都释放 interaction，防止永久挡住后方应用。
- Motion 动画区域与 Main 命中矩形同步；退出动画期间仍可见的区域不能提前穿透。
- Tooltip portal 必须在原生窗口可见范围内，不能假设 DOM portal 能越过 OS 窗口。
- GlassSurface/IconButton 统一两种背景下的对比度、细线图标、圆角、高光、hover/focus/disabled。
- 保留 reduce-motion、键盘操作和清晰焦点。设计变化逐项实测，不以单测通过代替视觉验收。

完成条件：功能、视觉和原生命中一起验收；手写 SVG、重复手势与临时 CSS 覆盖删除。

## 阶段 R4：集成验收与清理

- pi 真实状态全链路再次验证，保留自动化 socket 回归。
- macOS/Windows：多显示器、负坐标、DPI、贴边、显示器断开、置顶、休眠恢复。
- 明亮/深色/高对比背景，80/140/较大尺寸，多气泡滚动与展开收起。
- 检查事件监听、计时器、动画和 GPU 资源在重载/卸载后无持续增长。
- 移除迁移包装、死代码、无用依赖和失效文档。

无法在当前设备完成的 Windows、全屏桌面等验证保持待验收标记，不写成通过。

## 每阶段交付与回滚

至少运行 `pnpm test`、`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`，阶段增加的 DOM/WebGL/原生验证另列。

阶段提交只包含本阶段文件与 lockfile，不改用户 Agent 配置，不擅自重启正在工作的 pi，不推送。上一阶段仍可运行；回退通过明确的阶段 revert，不 reset/覆盖用户工作区。

实施顺序固定为 R0 → R1 → R2 → R3 → R4。若发现兼容性或渲染生命周期问题，先解决当前阶段，不跳到其它 Agent 接入。

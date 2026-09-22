# 管理窗口：统一 Radix Themes 组件

基线 `35de4b4`。管理窗口整体迁移至固定直接依赖 `@radix-ui/themes@3.3.0`，不是仅替换滑块，也不是给旧自绘控件套外观。自动化验证、独立审查及主会话有限浏览器检查完成；macOS 原生验收尚未完成。验证后创建本地阶段提交，不推送。

## 所有权与入口

- `apps/desktop/src/renderer/management.html` → `management/main.tsx` → `ManagementApp.tsx`。该入口独占 `@radix-ui/themes/styles.css`，`ManagementApp` 提供唯一根 `Theme`。管理入口不再引用桌宠 glass tokens。
- `ManagementApp`：导航、应用偏好、登录项展示及异步状态所有权。
- `PiPreflightPanel`：P2a 检测/选择/检查能力调用及请求序号；不增加能力、自动读取或安装行为。
- `PetSizeControl`：尺寸草稿、已提交串行队列、取消与外部确认值协调。
- `management.css`：只保留应用栏布局、窄窗口断点、路径换行、隐藏边界和稳定尺寸/状态槽。不再定义按钮、checkbox、radio、滑块轨道/拇指、卡片、提示框或字体设计系统。
- Main、preload、共享 IPC/偏好契约、3D/GLB、桌宠透明 renderer/工具栏、native window/always-on-top 均未改动。现有双 HTML 构建配置无需修改。

## 迁移清单（完整管理界面）

| 原表面 | 现在的实际组件 | 保留语义/状态 |
| --- | --- | --- |
| 手写侧栏导航按钮 | `TabNav.Root` / `TabNav.Link asChild` + 语义 button | 3 个页面、`aria-current=page`、按钮 Enter/Space、逐项 Tab |
| 应用读取失败/重试 | `Callout.Root/Text`、`Button` | alert、原文案、请求期间无重复重试 |
| pi 检测、安装包目录选择、配置目录选择、默认候选、显式只读检查 | `Button` | 原 5 项能力、原请求覆盖规则；不因 busy 阻断主动选择新目标 |
| 安装候选原生 radio/fieldset | `RadioGroup.Root/Item`、`Text` | 命名 radiogroup、路径及兼容性标签、不透明候选 ID、受控已确认值 |
| 显示宠物、登录时启动 checkbox | `Checkbox`、`Text as=label`、`Flex` | 受控 `aria-checked`、禁用、失败不假装成功；开发登录项禁用 |
| Radix primitive 自绘轨道/范围/拇指 | Themes `Slider` | 真实底层 Radix 事件；详见下一节 |
| 介绍、其他 Agent、当前模型、显示与尺寸、启动、关于、pi 卡片 | `Card asChild` + section | 原页面内容与标题层级 |
| 标题、正文、说明、数值、状态文字 | `Heading`、`Text` | h1–h4、paragraph、label、output、status/alert |
| P2a 阶段标签 | `Badge` | 原阶段声明，不是连接/在线状态 |
| 预检错误、取消/busy/失败通知、检查结论 | `Callout.Root/Text` | 原错误/未知诚实披露；结果无绿色安装保证 |
| 总体页面、卡片间距、操作行、标签布局 | `Grid`、`Flex`、`Box` | 宽度上限、窄窗口单列、按钮换行、长路径折行 |

有意保留的非控件标记：main/aside/section、隐藏页面 div、语义 button（仅 TabNav `asChild`，样式/交互由库拥有）、检查结果 ul/li、output、br、Lucide 装饰图标。不是第二套 UI 库，也不声称替换了产品的桌宠控件或原生菜单/选择器。

## 导航、可访问性和持续挂载

采用 TabNav，而不是 Tabs。因此保持原先每个导航按钮均可 Tab 聚焦、Enter/Space 切页的模式，不引入 tab/tabpanel 角色或自动激活。已核查底层 NavigationMenu 的 FocusGroupItem，额外支持四个方向键、Home/End 聚焦导航按钮（不切页）；同样适用于侧栏纵向与窄窗口横向布局。RadioGroup 提供库的 roving focus / 方向键选中模式；与原 radio 同样只能选择一个已确认候选。

连接和宠物页一直挂载，外层普通 div 同时设置 `hidden` 与 `inert`；不把隐藏属性放在默认 display:flex/grid 的 Themes 内容组件上。额外 `.management-shell [hidden] { display: none !important; }` 防止库样式覆盖隐藏状态。这样切页不会丢失检测、检查、已释放尺寸保存的异步所有权；离开宠物页仍只取消未释放草稿。设置页没有独立请求 owner，沿用条件渲染。库负责 focus-visible/disabled 外观；测试验证隐藏页从角色查询及 Tab 顺序中移除，但 DOM 和异步 owner 仍在。

## Slider：安装源码核查与最小适配

实际安装链：Themes **3.3.0** → `radix-ui` **1.6.7** 的 Slider reexport → `@radix-ui/react-slider` **1.4.7**，与 P1 基线相同。检查过 Themes `src/components/slider.tsx` / `slider.props.tsx`、聚合包 `dist/index.mjs` 和 primitive `dist/index.mjs`：

- Themes 直接转发受控 value、pointer handlers、onValueChange/onValueCommit 到 primitive Root；自己创建 Track/Range/Thumb，不另写坐标算法。
- primitive pointerdown 捕获、pointermove 本地变化、pointerup 触发 slideEnd；相对开始值未变化不提交。键盘 commit 仍先于 change。
- primitive 仍不清理 pointercancel/异常 lost capture 的缓存轨道 rect。保留基线的**仅取消重置**，正常 release/save 不重建。非主键 preventDefault gate、外部 push revision、旧保存/新草稿分离、失败停止队列、权威错误恢复均未改变。
- Themes 3.3.0 没有 thumb props/ref API：Root ref + 一个 layout effect 找到实际 `[role=slider]`，设置原 `aria-labelledby`、`aria-describedby`、动态 `aria-valuetext`，并供原取消焦点恢复使用。没有替代 thumb、私有几何计算或额外 pointer 系统。此适配依赖库的单 thumb DOM；相关 ARIA/取消测试是升级门槛。
- 根 slider 的 32px 命中/布局槽与 48px 状态槽继续固定；轨道、thumb、焦点圈都由 Themes 绘制。状态使用同一个 `Text as=div`，显式 `display:block`，避免 Themes Text 默认 inline 让高度失效。预览/保存/错误不新增布局行。

已移除不再直接导入的 `@radix-ui/react-slider` 直接依赖；它仍作为 Themes 的传递依赖留在 lockfile。保留桌宠使用的 Tooltip 直接依赖。安装增加 47 个包；按 lockfile 的 packages/snapshots 条目比较，已有包无版本/内容修改或删除（pnpm 有条目重排），没有宽泛升级。

参考官方文档：
- https://www.radix-ui.com/themes/docs/overview/getting-started
- https://www.radix-ui.com/themes/docs/components/slider
- https://www.radix-ui.com/themes/docs/components/tab-nav
- https://www.radix-ui.com/themes/docs/components/tabs （本次未使用 Tabs）

## 自动化证据与未验收边界

测试使用真实 Themes，不 mock 组件。仅 IPC 返回值、jsdom 缺失的 PointerEvent/capture/ResizeObserver 和合成轨道 rect 是替身：

- `ManagementApp.test.tsx`：原 **28** 项全部保留；checkbox 断言由原生 input.checked 改为实际 `aria-checked`。新增完整组件表面/隐藏挂载清单和失败重试测试，共 **30** 项。加强 slider label/描述/数值文本、取消后 ARIA、保存期间 checkbox 禁用、Themes 状态 block 几何契约断言。
- `PiPreflightPanel.test.tsx`：原 **3** 项保留，置于真实 Theme；新增真实 radio 键盘/候选标签用例，共 **4** 项。断言 Callout 通知/错误真实组件。
- `pnpm install --frozen-lockfile --strict-peer-dependencies`：通过，React 19.2.8 peer 满足。
- `pnpm test`：**30 文件 / 226 项通过**。仍有既有 Three.js 重复导入警告。
- `pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`git diff --check`：通过。
- 构建产物的 `management.html` 只加载 management CSS，桌宠 `index.html` 只加载原 index CSS；Theme/CSS 未漏入透明 renderer。完整官方 Themes CSS 令管理 CSS 约 **813.68 kB**（未压缩构建体积），是本次采用完整库样式的成本，不代表运行时性能测量。

独立只读审查未发现需修复的问题；主会话另行复跑全量 226 tests、typecheck、build、diff-check 均通过。

### 主会话有限浏览器检查

通过 agent_browser 打开本机临时 HTTP 服务的实际生产管理 HTML/JS/CSS；仅注入合成 `window.management`，无 Electron/真实 IPC、文件配置或用户端点。固定合成超长路径、500ms 保存延迟，实际浏览器 mouse move/down/up 驱动 Radix：

- 1280px、760px、600px 宽度均未出现 document 水平溢出；600px 下导航位于主内容上方，跨越 660px 断点。长合成路径正常换行。
- 760px 宽下，滑块从 140 拖至 473：拖动中保存记录为空，释放后恰好一条 `{ petSize: 473 }`。拖动前、中、保存后 track rect 均为 `(230,414,490,32)`；status rect 均为 `(230,458,490,48)`，没有这两个区域的布局跳动。
- 切换连接/宠物页面后隐藏区域 computed display 为 none 且 inert 为 true；可访问性快照只显示当前页面控件。
- 实际截图 `/tmp/agent-pet-themes-pet.png` 与 `/tmp/agent-pet-themes-connection.png` 已由工具核实生成，视觉检查卡片、控件与长路径可读；临时文件不是仓库长期证据。临时合成服务器随后停止。

上述是浏览器生产样式/实际指针检查，不是 macOS Electron 原生验收或彻底消除闪烁的证明。没有启动用户应用、访问真实偏好/Agent/用户端点、执行真实目录选择器或登录项操作。缩放、屏幕阅读器、原生窗口跨屏/移动/失焦/取消捕获、原生 picker 与用户主观拖动手感仍待验证。P1 顶部菜单栏/桌宠层级问题不在本次关闭范围。

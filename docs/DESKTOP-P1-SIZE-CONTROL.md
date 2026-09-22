# P1 管理窗口尺寸控件修复

用户反馈：先前原生 range + 连续写入合并队列修复后，拖动仍持续闪烁。之前的 jsdom 用例只证明禁用/异步状态缺陷已修复，不能代表原生拖动稳定。本轮按用户要求改用成熟控件，基线 `43b6e90`；实际 Chromium/macOS 手感仍待验收，不声称已完整复现或关闭现场闪烁。

## 本轮实现

仅管理 Renderer、desktop 依赖与 lockfile：新增固定版本 `@radix-ui/react-slider@1.4.7`，其 peer 声明支持 React 19（当前 19.2.8）。未新增其他直接依赖、升级 major 或更改 Main/窗口层级/持久化格式。

- `PetSizeControl` 使用真实 Radix Root/Track/Range/Thumb；不自行实现坐标换算、步进或拖动监听系统。
- `value` 为受控 `number[]`；指针移动的 `onValueChange` 只更新本地预览，**松开后**才通过 `onValueCommit` 应用桌宠尺寸并保存。方向键/Home/End/PageUp/PageDown 由 Radix 处理，键盘变更直接提交。
- UI 明示“预览”与“已确认尺寸”，并说明松开才应用到桌宠；确认偏好尺寸仍可能被 Main 按屏幕可用空间限制实际显示尺寸。
- 保存期间不禁用或重建正常滑块。固定 32px 控件高度、48px 状态槽；空闲、预览、保存与错误共用同一状态节点，状态/错误出现不增删布局行。轨道宽度与数值文本分离。
- 移除旧的每次 move 持久化队列。现在只串行处理**已提交**的 release/键盘操作，在前一 IPC 未结束时合并为最新已提交值；不发送尚未松开的新草稿。失败清除排队提交、回退权威值并可重试；独立的新拖动草稿不会被旧请求成功、失败或 finally 清掉。
- 外部工具栏推送持续更新已确认尺寸；拖动中不覆盖草稿；旧 IPC 回复不能覆盖更新推送。仍使用现有 push revision 保护，不新增 Main 协议。
- 宠物控件跨导航保持挂载，在途提交继续完成；离开宠物页取消未松开的草稿。真正卸载后不继续发排队请求，也不消费旧回复。P2a 面板保留既有挂载/异步结果所有权。

## 已核实的 Radix 1.4.7 语义

官方 API：<https://www.radix-ui.com/primitives/docs/components/slider>。实际核对安装包 `@radix-ui/react-slider/dist/index.mjs`，不是推测：

1. `SliderImpl` 在 pointerdown 捕获指针，pointermove 仅处理持有 capture 的目标，pointerup 释放 capture 并触发 slideEnd。`handleSlideEnd` 仅在当前值与 pointerdown 快照不同的时候调用 `onValueCommit`；未变更/拖回起点不提交。
2. 键盘 `updateValues(..., { commit: true })` **先**调用 `onValueCommit`，之后才通过受控状态回调调用 `onValueChange`。因此仅在指针手势活跃时把 `onValueChange` 当作草稿，不让键盘 change 在 commit 后留下假草稿。
3. 包内没有 pointercancel/lostpointercapture 收尾，水平轨道的缓存 rect 仅在 slideEnd 清理。应用仅补取消生命周期：pointercancel/异常 lost capture 丢弃当前草稿，不保存；手势已中止后重建 Radix 以清理缓存。正常 pointerup 在 Radix 内部收尾前标记已结束，因此随后的 lost capture 不会误判取消、重建或重复提交。没有额外坐标算法。
4. 取消后仅在原控件拥有焦点、窗口仍聚焦且页面可见时恢复焦点；等 Radix 注册替换 thumb 的 collection index 后再执行，且不从其他元素夺取焦点。普通 move/up/save 从不重建 thumb。

## 验证

`ManagementApp.test.tsx` 使用真实 Radix DOM，无 Slider mock；只补 jsdom 缺失的 PointerEvent、pointer capture、ResizeObserver 和合成轨道边界。包括：

- 多次移动零 IPC、松开一次提交、正常 lost capture 不误取消；保存前后 thumb/焦点/状态节点稳定，状态/错误槽固定 CSS 几何契约。
- 旧保存成功、返回失败或拒绝时，新未松开草稿均保留；释放后再提交。
- release/键盘提交串行、合并最新已提交值；失败丢弃排队提交、回退并可重试。
- 新外部 push 不被旧回复覆盖，拖动中更新确认值而不覆盖草稿；Main 先推送失败再回复时仍停止失败队列。
- pointercancel 和异常 lost capture 不提交；下一次拖动使用新的轨道边界；取消新草稿不丢旧在途提交；应用失焦不抢焦点。
- 轨道点击、未变更释放、方向键/PageUp/Home/End、ARIA 范围/说明、延迟键盘保存。
- 导航保留在途保存并取消未释放草稿、卸载清理；原有显隐/登录/P2a 延迟请求导航回归。

独立审查另发现持久化失败被本地 error 复制后无法随外部成功恢复清除、非主键点击轨道也会提交。主会话补充三例回归（修复前三例失败），移除持久化错误副本，仅保留 IPC rejection 本地错误，并在非主键 pointerdown preventDefault 阻止 Radix 处理。修复后全量复跑通过。

本轮最终验证命令：

- `pnpm exec vitest run apps/desktop/src/renderer/management/ManagementApp.test.tsx`：开发阶段 **25 项通过**；审查修复后全量运行中 **28 项通过**。
- `pnpm test`：主会话独立复跑 **30 文件 / 223 项通过**；仍有既有 Three.js 重复导入警告。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过。
- `pnpm install --frozen-lockfile --strict-peer-dependencies`：通过，lockfile 无需解析更新。
- `git diff --check`：通过。

## 尚未验收

jsdom 没有实际布局/原生指针捕获；DOM 身份与 CSS 断言不是 Chromium 像素几何或 macOS 闪烁验收。本轮未启动应用、访问真实偏好/Agent 配置/用户端点、调用登录项或更改桌宠层级。验证后创建本地独立提交，不推送。

下一步需经授权在管理窗口连续拖动、快速重复拖动、点击轨道、键盘调整、取消/离开页面、移动/缩放窗口后再次拖动；对照实际桌宠松开后变化、外部工具栏同步、焦点与屏幕尺寸限制。桌宠层级与顶部菜单栏问题是独立事项，本轮不关闭。

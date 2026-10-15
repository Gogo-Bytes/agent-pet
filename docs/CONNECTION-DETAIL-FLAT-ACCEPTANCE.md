# 连接详情平铺修订（2026-10-15）

用户明确要求右侧去掉大卡片、减少浪费并由 subagent 批评优化。修改限于正式连接详情的内容排布与样式，Main、preload、连接/部署/撤回接口、共享外框和底栏均未修改。

## 改动与独立复核

独立 Product Test 首轮指出：居中700px限宽、右栏padding、大卡片、内部padding连续缩窄；紫底身份区重复强调；停用接收挂在配置位置下；粉色移除块又形成一层边界。

已移除 `cfg-detail-panel` DOM 和样式，取消详情限宽居中。右栏直接铺开名称、配置检查、配置位置、接入管理和移除，以细分隔线区分。图标48px、名称24px，编辑按钮靠近名称；路径使用普通可点击行；移除保留低强调危险按钮和数据保留说明。左栏由280px收至240px，中等宽度为208px；小窗保留既有列表→详情返回流程。没有把“配置可用”变成在线状态，也没有删除部署确认/取消或既有保护。

同一 subagent 独立复核宽、中、窄编辑、矮窗底部和预览截图：未发现确定的布局/使用阻塞。两张入场截图按其意见重拍，已核对普通详情计算opacity为1。错误态图的合成捕获仍受动画帧影响，已移除该图；错误文字/刷新恢复仅记为实际 DOM 操作验证，不用作对比度证据。

## 验证与截图

- `pnpm exec vitest run apps/desktop/src/renderer/management/ManagementApp.test.tsx`：既有28项通过，覆盖重命名、返回/取消、重复配置、部署预览及迟到请求等行为；未添加镜像样式测试、未删除或削弱任何保护测试。
- `pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`pnpm package:mac`、diff检查通过。局部布局改动没有重复全量测试，不将历史结果写成本轮执行。
- 正式 Renderer/test bridge：1280×800 右栏 clientHeight/scrollHeight 都为548，无额外内容滚动；390px 文档宽390px、编辑输入宽350px；760×620 双栏可用。1000×480 通过 Tab 聚焦移除按钮并滚到底，scrollTop255、scrollHeight535、clientHeight276，外框与底栏保持固定。
- Escape 取消重命名、移除确认→取消、错误提示→刷新恢复、390px 预览→Shift+Tab 到取消→取消均实际执行；没有点击确认部署或移除。
- 实际新包以独立 `--user-data-dir` 启动，使用本轮自建 metadata/空目录，并展示平铺详情。该合成记录未具备正式接入的私有存储初始化，Main 按 saved-invalid 失败关闭；未部署、监听或读取日常 pi 目标。原生 AX 和一次实际画面确认了新层级和完整长路径；随后捕获失败（SCStream -3811），一次重新绑定/Raise恢复后滚动仍 noWindowsAvailable，按有界规则停止此路径。隔离进程77889已仅对自身发SIGTERM并确认退出，未改用其他UI协议继续操作。

以下均来自实际正式 Renderer 的隔离测试 bridge，使用合成路径；不是原型图，也不当作原生完整交互或真实连接验收：

![宽窗平铺详情](screenshots/connection-detail-flat/renderer-wide.png)

- [中等宽度](screenshots/connection-detail-flat/renderer-medium.png)
- [窄窗长名称编辑](screenshots/connection-detail-flat/renderer-narrow-edit.png)
- [矮窗顶部](screenshots/connection-detail-flat/renderer-short.png)
- [矮窗键盘滚到底部](screenshots/connection-detail-flat/renderer-short-bottom.png)
- [窄窗预览取消](screenshots/connection-detail-flat/renderer-narrow-preview.png)

## 当前应用与边界

用户在此前排查后明确反馈 `/reload` 后首页已显示 pi；这是用户对本机在线结果的确认，不外推任务完成/错误矩阵或发布验收。

本轮保留 `/Users/gan/Desktop/🥷/Agent Pet.app` 的当前连接进程，没有退出、替换、重载它，也没有启动/重载用户 pi。新 arm64 本机包已生成于：

`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-3Rj8PS/mac-arm64/Agent Pet.app`

源码和新版包已完成，当前运行版本尚未切换；切换时需正常退出旧 Agent Pet、替换并重开，再在连接页明确恢复已保存接收。原型认可、此次正式 UI 检查、用户实际在线反馈及发布验收保持各自范围。设置实机停点仍未完成，无新增依赖、Provider 或资产。

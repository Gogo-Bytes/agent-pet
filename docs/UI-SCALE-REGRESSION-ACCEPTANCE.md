# dev 界面缩小与设置序号修复 · 2026-10-16

用户报告当前 dev 的文字、界面和桌宠同时缩小，设置分类序号再次出现。本轮先暂停新的 pi 模型任务验证，不改变已更新扩展或连接配置。

## 根因与实机恢复

只读提取当前应用自己的 Chromium `Preferences` 中缩放字段：`partition.per_host_zoom_levels` 下 `localhost` 的 zoom level 为 `-1.5`，对应 `1.2 ** -1.5 = 0.7607257743`。桌宠与管理页在 dev 共用该 host，因此都受影响。无法据此确定是哪次菜单或快捷键操作写入了它，不归因于用户。

最近动作/扩展提交没有修改管理字体、设置 CSS、桌宠 Bounds margin 或 petSize 默认值。分类序号却一直存在于正式 SettingsView 和原型 DOM，仅在宽度 ≤1050px 的 CSS 中隐藏；缩小页面会扩大 CSS viewport，使隐藏规则失效。之前只依靠宽度隐藏的实现没有满足永久移除序号的要求。

通过当前 Electron 的 View → Actual Size 恢复正常比例；复查持久化 host zoom 条目为空。当前用户偏好 petSize=116、resolution=100 保持不变，没有执行恢复默认或重写偏好文件。原生截图实际显示恢复比例后的设置页，分类无序号，左侧分类与内容滚动保持原布局；另实际看到桌宠与状态气泡。截图由 CUA 在本轮工具输出中直接返回，没有用原型截图代替。

## 代码修复

- 正式和原型 SettingsView 都删除序号节点及专用 CSS，不依赖窗口宽度隐藏。
- 两个正式窗口共用的 `loadTrustedEntry` 在每次加载结束时恢复 zoomFactor=1，并对鼠标滚轮缩放请求恢复正常比例；保留原窗口信任、导航和 IPC sender 校验。
- 应用 View 菜单移除 Zoom In/Out 及对应菜单快捷键，保留 Actual Size、重载、开发工具和全屏。桌宠尺寸继续由用户偏好控制，渲染清晰度只控制像素密度。

当前 dev 已通过原生菜单恢复比例、通过 HMR 应用序号修复。为保留正在使用的接收进程及私有枚举证据，本轮没有重启当前 dev；Main 的自动恢复与菜单调整会在下次 dev 启动生效，已在独立 Electron 进程验证。没有修改日常 pi 配置、扩展、接收凭据或系统显示设置。

## 验证

- 新回归先失败：设置导航实际输出01–05；窗口加载后仍保留0.7607/0.5倍率。修复后两文件12项通过。
- `pnpm test`：**760 passed / 1 skipped / 77 files**。包含管理四页、设置持久化/失败恢复、尺寸控制、动画/静态回退、连接与既有部署/撤回/数据保留测试。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过，仅编译，没有生成应用安装包。
- `pnpm exec vite build --config apps/desktop/vite.prototype.config.ts`：通过。
- `node /tmp/agent-pet-window-scale-check.cjs`：真实 Electron、独立临时 profile、自己的本机 HTTP fixture；先写入-1.5再调用实际窗口入口，确认桌宠/管理同host加载及重载均为100%，900px窗口 viewport=900、固定14px正文保持14px。输出 `WINDOW_SCALE_PASS`。没有访问真实 pi 或运行中的应用 profile。
- `git diff --check`：通过。

本轮是显示问题修复验证；不将其计作 pi 细分任务矩阵、其他设置实机功能或发布验收。真实 pi 任务测试仍待继续。

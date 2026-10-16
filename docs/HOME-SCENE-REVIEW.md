# 首页多 Agent 宠物场景原型 · 2026-10-14

当前状态：用户已验收原型基线 `3b2f0cd`，覆盖本页历史等待验收记录。下文为浏览器 mock 原型证据；正式 GLB、多配置与桌面行为见 [正式迁移验收](MANAGEMENT-MIGRATION-ACCEPTANCE.md)，不由原型认可外推。

## 本轮决定

用户追加授权修改首页：所有在线 Agent 宠物同处一个可交互场景。删除首页绑定标签和页脚“查看连接”按钮；共享外框、顶部栏、白色页脚、四项导航及动画保留。宠物信息只在聚焦时出现，不常驻；宠物页的收藏、绑定、动作仍沿用原实现。

首页新增 `home-scene.tsx/css`，复用已安装的 Three.js、R3F 与 Drei，以代码几何体提供占位角色和简洁场地。点击模型或对应HTML按钮聚焦，镜头平滑移动；HTML显示Agent、宠物名、状态与配置名。返回全景、点击场景空白或Escape退出聚焦；Escape/返回按钮将焦点还给对应宠物。Enter/Space与Tab可使用同一聚焦入口，方向键不触发方案切换。

连接配置通过可选的 `onConfigurations` 回调传递完整演示记录；每条在线配置按独立id生成一只宠物，不按Agent类型去重。不把配置格式验证通过等同于通信在线，等待/错误配置不进入场景。默认在线为pi、Codex、OpenCode，Claude Code等待启动。配置移除同步离场；离线、删除或离开首页会清除聚焦。宠物形象按现有Provider绑定取名和色系；不引入新的正式绑定模型。

全景按宽高比和行数自动调整镜头距离，多个配置超过一行时排列为最多三列。缩小窗口仍保留全部在线角色。Canvas在页面间常驻，首页隐藏或文档不可见时停止帧循环；减少动态效果时镜头立即到位并停止角色浮动。模型是表达交互意图的占位几何体，不宣称正式美术资产或桌面GLB接入已完成。

## 实际自评与验证

- 1408×1034、390×844实际页面：全景同时三只、无常驻宠物信息和首页Agent标签；聚焦后显示对应信息；页脚无“查看连接”。
- 点击/Enter/Space聚焦pi、Codex和OpenCode；点击pi模型耳朵（HTML投影按钮外）也通过Three.js命中并聚焦；返回按钮、Escape回全景且恢复对应入口焦点；点击场景空白回全景。
- 演示pi未启动时只剩Codex/OpenCode，并清除pi聚焦；恢复在线场景后pi返回。
- 在连接页确认移除OpenCode，回首页从三只变两只。无配置查询 `configDemo=empty` 显示明确空态；刷新恢复演示记录。
- 宠物页收藏打开、Escape关闭并回焦可用；跨页仍仅一个Canvas。收藏退出动画结束前背景保持inert，沿用既有行为。
- 自评修复：HTML按钮事件冒泡导致聚焦立即解除，已阻止pointer/click冒泡并复验；窄窗左右角色裁切，已改为按实际场景宽高比计算全景距离并缩小投影点击区。
- 390×844文档scrollWidth=390；窄屏聚焦信息位于场景下沿，与角色分开。共享矮窗口外框的历史尺寸限制未修改。

引入Three依赖时旧开发页面曾出现依赖重新优化/HMR的重复createRoot、invalid-hook-call日志。新页面正常加载并点击聚焦复验，error日志为空；未通过屏蔽日志或重启用户服务处理。构建成功，Three场景使原型主JS约950kB（gzip约259kB），Vite提示大于500kB；本轮不修改构建告警门槛，正式接入前再评估加载拆分与GPU成本。

独立Product Test subagent完成本轮源码与四张实际截图检查，未发现确切新增产品缺陷；确认全景三只完整入镜、聚焦信息与窄窗布局清楚、返回/底部导航完整。其本次未重复运行点击或键盘操作，行为覆盖由Main实测，不冒充独立运行验收。

## 实际截图

- [宽窗口全景](screenshots/home-scene/overview-wide.png)
- [宽窗口聚焦](screenshots/home-scene/focus-wide.png)
- [窄窗口全景](screenshots/home-scene/overview-narrow.png)
- [窄窗口聚焦](screenshots/home-scene/focus-narrow.png)

全部来自实际运行页面原始截图，无拼接。尺寸检查曾用CDP导出出现缩放/裁切失真，未保存为验收图；最终使用浏览器viewport能力与原始截图，并恢复用户窗口尺寸。

验收地址：http://127.0.0.1:4174/?variant=a&view=home 。用户原4174服务保持运行。

验证命令：`pnpm typecheck`、`pnpm exec vite build --config apps/desktop/vite.prototype.config.ts`、`git diff --check`。无新增依赖安装，无真实环境读写；本地单一目的commit，不推送。

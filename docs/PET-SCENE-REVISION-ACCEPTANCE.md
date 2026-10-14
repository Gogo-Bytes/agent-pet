# 宠物场景、名称与收藏修订 · 2026-10-14

本阶段响应用户四项正式 UI 反馈。第5项仅回答真实 pi 接入条件与风险，未据此读取或部署日常目标。独立审查 READY，最终正式包已实际运行；用户视觉认可、生产安全与发布验收仍分别记录。

## 行为与实现

正式版原本就使用 R3F 9.7.0、Drei 10.7.8 和 Three.js。本次拆为 `HomeScene` 和 `PetPreviewScene`，前者保留多配置地台与模型/键盘聚焦，后者3D内容只有居中的宠物。共用 `CompanionScene` 的唯一 Canvas、GLB缓存和偏好帧循环，离场实例释放 mixer 与订阅。HTML名称、绑定、收藏与动作入口保留。仍只有真实starter资产，不虚构六只收藏或导入。

名称点击左上角文字原位编辑：Enter/保存、Escape/取消、空白阻止、40字输入上限、失败保留及回焦；取消/卸载丢弃迟到UI响应。收藏不再有改名入口。窄窗长名省略展示，完整名称在heading、悬停说明和编辑框中；绑定有界滚动，窄矮时布局和取景避免遮挡模型及控件互相覆盖。

收藏使用共享 `GlassSurface(material="panel")` 右抽屉，native dialog 保留 modality。通过父场景实测bounds和清理后的ResizeObserver定位，保留顶栏/白色页脚。进入 .3s、退出 .22s，动画结束才关闭回焦，丢失事件280ms兜底；减少动画立即关闭。按钮、Escape、遮罩共用关闭流程。通用Dialog提前捕获触发器，避免输入autoFocus改变回焦目标。最新原型 content-panel 实际为实色，本次玻璃是用户追加要求，动画与场景范围沿用原型语义。

## 验证

- `pnpm test`：639 passed / 1 skipped / 67 files。最后紧凑镜头微调后管理23项/R3F11项 focused 共34 passed；`pnpm typecheck`、`pnpm package:mac`（调用同一 `pnpm --filter @agent-pet/desktop build`）、`git diff --check`通过。pi撤回、保留数据、managed guard及原skip/Three.js多实例警告保留。
- 真实GLB与R3F reconciler使用正式38°FOV，覆盖1280×720、390×700、1000×360、390×350中心投影、不裁切、模型点击、场景切换、根/相机身份和订阅清理。独立审查指出最初测试默认75°，已修正复验。
- DOM覆盖名称验证/失败/保存/取消/回焦、三种关闭、退出期间modal、减少动画、丢失animationend兜底。实际浏览器对照4174原型与4175正式组件，检查1280×720、390×844、1000×480、390×480；最终40字中文名、窄窗scrollWidth390。长名称盖模型和动作条压脚均按实际截图修正。
- 实际正式浏览器检查唯一Canvas、进入动画名、8px blur/120% saturation、抽屉与场景bounds一致；首页实际模型点击、另一配置键盘Enter聚焦、Escape返回通过。测试bridge不进入生产包，这些在线状态不是真实pi。

## 原生运行与覆盖限制

最终源码外未签名arm64包：`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-2q1XtE/mac-arm64/Agent Pet.app`。自带Electron，可直接运行；临时目录可能被系统清理，`pnpm package:mac`重建，源码入口 `pnpm --filter @agent-pet/desktop dev`。

继续使用已授权独立 `agent-pet-live-20261014-pdakiqzh/app-data` profile，没有启动pi、扫描日常HOME、注册登录项或新增依赖。旧包原生菜单退出exit0，新包留给用户检查。实际原生打开收藏焦点为搜索；点击关闭后抽屉离场且回焦收藏入口。外部名称保存“小伙伴实机”，自身preferences核对一致；随后同一正式UI恢复“小伙伴”，存储再次确认。

原生捕获间歇 -3812/-3811，一次恢复后后续仍失败，已停止追加native自动化，不宣称完整原生键盘矩阵通过。旧浏览器关闭原本有效，本轮验证新包而未推断未复现的旧原生故障原因。独立subagent只审源码、34项focused和实图，无独立原生点击/pi/系统设置操作。

实际Electron截图：[居中场景](evidence/management-migration/pet-native-centered-fixed.png)、[玻璃收藏](evidence/management-migration/pet-native-drawer-fixed.png)、[名称保存](evidence/management-migration/pet-native-name-saved.png)。

正式Renderer+明示测试bridge截图：[宽窗](evidence/management-migration/pet-preview-centered-fixed.png)、[窄窗](evidence/management-migration/pet-preview-narrow-fixed.png)、[矮窗](evidence/management-migration/pet-preview-short-fixed.png)、[抽屉](evidence/management-migration/pet-glass-drawer-fixed.png)、[窄窗抽屉](evidence/management-migration/pet-drawer-narrow-fixed.png)、[原位编辑](evidence/management-migration/pet-inline-name-fixed.png)、[40字窄窗](evidence/management-migration/pet-long-name-narrow-fixed.png)、[40字窄矮窗](evidence/management-migration/pet-long-name-short-fixed.png)、[首页全景保留](evidence/management-migration/home-scene-preserved.png)。

## 真实 pi 条件与风险

隔离profile连接为0是因为上轮A/B已选择性撤回。真实部署/空闲连接/多配置/重启/停用证据见 [pi实机验证](PI-LIVE-CONNECTION-ACCEPTANCE.md)。可从“连接→手动添加”选择实际pi配置根（不是CLI安装目录），批准读取、检查/命名、审阅并确认部署预览。

仅独占新增 `extensions/agent-pet.ts`，不覆盖已有文件、改settings/trust/ignore、删除程序、复制provider凭据或发起模型任务。安全启动/重载pi后扩展才加载，配置可用或部署成功不等于在线。加载扩展增加pi中的本地代码及观察连接；名称/项目fallback、Session/process身份、粗粒度状态/时间等元数据发送给本机应用，不读取/发送prompt、响应、工具正文。

扩展包含私有桥接capability；停用/删文件不卸载运行中扩展，未知/修改文件保留。legacy不具备managed server authentication/ack，完整端点/同账号隔离未通过生产验收，D6仍BLOCKED，不能承诺零风险或正式分发就绪。日常真实目标仍须精确范围、预览与授权，本次未自动接入。

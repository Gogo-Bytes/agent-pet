# 当前 MVP 执行计划

> 产品方向已统一记录在 [产品方向与统一路线](PRODUCT-DIRECTION.md)：Agent Pet 是面向多个 AI Agent 的低门槛娱乐桌宠，pi 只是当前第一个实现 Provider。本文只记录本机 macOS/pi 纵向 MVP 的工程顺序、证据和边界，不定义最终 UI 定位，也不把当前 pi 技术面板视为最终产品体验。已验收 Web 原型正在正式 Electron/React 中实施；本轮范围与证据见 [正式迁移验收](MANAGEMENT-MIGRATION-ACCEPTANCE.md)。

## 优先级与范围

**当前目标：先交付单用户、本机 macOS、pi 的可用 MVP，再补生产安全与正式分发。** 本文是当前执行顺序、检查点与进度的唯一入口；旧 P0/P2/B/D 阶段文档保留技术契约和历史证据，不再决定本地 MVP 的先后顺序。产品语义见 [需求](../PRODUCT-REQUIREMENTS.md) 与 [领域术语](../CONTEXT.md)。不另建任务数据库或完成百分比。

MVP 复用现有 Electron Main、管理窗口、React/R3F 宠物、Application 状态模型和 pi 观测扩展：一只内置资产、按配置展示多个管理场景实例、桌面浮层承载多独立 Session，只观察名称和状态；不启动、接管、审批或控制 Agent，不读取对话正文。先跑通一个明确授权的真实 pi 配置目标；不扩大到 Windows、Codex、Claude Code 或新核心框架。

最终需要脱离源码目录可运行的本地 `.app`，不是要求用户一直运行开发服务器。正式签名、公证和自动更新不作为这个本地 MVP 的前置条件；未签名/本地签名的使用限制必须明示，不能宣传为正式可分发安全产品。

### 延后，但不是通过

以下是后续生产化工作，**不阻塞 M1–M5 的本地 MVP 排期**：跨用户隔离验收、完整 socket ACL/peer 身份验证、原生 syscall 故障注入、正式签名/公证/更新流水线、自动恢复/reset/revoke-all。状态仍为未验证或未实现；D6 完整安全准入仍 **BLOCKED**，不能改标为 PASS。

这次优先级变更不授权删除生产 guard、绕过 `acl-unverified`、引入 allow-all policy 或把测试 policy 接入真实目标。既有正确性、撤销竞争、数据保留和失败关闭测试继续保留；若 M1 选择涉及生产入口的实现变更，须明确其边界、残余风险和对应验证后再实施。延期安全验证不等于已有安全保证。

### 不变的底线与权限

- 秘密不进日志、Renderer、诊断或随包源码；不采集 prompt、响应、工具正文或完整 transcript。
- 保留未知配置/文件与用户修改；不覆盖共享 settings/trust，不绕过用户禁用扩展的意图，不自动删除不确定数据或残留 owner/lock。
- 安装候选、配置目标、已部署、已加载、连接在线与业务事件通过分别提供证据。只读检查不是安装同意，socket connect 不是业务验收。
- 此前仅授权 M1/M2 部署与桌面授权入口的代码实现、自有临时目标/隔离 socket 验证。2026-10-08 用户另授权以 Computer-Use 操作桌面端验收，范围为本轮自建的独立测试目录；开发版 App 已运行。仍不读写日常 HOME/pi 配置或安装目标、不安装依赖。M2 的目标读写/部署/连接须先给出**精确目标、读取和写入范围、变更预览、生效条件与撤回方式**并获得授权；本轮已按预览确认写入并在同一桌面进程撤回自有测试扩展。
- 普通实现与小修复由 Main 按范围推进，不逐项询问用户；只有结果/范围变化、真实环境权限、不可逆动作、新增依赖/实质成本或风险接受需要另行确认。打包依赖安装与签名账号/证书成本分开处理，不默认获准。

## 当前连接的扩展更新准备（2026-10-16）

用户要求更新当前pi扩展并做真实细分验证，保留配置，仅用dev。只读核对当前默认配置、私有receipt与现有扩展匹配，runtime有效/socket缺失。新增显式host/operator更新器：严格ownership与inactive保护、原目标绑定、700/600私有备份、原子替换及新receipt、显式校验恢复；保留接收配置与settings，不接Renderer/自动启动更新。dev可显式启用有界枚举证据，匿名身份、无正文/名称/凭据，打包应用忽略。

工程工具已验证：全量 **756 passed / 1 skipped / 76 files**，typecheck、desktop build通过；独立重点19项通过，最终目标绑定补测20项通过。没有打包或依赖安装。真实替换/恢复连接/用户reload及任务矩阵尚未执行，精确范围确认待回复；见 [操作预览](PI-EXTENSION-UPDATE-PREVIEW.md)。原设置实机停点和native fixtures保留。

## 多 Agent 动作与艺术家契约确认（2026-10-15）

用户确认：各 Agent 的原生事件按能力适配成统一事实，宠物动作与资产动画分开；所有动作均可选，连 Idle 也不要求存在。阶段1已实施：统一23种动作目录、v2可选动画manifest、生成艺术家模板、共享R3F播放器；无映射/无clip/无Idle时静态回退，单次动作结束回待机或静态。现有包格式兼容，模型路径与必要字段校验保留。资产导入尚未实现，目录不代表所有Agent都支持触发。

验证：全量 **705 passed / 1 skipped / 72 files**，`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、模板一致性检查通过；独立subagent复验76项、无阻塞。4175 dev测试边界使用正式ScenePet和真实GLB，实看无动画映射、无Idle及单次动作回退；零clip与清理由实际Three.js测试覆盖。[静态截图](evidence/pet-actions/static.jpg)、[艺术家说明](PET-ARTIST-GUIDE.md)。未打包、未部署/启动/重载真实pi；下一阶段是pi细分事件与能力事实适配。

## 动作第2阶段：pi细分事件与统一投影（2026-10-15）

已实现：domain独立能力/活动/等待/单次事件事实，保留原Session生命周期与未读；pi只提取流式类别、工具类别、扩展UI等待、整理上下文、取消和回答中断，按实际收到事件确认能力，不猜运行版本/自动重试。桌宠与首页共用动作投影，正式播放器按资产能力回退；单次业务反馈不随重命名/等待结束/场景重挂而重播，主动试播可重播。新接收器兼容旧粗略扩展，严格嵌套字段校验保留。

真实隔离socket与无环境生成扩展子进程覆盖并行、正文不读取、整批settled、压缩取消/旧signal、断开清活动/重连保未读、旧peer close与stop重入/发布异常清理；Main本地清理保留epoch保护，旧peer不能覆盖新记录，发布失败可重试。最终全量 **736 passed / 1 skipped / 74 files**；typecheck、desktop build、模板一致性与diff检查通过。独立重点复验 **86 passed**，Main最终修正另复验 **31 passed**，无确定阻塞。未削弱managed/部署/撤回/数据保留测试。默认/managed mapper契约保持，断开清理仅启用在本机legacy receiver。

Electron dev隔离profile已启动，原生管理首页启动实看，AX确认宠物页及试播入口；动作盘点击/截图工具恢复后仍有故障，未标完整原生交互通过。4175正式播放器测试边界已实看活动→已有动画、能力未知与静态回退。[证据与截图](PET-ACTIONS-ACCEPTANCE.md)。没有打包、依赖安装、日常pi配置读取/写入、部署、启动或reload；真实已加载扩展不会自动升级，新增细分TUI任务矩阵尚未实机验收。其他Provider/外部资产导入/发布保持未完成。

## 本机菜单栏图标恢复（2026-10-15）

**VERIFIED（当前 dev 可见，用户确认）**：系统日志证明图标被 ControlCenter 阻止。当前开发实例归于 ChatGPT 启动链，Agent Pet 的系统开关已开，但 ChatGPT 项关闭；经用户精确授权只打开 ChatGPT 项，同代码/隔离配置 dev 的日志恢复正常接收，用户确认“能看到了”。按授权保留开关开启，菜单栏功能继续保留，没有修改图标实现或重新打包。底层受保护映射未读取，不把坐标/创建成功当可见证明。正式包重开、菜单点击、其他设置与发布范围未验；完整证据见 [菜单栏恢复记录](DESKTOP-MENU-BAR-ACCEPTANCE.md)。

本轮 Main/偏好 **61 passed / 2 files**、`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、diff 检查通过。仅记录已完成的系统排查和恢复证据，不改变产品实现；没有生成应用包、操作真实 pi 或推送。原未完成的设置实机记录与历史 native fixtures 保留。

## 当前正式 UI 迁移（2026-10-14）

用户已明确验收原型基线 `3b2f0cd`，覆盖历史“等待原型视觉验收”记录；不代表正式代码、真实 pi 接入或发布已经验收。

实现阶段提交 `4f05049`：正式管理窗口四页、共享外框/导航、真实 GLB 场景、按配置身份的多目标 pi 接入、完整偏好持久化和运行时应用。Main/preload/Application 边界、managed guard、授权预览和选择性撤回保留；没有新增 Provider 或依赖安装，也没有日常 HOME/pi 配置读写。两份历史 native smoke fixture 原样保留，未推送。

本轮全量 **620 passed / 1 skipped / 65 files**、`pnpm typecheck`、desktop build 通过；最后手动保存详情入口增量另复验 **23 passed / 2 files**，类型检查与构建通过。Main 亲自启动隔离 profile 的实际 Electron 并记录首页空态；同一正式 Renderer 在测试边界中检查 1280×720、390×844、1000×480、模型点击与键盘、主要弹窗和滚动。独立 Review 的三个确切问题已修正并覆盖；独立 Product Test 检查实际截图和 DOM 行为测试，独立点击因 CUA 工具故障未完成。

状态为 **IMPLEMENTED-NOT-ACCEPTED（正式 UI 用户验收未完成；新多配置真实连接与生命周期有界通过，模型任务矩阵未完成）**。现有 M2–M5 证据保持原范围；正式签名/公证/发布仍未验收，完整 D6 仍 BLOCKED。

用户随后要求消除双层窗口，并采用其他 macOS 应用的样式：正式管理界面铺满窗口，macOS 使用原生 `hiddenInset` 标题栏及左上角系统按钮，共享顶部栏预留按钮空间；其他平台保留 HTML 操作回退。关闭仍遵循后台偏好。最新相关 **47 项测试**、类型检查、构建及打包通过；实际新包的原生 AX 确认关闭/最小化/全屏按钮，截图工具的紫色捕获提示遮挡按钮区域，颜色的截图检查有此限制。实际截图及检查边界见正式迁移验收记录。

准确缺口：仅一只真实内置 starter 宠物，包导入尚未实现；其他 Provider 仅可保存非秘密元数据，不能连接；自动扫描仍是支持的 pi 安装候选，不能自动找遍项目配置或证明其活跃；手动类型识别不确定时必须用户选择。旧已部署位置更换须先选择性撤回/移除再添加。系统登录项/GPU性能及新界面真实模型任务矩阵仍需实际验收；多 pi TUI 的空闲连接与生命周期范围已通过。映射、截图、运行方式和后续清单见 [正式迁移验收](MANAGEMENT-MIGRATION-ACCEPTANCE.md)。

## 功能接入第 1 阶段：配置在线状态（2026-10-14）

本阶段已完成代码与隔离验证：legacy receiver 只计入有效 hello 的 socket，同配置部分 peer 退出不误报离线，最后一个退出才离场；每次 start 独立维护连接集合。停止先禁止新数据/旧回调，再排空服务并发布一次断开，重复停止共享完成结果。Session 业务状态、未读结果、managed guard 与部署/数据保留契约不变。

新增 5 项真实隔离 socket 回归和 1 项 Configurations → Application → 正式首页投影集成，覆盖无效 peer、重叠重连、同 Adapter 多 receiver、缓冲数据期间停止、配置离场与选择性移除。全量 **629 passed / 1 skipped / 67 files**，`pnpm typecheck`、desktop build、package:mac 通过。独立 subagent 审查 READY（19 项 focused 复验通过，新增缓冲数据用例另作只读复核）；未注入 server.close 故障。实际新包启动及范围见正式迁移验收记录；不算真实 pi TUI 通过。

后续按已讨论顺序：一个真实 pi 配置 → 多配置/重启 → macOS 设置实机 → 资产选择与绑定、受约束导入分别交付 → 正式应用整体验收。真实操作已获用户精确授权，原范围见 [pi 实机操作预览](PI-LIVE-CONNECTION-PREVIEW.md)，不自动使用日常配置、复制凭据或发起模型请求。

## 功能接入第 2 阶段：真实 pi 与多配置生命周期（2026-10-14）

**VERIFIED（授权隔离范围）**：现有 pi 0.85.1 与源码外正式应用包实际走通 A/B 手动添加、预览确认、0600 独占部署、hello、多 peer 部分退出、两个同类独立宠物、原位命名、干净应用重启后明确恢复、停用保存和选择性撤回。最终配置为空，自有扩展已撤回、pi/应用正常退出；pi 生成资料保留。

修复重启停用提示及刷新后准确性，保留具体失败原因。全量 **630 passed / 1 skipped / 67 files**，typecheck、desktop build（package 内）、package:mac、diff 检查通过，独立审查 READY。操作范围、截图、最新包及首次 pi 自动下载越界说明见 [实机证据](PI-LIVE-CONNECTION-ACCEPTANCE.md)。本轮未登录、未复制凭据、未发起模型请求；真实任务/取消/错误矩阵、正式 UI 用户认可和发布验收未通过。下一步为 macOS 非登录项设置实机，登录项变更需另外明确范围。

## 用户反馈修复：宠物场景、名称与收藏（2026-10-14）

已交付独立Renderer增量：首页/单宠物场景使用不同内容与镜头，保留单一R3F Canvas；宠物无地台并居中，名称从左上角直接编辑，收藏采用共享玻璃抽屉/进出动画/native modality/关闭回焦。宽窄矮、40字名称及动作条遮挡依据实图修正。全量 **639 passed / 1 skipped / 67 files**，最后微调focused **34 passed**、typecheck、desktop build与package通过，独立审查READY；最终包原生关闭与名称保存通过，捕获失败未升级为完整键盘矩阵通过。最新包、截图及边界见 [修订验收](PET-SCENE-REVISION-ACCEPTANCE.md)。未新增资产/Provider或日常pi目标操作；设置实机停点仍未完成。

## 用户反馈修复：pi 安装扫描与失效连接（2026-10-14）

固定 pi 经原生页面确认为当前自身 profile 的历史部署记录；旧目录不存在，却因撤回把缺失路径误判为变更而无法移除。修复为有效私有 receipt + 安全祖先 + 明确缺失的 `already-absent` 结果，先停用保存，再清产品记录；目标/未知文件不删除，读取或保存失败仍保留。Finder GUI PATH 漏扫 NVM，现增加固定一层版本目录的有界 metadata 搜索（64 项/16 版本/51 候选），受限结果在正式 UI 明示。

全量 **652 passed / 1 skipped / 67 files**、typecheck、desktop build、最终 package 通过，独立 Review READY（110 项），最终文案 focused **28 passed**。已更新并启动 `/Users/gan/Desktop/🥷/Agent Pet.app`，实际管理页的移除预览/取消通过；未自动移除当前历史记录。此前授权的精确本机 CLI metadata 识别为 pi 0.85.1；2026-10-15 用户另行授权有界只读扫描，正式包实际找到 NVM Node v22.22.3 和 v24.20.0 下的两份 pi 0.85.1，原生 AX/截图一致，留在结果页；未执行 pi、读取日常配置、部署或移除。截图、红测试和具体边界见 [本轮证据](PI-DISCOVERY-REMOVAL-ACCEPTANCE.md)。设置实机停点、真实任务矩阵和发布验收保持未完成。

## 用户反馈修复：自动扫描直接配置（2026-10-15）

已将“找到安装后再次手动选位置”改为按默认配置目标合并的一键入口。Main 从最新支持的扫描 ID 匹配自身 HOME 的 `.pi/agent`，自动名称/类型/位置，具体只读批准后直接准备既有部署预览；独立确认仍控制扩展写入与接收。已有配置直接查看，未知版本不提供一键操作，项目/自定义位置保留手动入口。返回迟到结果撤销预览，窗口 close/reload 和重新扫描使陈旧批准失效。

全量 **665 passed / 1 skipped / 67 files**、typecheck、desktop build、package 通过，独立审查 READY（80 项/6 文件）。已更新并启动稳定包 `/Users/gan/Desktop/🥷/Agent Pet.app`；实际两份 pi 安装显示为一个默认配置入口，点击即原生精确检查确认。工具提示用户接手后，实际已进入默认目标的部署预览，因 `settings-unknown` 阻止部署，未建立日常连接；没有修改现有扩展规则。原生取消自动化结果有覆盖限制，不标完整通过。具体截图、语义与边界见 [本轮验收](PI-AUTOMATIC-SETUP-ACCEPTANCE.md)。

## 用户反馈修复：保留包配置与可取消检查（2026-10-15）

已获精确只读授权核对默认目标：5 条字符串包来源、无顶层扩展过滤/ignore/固定入口。依据已安装 pi 0.85.1 源码，包来源和用户扩展自动发现分开；现在允许有界字符串包来源，保留未知形态、非空顶层扩展规则、数据保护与 managed guard。实际只读复验 `findings: []`，settings 校验摘要不变。

一键检查改为页面内显式范围确认；requestId、Main/Renderer 取消 race、3 秒预算和精确 planId 撤销使取消不再依赖原生弹窗回调，也不误撤较新预览。全量 **671 passed / 1 skipped / 67 files**、typecheck、desktop build、package 通过，独立 Review READY（116 项）。实际新包在隔离 profile 打开新 Dialog，取消后原生 AX 的三个操作均恢复可用；截图恢复一次失败，覆盖限制如实保留。已恢复正常用户 profile 的稳定应用入口。设置实机停点仍未完成。

用户对 [本机部署预览](PI-DAILY-CONNECTION-PREVIEW.md) 明确选择 **“只更新修复，暂不部署”**：本轮没有日常扩展写入、pi 启动/重载或连接通过声明。最终 settings 保持原字节，日常 `agent-pet.ts` 仍不存在。后续真实接入仍需明确授权，不重复请求本轮已拒绝的部署。完整根因、源码依据、回归和原生覆盖见 [本轮证据](PI-RULES-CANCEL-ACCEPTANCE.md)。

## 用户反馈修订：扫描结果视觉（2026-10-15）

按用户要求先由独立 Product Test 批评，再拆分配置摘要和安装详情，主操作不随展开位移，窄窗独占一行；已有/新建文案分别表达，保留在线需实际通信及独立部署确认。独立复核未发现必须修正项。管理页 **28 tests**、typecheck、desktop build、package 通过；实际正常 profile 应用扫描与展开/空格收起已验证并截图，另以正式 Renderer 测试边界检查宽/窄/矮窗口及取消。仅 UI 修订，无 pi 部署、重载或真实通信验收；正式 UI 用户认可待反馈，原设置停点保留。见 [截图与验收边界](PI-SCAN-VISUAL-ACCEPTANCE.md)。

## 用户反馈修订：连接详情平铺（2026-10-15）

用户此前已自行完成本机 pi 接入并反馈 `/reload` 后首页在线，确认运行中的 pi 需要加载新扩展；本轮没有再次部署或重载。按新截图反馈及独立 Product Test 批评，已移除右侧大卡片和700px限宽，名称/检查/位置/接入管理/移除直接铺开，窄矮窗及长名编辑保持可用。独立截图复核无确定阻塞；既有 **28 tests**、typecheck、desktop build、package通过。实际新包隔离启动取得平铺详情AX/一次画面，后续捕获在一次恢复后仍失败，覆盖限制见 [本轮证据](CONNECTION-DETAIL-FLAT-ACCEPTANCE.md)。原连接应用保持运行，新包已生成但未切换；未把测试 bridge 当真实接入或发布验收，原设置停点不变。

后续用户要求配置路径保持单行：详情位置行改为末尾省略，保留完整title/无障碍描述及“更换位置”操作。384字符路径在390px/1280px下均为一行、无横向溢出；28项管理页测试、typecheck、desktop build通过，未重新打包或切换当前应用。见上述平铺详情证据的后续修订。

## 用户反馈修复：桌宠外观、命中与层级（2026-10-15）

已移除桌宠常驻名称及失效名称开关，保留旧偏好读取兼容；气泡/双操作胶囊采用轻量共享玻璃样式。工具条改由R3F真实模型命中或键盘进入触发，Main仅为已确认显示的工具条保留鼠标区域，旧ACK、失焦、隐藏恢复、卸载及拖动回归均保留。macOS桌宠使用非激活panel，在显示/恢复时重应用置顶与工作区策略，关闭置顶仍有效，不定时抢焦点。

全量 **682 passed / 1 skipped / 70 files**、typecheck、desktop build（package内）、最终package通过，独立工程Review READY、独立截图复核无确定阻塞。正式Renderer已实看远处/透明角不触发、直接模型命中与气泡开关；隔离原生包启动/GLB/无名称/正常退出通过，原生坐标工具一次恢复后仍不能可靠证明操作条交接及跨应用/全屏层级，保持待验。当前用户应用与pi接收未切换/中断；新包与截图见 [本轮证据](DESKTOP-OVERLAY-REFINEMENT-ACCEPTANCE.md)。没有日常pi读写、部署、重载、依赖安装或推送；原设置停点和发布门槛不变。

用户随后要求统一使用glass组件：管理页玻璃实现已提取为正式`shared/ui/Glass.tsx`/`glass.css`，桌宠采用GlassToolbar/GlassAction/GlassButton，删除简化磨砂版本，加入适合桌面浅/深背景的对比变体及紧凑阴影。全量 **684 passed / 1 skipped / 71 files**，最终相关 **60 passed**，typecheck、desktop build、原型build、package通过；正式Renderer实看浅/深/线条、媒体回退及管理收藏回焦。新包尚未切换，原生层级和真实pi验收边界不变。截图与最新包见上述本轮证据的后续修订。

用户进一步要求操作条容易到达：宠物渲染区域与操作条已放进同一个紧凑透明hover容器，停在中间空隙不再依赖180ms过渡时间；Main允许隐藏操作条区域作为入口，确认显示后接通间隙，远处空域继续穿透。共享几何覆盖80/140/600尺寸、操作条上下布局；保持单Canvas、键盘顺序、Tooltip窗口坐标、拖动、失焦/隐藏清理。全量 **687 passed / 1 skipped / 71 files**、typecheck、desktop build（package内）和package通过；正式Renderer已实测空隙停留、直接操作条入口、远处隐藏及气泡按钮，未切换运行中的用户应用。具体截图和新包见本轮证据的最新修订。

## 用户反馈修订：连接页更易读、更好操作（2026-10-15）

连接状态和主要操作前置，位置检查收起，未检查不再挤占列表名称。连接/暂停/继续、检查与移除用日常表达，技术原因和精确范围可展开；已有部署的位置明确提示先移除再添加，不以按钮暗示可直接更换。精确预览、独立写入确认、保护未知/修改文件和Main边界不变。新增预览/取消回焦并覆盖Main先推送、操作稍后完成的顺序，隐藏页面不抢焦点。

全量 **691 passed / 1 skipped / 71 files**、typecheck、desktop build（package内）和package通过，独立Review READY。正式Renderer亲自检查宽/窄/矮、等待/错误、检查与连接状态分离、单行长路径、预览/取消回焦；仅使用隔离示例，没有操作真实pi或重启正在运行的应用。最新截图、新包及范围见 [连接页记录](CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) 的后续修订。原设置停点、原生层级/全屏、真实任务矩阵及发布仍未完成。

## 连接页逐场景演示（2026-10-15）

按用户要求，暂停自行调整设计，先在 Demo Web 汇总 42 个编号场景，供逐页指导。入口为 `pnpm demo:connections` / <http://127.0.0.1:4175/connection-scenes.html>；当前正式组件配合独立示例 bridge，支持上/下页、直接链接、宽/窄/矮窗口和重新打开。没有修改正式页面布局、Main/preload 或真实 pi。浏览器逐个打开 42 个场景通过，另核对窄窗命名、矮窗预览、取消检查与重开；管理页 32 tests、typecheck、desktop build 及独立 demo build 通过。截图见 [场景目录](screenshots/connection-scenes/catalog-wide.png)。这里只证明示例场景可用于讨论，不代表新 UI 用户认可或真实接入验收。

用户逐页反馈后，01 空态已在右侧可用区水平/垂直居中；02 详情重新区分信息主次：名称为主、状态缩为标记、单行路径为次，暂停/检查/更换/移除统一收进“更多操作”，检查异常或连接失败时自动展开。42 个演示入口全部复验，宽/窄居中偏差均为 0；长路径不换行、无横向溢出，相关 32 tests、typecheck、desktop build 通过。截图与边界见 [详情记录](CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) 最新修订。本轮未重启应用或操作真实 pi。

用户继续标注的 14/18/23/27/41 场景已修订：名称编辑采用独立输入区域/计数/单一焦点样式，类型字号增大；扫描为可减少动画的装饰雷达；读取确认和文件冲突默认短文案，完整范围可展开；移除改为有界确认弹窗，取消回焦、失败保留、确认中不误关闭。42 个演示场景复验、全量 **692 passed / 1 skipped / 71 files**、最终管理页 **33 tests**、typecheck、desktop build 和 demo build 通过。截图、首轮无关时钟边界失败及复验记录见 [详情记录](CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) 最新修订。未修改 Main/Adapter/guard、未替换运行中应用或操作真实 pi；正式 UI 仍由用户逐页确认。

按用户标注，连接名称下方的 Agent 类型与在线状态已合为一行，状态只渲染一次；预览结束回焦仍指向同一个真实状态节点。宽/窄同排居中差为 0，浏览器实际确认后焦点落在“等待 pi”；管理页 33 tests、typecheck、desktop build（package 内）通过。详见 [连接页记录](CONNECTION-DETAIL-FLAT-ACCEPTANCE.md) 最新修订，当前应用与真实 pi 未操作。

桌宠气泡截图反馈已修正：重复 CSS 定位导致收起状态露出下一条半截，展开态又沿用大面板阴影。现在只在展开时进入列表流，统一紧凑玻璃边缘/阴影并预留空间；Main 的 88/204px 边界、确认先于显示和状态语义不变。相关 **41 tests / 3 files**、typecheck、原型 build、desktop build（package 内）及 package 通过；正式 Renderer 实看白/深/线条背景、上下位置、悬停/键盘及系统媒体回退。最新包与原生覆盖限制见 [桌宠记录](DESKTOP-OVERLAY-REFINEMENT-ACCEPTANCE.md) 最新修订；当前应用未替换、真实 pi 未操作。

## 当前事实与证据

M1 实施基线：`9ec14c5c22253c3b1793fcf216332fc3cf49a912`。以下代码入口已核对；历史执行结果归属原阶段，M1 与 M2 临时切片验证分别列于对应检查点。两个历史未跟踪 native smoke fixture 原样保留。临时部署阶段已提交为 `c052037`，所有权撤回修复后独立审查 **READY**；当前桌面接入增量基于该 commit；独立审查 READY，Main 已复跑全量测试、类型检查与构建。本地提交遵循工程规则，不自动推送。

状态用语：**PLANNED**＝未交付该检查点；**PARTIAL**＝只完成所列有界切片，检查点其余范围未交付；**IMPLEMENTED-NOT-ACCEPTED**＝有实现，但缺该范围实际验收；**VERIFIED**＝仅所列范围有执行证据，不外推到整个产品。

| 能力 | 状态与准确边界 | 可复查入口 |
| --- | --- | --- |
| 宠物、Session/确认、管理窗口与 P2a 只读检测 | IMPLEMENTED-NOT-ACCEPTED（完整本地 MVP）；既有自动化与局部用户反馈保留，原生菜单栏/选择器等仍有缺口 | [桌面 README](../apps/desktop/README.md)、[P2a](DESKTOP-P2A-PREFLIGHT.md)、[pi 反馈](PI-ACCEPTANCE.md) |
| legacy opt-in bridge | 已接入 Main；保留显式 env 开发路径，新增用户授权的桌面配置生成/部署入口。扩展仍须用户安全加载；不是自动发现或 managed fallback | [Main](../apps/desktop/src/main/index.ts) 的 `startConfiguredAdapters`、[pi-config](../apps/desktop/src/main/pi-config.ts)、[Adapter](../packages/adapter-pi/src/index.ts)、[扩展](../integrations/pi-extension/index.ts) |
| 干净桌面重启 / 显式恢复 / 停用持久化 | IMPLEMENTED-NOT-ACCEPTED；只读自身 metadata 启动，不自动监听，原 runtime/receipt 必须匹配；非 crash/系统重启恢复 | [store](../apps/desktop/src/main/pi-connection-store.ts)、[新增未勾选清单](MVP-RESTART-CHECKLIST.md) |
| legacy 纵向自动化 | VERIFIED（合成 pi callbacks → 真实隔离 socket → Application，以及重连）；不是运行中的真实 pi TUI | [bridge.test.ts](../integrations/pi-extension/bridge.test.ts)、[reconnect.test.ts](../integrations/pi-extension/reconnect.test.ts) |
| managed 公开工厂与生产 policy | 休眠且 fail-closed；调用在参数读取/FS/socket 之前拒绝 `acl-unverified`，Main/扩展未接线 | [managed/index.ts](../packages/adapter-pi/src/managed/index.ts)、[path-policy.ts](../packages/adapter-pi/src/managed/path-policy.ts)、[service.test.ts](../packages/adapter-pi/src/managed/service.test.ts)、[legacy-regression.test.ts](../packages/adapter-pi/src/managed/legacy-regression.test.ts) |
| managed 内部 Core/AuthStore/native/Worker | 已有复用实现与 fixture 集成，不是全部尚未接入，也不是生产入口已可用 | [service.ts](../packages/adapter-pi/src/managed/service.ts)、[Worker 测试](../packages/adapter-pi/src/managed/worker/service-worker.test.ts)、[P2 历史记录](DESKTOP-P2-IMPLEMENTATION.md) |
| B4.3 / B4.4a | VERIFIED（历史 Electron Worker / disposable staged-resource 范围）；B4.4a 没有 ASAR/最终 `.app`/签名，不是应用包 | [P2 B4 证据](DESKTOP-P2-IMPLEMENTATION.md)、[staged launcher](../scripts/electron-managed-worker-staged-smoke.mjs) |
| D6.1 | VERIFIED（有界同账户 harness 已完成）；完整 D6 仍 BLOCKED，且不再是本地 MVP gate | [D6.1 契约](DESKTOP-P2B2-FILESYSTEM-POLICY.md#d61--bounded-synthetic-current-account-harness)、[harness.test.ts](../packages/adapter-pi/src/managed/d6/harness.test.ts)、[evidence.test.ts](../packages/adapter-pi/src/managed/d6/evidence.test.ts) |
| 独立本地应用包、真实部署全链路 | 独立 `.app` 已 IMPLEMENTED-NOT-ACCEPTED；本次 arm64 包含运行时与 bundled 资源并完成隔离 smoke，真实部署→连接→状态→选择性撤回和人工视觉验收仍未完成，不能称“生产集成就绪” | [desktop README](../apps/desktop/README.md)、[builder config](../apps/desktop/electron-builder.config.mjs)、[根 scripts](../package.json)、[M5 清单](MVP-MANUAL-CHECKLIST.md) |

历史基线结果：**489 passed / 1 skipped**；历史 D6.1 runner **8 PASS / 7 BLOCKED，exit 2**。M1 本次全量测试 **497 passed / 1 skipped**，类型检查与 desktop 源码构建通过；未单独运行 D6.1 runner。单项 skip、blocked 与保留的 fixture barrier 不因总测试通过而消失。旧文档中的 335/371/448 等数字仍只对应各自历史阶段。

`PI-ACCEPTANCE.md` 的工作/完成/重启等用户反馈继续有效，但没有记录为当前 M2–M5 路线下完整部署、故障、卸载和应用包验收；不能升级为全链路通过。

## 顺序检查点

每段只交付一个可独立验证、回滚的增量，复用已完成阶段。实现阶段按改动运行针对性测试、必要类型检查/构建并核对 diff；本地提交与推送遵循 [工程规则](../AGENTS.md)。文档校准以链接、范围一致性和独立审查验证，不以未运行的功能测试作为完成证据。

### M1：选定最小接入路线并交付一个纵向切片 — VERIFIED（临时目标、合成 callbacks 范围）

**选择 legacy bridge，不开放 managed 工厂。** 代码依据：Main 的 `startConfiguredAdapters` 已通过 `readPiBridgeConfig` 向 `PiBridgeAdapter` 提供 endpoint/token；`integrations/pi-extension/index.ts` 是只依赖 Node builtins 的现成单一状态机，已有真实隔离 socket → Application/气泡与重连基线。managed 的内部 Core/AuthStore/Worker 虽已有实现，但公开 `managed/index.ts` 仍在参数读取/FS/socket 前拒绝 `acl-unverified`，Main 与扩展均未消费 managed 协议。为本地切片启用它会扩大到目录/端点 policy、扩展协议及资源交付；本次不改 guard、不另建 Core/AuthStore、不将 legacy 当 managed fallback。

**已实现的小增量：** [configured-source.ts](../integrations/pi-extension/configured-source.ts) 的 `renderConfiguredPiExtension({ endpoint, token })` 读取固定的受信任 `index.ts`，校验配置并以 JSON 数据替换唯一配置槽，返回自包含 TypeScript 扩展文本。不接受代码或源文件路径，不 eval，不写目标，不在运行时导入 workspace；原文件仍保持显式开发环境变量 opt-in。M1 当时为 source-only 工具；M2 桌面切片已改用 Vite `?raw` 将同一 canonical source 作为无凭据文本打入 Main，不再运行时读取 workspace。原 env opt-in 保留，不引入默认目标部署或自动启动。

**临时目标证据：** [configured-source.test.ts](../integrations/pi-extension/configured-source.test.ts) 用 `mkdtemp` 自有目录、`wx`/0600 放置新扩展，重复放置拒绝且原内容不变。配置中的引号、反斜线、换行、Unicode 分隔符和替换元字符按数据保留。Node 22 子进程在该目录直接加载生成文件，环境为空；仅 builtin imports，无源目录依赖。合成 pi hooks 经真实 `PiBridgeAdapter`/Application 验证 working → completed-unread、error-unread → 确认移除，working 确认不移除，Open Session 诚实返回 unsupported；快照不含 endpoint/token。absent/detached bridge 下 callbacks 同步返回，移除测试 IPC 保活后不发 shutdown 也在有界时间内自然退出。仅清理已停止句柄/子进程对应的自有对象；历史 fixture 不清理。

本次顺序验证：
- `pnpm test integrations/pi-extension apps/desktop/src/main/pi-config.test.ts packages/adapter-pi/src/managed/legacy-regression.test.ts`：**16 passed / 5 files**，含原有 env bridge、重连/no replay 与 managed 隔离回归。
- `pnpm test`：**497 passed / 1 skipped / 52 files**，新增 8 项；既有 managed 正确性、保留数据与失败关闭测试未删除。保留 Three.js 多实例警告。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过；只是源码构建，不是 `.app`/真实 TUI 验收。
- `git diff --check`：通过；完整 tracked + 新源码 diff 另存 `/tmp/agent-pet-m1-review.patch`（不含历史 fixture、生成凭据文件）。

**边界与下一步：** 这是 M1 合成纵向切片，不是实际 pi API/TUI 验收；hook surface、Session/process/work 身份、状态映射、重连仅 working/idle 基线与无历史回放语义不变。生成文本包含目标 capability，必须作为目标私有凭据文件处理，不写日志/Renderer/诊断，不放入公共应用包或提交；本次只使用临时测试数据。M1 当时仅有 `wx` 冲突测试，不等于 M2 通过；M2 的独立目标人工证据见下方。M2 已补有界 Main 配置供给、连接状态 UI 和 canonical template 构建证据；日常持久化与应用包仍未验收。legacy 不具备 managed auth/ack 或完整端点保护，生产 D6 仍 BLOCKED。M1 代码回滚点为撤回该配置槽/helper/tests/docs；当时无真实目标更改。

### M2：一个明确授权的真实 pi 目标部署与连接 — PARTIAL（独立目标实际部署、连接和撤回已验；日常持久化与完整视觉验收未完成）

临时部署 helper 的实施基线为 `1872b015af53876534b0cba6ee6d44dc42dbe46d`，该阶段提交为 `c052037`（所有权修复后审查 READY）。当时新增 [pi-temp-deployment.ts](../apps/desktop/src/main/pi-temp-deployment.ts)，未接 Main/IPC/Renderer；当前桌面增量在下面单列。构造时显式注入目标配置根与配置，绝不发现 HOME 或选择安装目录。复用 P2a `inspectTarget`/`ReadBudget` 的有界只读检查和 findings，固定读取相关配置、metadata，不枚举配置树；安装候选、配置目标、已部署、已加载、在线仍是不同证据。已完整阅读本机安装的 pi **0.85.1** `docs/extensions.md`（仅文档/包 metadata，未运行 pi、未访问真实配置），确认配置根下 `extensions/agent-pet.ts` 符合自动发现位置；实际 active root、扩展开关、项目 trust 与用户安全打开或 `/reload` 仍是生效条件，helper 不改 settings/trust、不自动 reload。

**已实现的临时切片：** 预览只给固定路径、create/blocked、待创建目录、findings 和加载条件，不含配置/source；主机私有内存持有生成一次的精确 source、目标证据与一次性计划。取消零写入；apply 先消费计划并复验，变更拒绝，必要时才创建目标及 extensions 两级目录（缺失更高父目录则拒绝），0600 exclusive/no-follow 创建单一文件，不覆盖、采用或重复放置同名文件。只追踪此次新建目录。部分写入或 close 不确定时保留残留并诚实返回失败，不强制清理、不发所有权凭证。撤回仅接受同主机内存中的凭证，核对文件身份、metadata 和完整内容；编辑/替换/未知对象保留，文件删除后只尝试删除身份未变、外部未改且为空的自有目录，不递归删除。所有权不跨主机重启持久化；遗留对象成为未知，不授权自动 reset/删除。删除文件**不表示运行中扩展已卸载或接收已停用**，后者属于 M4。只是本地 no-clobber/revalidation，不承诺同 UID 攻击隔离；managed policy、native/Core、D6 均未改。

[文件系统测试](../apps/desktop/src/main/pi-temp-deployment.test.ts) 覆盖预览/取消、0600、重复/并发确认、旧预览、同名原样保留、加载障碍、目录修改和未知 siblings、选择性撤回、partial-write/close 故障与秘密正控制。[configured-source.test.ts](../integrations/pi-extension/configured-source.test.ts) 新增从 **apply 后文件**直接加载的隔离 Node 子进程 → 真实 PiBridgeAdapter/Application → working/完成/错误/确认测试；不是从 renderer 返回文本直接 import，也不是 pi TUI。所有测试只用自有临时根、合成 token、隔离 socket，句柄/子进程 settled 后才清理。两个历史 `.d3` fixtures 不动，无依赖安装或真实目标操作；后续本地提交为 `c052037`。

临时 helper 阶段验证（`c052037`）：
- `pnpm test apps/desktop/src/main/pi-temp-deployment.test.ts integrations/pi-extension apps/desktop/src/main/pi-config.test.ts apps/desktop/src/main/pi-preflight-files.test.ts packages/adapter-pi/src/managed/legacy-regression.test.ts`：**72 passed / 7 files**。
- 初次实施 `pnpm test`：524 passed / 1 skipped / 53 files。审查后补充“目录权限拒绝 unlink → 恢复权限 → 同 receipt 完整重验并撤回”的真实文件系统回归，确认失败不会丢弃所有权；成功 unlink 后不恢复记录，变更过的目录保留。修复后 deployment/configured-source focused **36 passed**；全量复验 **525 passed / 1 skipped / 53 files**。首次全量出现既有 Darwin publication validation 测试 `path-changed`；未改动该实现或测试，单独 31 项及一次全量复验通过，根因未确认。原有 bridge/reconnect、managed 保留数据/失败关闭测试均保留；Three.js 多实例警告仍在。未单独运行 D6.1 runner。
- `pnpm typecheck`：通过。
- `pnpm --filter @agent-pet/desktop build`：通过；只是源码构建，不是 `.app`、真实部署或 TUI 验收。
- `git diff --check`：通过。实施时 diff 保存 `/tmp/agent-pet-m2-temp-review.patch`，不含生成凭据；随后所有权修复经独立审查 READY，已提交为 `c052037`，不再标作“未提交 / 审查待完成”。这不把临时测试升级为整个 M2 验收。

**历史桌面授权入口（基线 `c052037`；以下是已人工验收的 process-local 增量，新的持久化行为见下方重启增量）：**
- [PiConnection](../apps/desktop/src/main/pi-connection.ts) 接入既有 [management](../apps/desktop/src/main/management.ts)/preload 与 [连接面板](../apps/desktop/src/renderer/management/PiConnectionPanel.tsx)。启动只读进程内状态，不检测、读配置或监听。必须先用 P2a 原生选择器选现有 agentDir；默认候选不可直接部署，IPC 不接受任意路径。用户点击“同意读取所选目标并预览部署”后才读固定配置/metadata，预览列出精确文件、待建目录、冲突、加载/撤回条件；独立取消和确认按钮。
- Main 持有随机 token、短 `/tmp/ap-<随机值>/p.sock` endpoint、生成字节与真实 WeakMap 计划。Renderer 只有一个有界 opaque id 和脱敏预览；目标 revision、关闭/刷新/崩溃、取消、新预览均作废旧 id。单飞限制重复请求。确认才以 0700 exclusive mkdir 建私有运行目录、apply 单一 0600 扩展并启动同一配置的现有 `PiBridgeAdapter`；existing Application 接收观察。绝不删除或认领未知 socket/config 以启动。退出等待 pending 操作及 handle.stop，仅对仍匹配且为空的自有 runtime root 尝试 rmdir。
- 原 env 开发路径保留；即使 env 不完整/无效也保留该路径并报告失败，不静默回退或创建第二个桥接。UI 区分未配置、已配置等待、已连接、断开、失败；连接基于最近一次 token 校验后的 legacy hello/close，不是 managed auth/ack、全 peer 在线汇总或业务验收。
- 部署/启动失败诚实保留不确定文件、目录与可用 receipt，不自动重试。提供独立确认的“停用接收并撤回本次文件”；复用 identity/content 匹配选择性撤回，保留用户修改/未知对象，明确运行中扩展未卸载。仅本进程所有权/凭据，不新增持久化、恢复或自动重配协议；退出前可撤回，重配需撤回后重启。重启不连接/认领旧 artifact，这一限制在 UI 明示，不能称为日常就绪。
- [configured-source.ts](../integrations/pi-extension/configured-source.ts) 通过 Vite `?raw` 内联唯一 canonical `index.ts` 文本，构建时没有用户凭据；运行时才注入 host config。没有改 pi hooks/API，没有第二套扩展状态机。[构建测试](../integrations/pi-extension/configured-build.test.ts) 将 renderer helper 构建到临时目录并在空 env Node 子进程生成源；实际 `out/main/index.cjs` 另在 inert VM 中验证：拒绝源文件 readFile，仍可生成与 canonical 精确一致的 fixture artifact。VM 的 Electron 是拒绝主实例的 stub，不是应用启动。

当前增量顺序验证：
- targeted：**117 passed / 13 files**（controller、Main IPC、preload、RTL、deployment、extension、legacy guard）。初次仅既有 loadRequirements 文案断言失败；恢复原警示语后一次有界复验通过，没有改测试掩盖失败。
- `pnpm test`：**539 passed / 1 skipped / 56 files**；原 managed guard/保留数据测试均保留，Darwin publication 本轮未失败；Three.js 多实例警告仍在。未单独运行 D6.1 runner。
- `pnpm typecheck`：初次 strict optional class 字段/测试 this 类型报错，显式 `| undefined` 和 this 注解后一次复验通过。
- `pnpm --filter @agent-pet/desktop build`：通过；仅源码构建，非 `.app`。实际 built Main 模板验证通过，无 Electron/HOME/profile 运行。
- [controller 测试](../apps/desktop/src/main/pi-connection.test.ts)：真正由 UI controller apply 后的 artifact → 空 env Node 合成 hooks → 真实私有 socket → PiBridgeAdapter/Application，验证 working/completed/ack、hello/断线、0600/0700、退出资源清理；以及取消/伪造/旧计划零写入、重复请求、失败/保留与 late handle stop。秘密检查以真实生成 artifact 为正控制；Main IPC/RTL 证明信任窗口、选择/预览/确认/撤回和推送状态，不冒充视觉验收。
- `git diff --check`：通过。实施时完整 diff：`/tmp/agent-pet-m2-desktop-review.patch`，不含两份历史 fixture 或生成凭据。独立审查 **READY**；Main 全量复验 **539 passed / 1 skipped**、类型检查与构建通过（`/tmp/agent-pet-m2-desktop-main-{tests,types,build}.log`）。审查和自动化证据仅覆盖本增量，不替代真实 pi 或视觉验收。

人工操作结果通过 [MVP 人工验收 Checklist](MVP-MANUAL-CHECKLIST.md) 记录，不替代本计划的状态判断。2026-10-08 用户授权 Codex 以 Computer-Use 在独立测试目录验收。原生 picker 的自动点击不可靠，用户手动选定 `/Users/gan/Desktop/🥷/agent-pet-acceptance-nRJIrE` 后，管理页显示正确路径；A1–A8 的常规窗口布局、预览、取消零写入、目标切换失效、独占部署及 0600 文件通过。用户以显式 `PI_CODING_AGENT_DIR` 启动真实 pi，桥接加载与 legacy hello 连接通过。独立配置根初次缺模型凭据，用户随后登录并在原有 pi 发起任务；桌宠只显示一条工作气泡，工作中点击未清除，完成后转为“已完成”，确认后 AX 中通知消失。此后同根 TUI 的重连与断开、同进程选择性撤回均核对一致。P1 同名冲突阻止覆盖、P2 用户修改保留、P3 无关文件保留均在独立目标实际通过；P2 修改后的扩展按保护规则留存。再次以 `/tmp` 中的独立 TUI 提交真实任务，用户现场观察到工作气泡保留、Open Session 不支持提示、完成未读和确认移除；同一桌面进程中正常重启 pi 后，Computer-Use 宠物 AX/截图未见旧完成通知，管理页确认重新收到 legacy hello。此前自建 PTY 无法可靠观察的尝试仍单独保留为未通过证据，不与本次通过混同。可选 C6 没有可证明的真实错误终态。

**仍待验收：** 可选 C6 的真实错误终态、下方已实现增量的日常持久化/桌面重启重配、完整多 Session 与异常重连矩阵及独立应用包。后续若改用其他真实目标，仍须给出精确路径、读写范围、预览、生效条件和撤回方式并获得同意。本轮仅在自建独立测试目标部署并按预览范围撤回，未访问日常 HOME/pi 配置。

验收：用户授权目标与实际版本记录明确；新部署不会重复加载；UI 区分“已配置/等待加载/已连接/失败”；用户在允许时机正常打开或重载 pi 后，真实 Session 建立观察连接。连接依据须符合所选协议，legacy 的 hello 不冒充 managed auth/ack。保存脱敏证据和选择性撤回方法，不泄露 token。单独在线还不是 M3 通过。

### M2/M4 有界重启增量 — IMPLEMENTED-NOT-ACCEPTED（干净桌面重启，尚未人工验收）

基线 `60f8f93`，优先于 M5 打包。新增 [host-only store](../apps/desktop/src/main/pi-connection-store.ts)，接入同一 PiConnection / Main / trusted IPC / preload / 管理页；复用 Application、legacy adapter、协议及 canonical 扩展模板，没有开放 managed guard 或另建 Core/AuthStore。

- 新确认的部署在固定 `userData/pi-connection/connection.json` 私有记录 endpoint/token、目标与 receipt 的身份/metadata/内容摘要、自建目录证据、原运行目录身份和停用状态；目录 0700、文件 0600。确认前 UI 明示持久化及重启政策。记录有大小/严格 schema/本机 hostname+UID/目录身份验证；symlink、权限放宽、未知版本、未完成 pending 写入均可见失败关闭，不覆盖或重建。秘密不进入普通 preferences、IPC、Renderer 或应用包。
- 启动只读自身固定私有 metadata，不读目标、不监听。**恢复已保存连接** 是单独显式动作，重验原 0700 runtime 目录身份、端点不存在及扩展 identity/content 后，使用原 endpoint/token 接收同一个静态已部署扩展；无需 env 或重新部署。旧进程内 artifact 无持久化 receipt 时永不认领。
- 干净退出等待操作及 adapter.stop，保留配置、所有权与原 runtime 目录。**停用接收并保存（保留文件）** 单独保存停用状态；接收与保存结果分别显示，停止或保存失败不会声称完全成功。即使保存失败，下次也不自动激活。late callbacks 在 stop 前作废，不复活连接/业务事件。
- 重启后的选择性撤回先停止接收并保存 disabled，再复用原 receipt 的身份、metadata 和完整内容摘要检查。编辑/替换/未知对象保留，failed-preserved 保留重试证据；只 empty-only 删除仍匹配的自建目录。成功移除并保存空记录后允许同进程重新配置；移除已发生而保存失败明确报告部分结果并阻止重配。接收停止/文件删除不代表运行中的扩展已卸载。
- 原短 `/tmp/ap-*` runtime 必须保持；系统重启、`/tmp` 清理、目录缺失/变化、任何现存 socket 均可能使恢复拒绝，绝不重建/抢占/删除端点来恢复。没有 crash recovery/reset/revoke-all；原子保存只保证干净重启用途，不宣称断电持久性。写入/close/rename 不确定时保留记录、pending 和进程内可用 receipt，停止自动修复；独立人工处理仍需授权。legacy 的 ACL/同 UID 隔离限制不变。

自动化（仅新建自有测试根，未访问真实 pi、userData 或历史验收目录）：focused **120 passed / 12 files**；新增后全量 **578 passed / 1 skipped / 58 files**，`pnpm typecheck` 和 `pnpm --filter @agent-pet/desktop build` 顺序通过。新增 restart/store 测试覆盖第二 controller/store、显式 resume 前无监听/目标检查、同一生成扩展经真实隔离 socket 到 Application、disabled 重启、编辑/替换保留、未知 socket/坏记录拒绝、写/close/rename 不确定结果、撤回重试、并发/late callbacks、secret 正控制与 trusted IPC/RTL。初次 focused 唯一失败为原 process-only 文案断言；更新为新披露政策后一次有界复验通过。既有 Darwin publication `path-changed` 历史 flake 本轮未复现，未改动其实现/测试；Three.js 多实例警告与原 skip 保留。

原 [人工验收清单](MVP-MANUAL-CHECKLIST.md) 的 checked 结果完全不变。[新增重启清单](MVP-RESTART-CHECKLIST.md) 的 R1–R10 已完成人工或隔离故障验收；本增量通过该范围验收，但不外推为整个 MVP/生产安全通过。本增量未安装依赖或打包 `.app`；credential-bearing 测试目录、两份历史 d3 fixture 和失败打包复制品未读取或清理。独立审查 READY；审查指出的旧 env 接入“接收已停止”显示回归已修正，新增启动成功/失败、hello 与 peer 断开时接收状态测试。Main 最终全量复验 **579 passed / 1 skipped / 58 files**，类型检查与 desktop 构建通过（`/tmp/agent-pet-restart-main-{tests,types,build}.log`）。当前下一步为回到 M5 打包：先确定可校验的本地打包路径，再做脱离源码目录的实际 `.app` 验收。

### M3：真实状态、确认、重连与重启 — PARTIAL（正常任务、多 Session、断线重连与重启已由用户验收；取消后下一轮与真实错误终态未测）

剩余取消/下一轮、自然错误终态和边界核对见 [MVP 剩余行为验收](MVP-REMAINING-ACCEPTANCE.md)。

验收同一目标上的 idle → working → completed-unread / error-unread → 点击确认；idle 是无工作/无未读时的宠物基线，不新增 idle 通知。工作中点击不消失，终态确认后旧事件不复活；名称更新、多轮与独立 Session 不互相覆盖。错误必须来自可证明的工作终态，不能把工具单次错误或连接断开伪造为 Agent 失败。

覆盖桌面重启、pi 正常重启/用户安全 `/reload`、连接中断再恢复；只发布当前 working/idle，不回放离线完成/错误；未读无需跨应用重启恢复。取消/retry 的实际观察与未覆盖路径分别记录。Open Session 可诚实返回 unsupported，确认行为仍完成。不由测试者替用户发起 Agent 控制。

验收证据须区分真实 TUI 与合成回归。用户继续使用源码外 `.app` 与隔离 pi 目标，报告 A（空闲时正常退出 pi → 桌面断开但无伪造错误 → 同目标重启重新连接且无旧完成回放）、B（宠物隐藏/显示、管理窗口关闭/菜单重开、应用退出/重开后显式恢复）及 C（两个独立 Session 的气泡和确认互不覆盖）均正常；此轮只收到用户结论，未另附截图或日志。不把该结论升级为真实错误终态、取消/retry 或故障注入矩阵通过。

### M4：日常生命周期、失败提示、停用与选择性卸载 — PARTIAL（隔离目标停用/撤回、断线及窗口生命周期已验，其他失败场景未测）

复用 P1 的关闭隐藏、Dock/菜单入口、单实例和退出等待；验证重新打开、全隐藏找回、退出释放连接。修复阻碍日用的菜单入口问题，未采用的可选登录自启保持默认关闭，不暗中登记登录项。

验收：宠物在 pi 不在线/配置冲突/连接失败时仍可用，界面给出可理解的连接状态而不是伪造业务错误；扩展断线退避、不阻塞或保活 pi。用户可停用接收并选择性移除仍匹配身份与内容的自有扩展/配置，保留用户修改和未知残留；重启后停用不自动复活。清理或持久化失败如实报告，不谎称完全卸载。直接拖删 `.app` 不承诺自动清理，给出卸载前入口与残留说明。不实现自动 recovery/reset/revoke-all，不用删除未知 owner/lock 修复故障。

### M5：脱离源码目录可运行的本地应用包 — VERIFIED（本机未签名 arm64 范围）

已取得明确授权并安装 `electron-builder@26.15.3`（根开发依赖及 lockfile）。新增 `apps/desktop/electron-builder.config.mjs` 与 `scripts/package-desktop.mjs`：复用现有 `electron-vite` 输出，固定 `com.agentpet.desktop` / `Agent Pet` 元数据和 macOS `arm64` 目录目标；输出脚本拒绝非空目录，默认创建源码树外的 `/tmp/agent-pet-m5-*` 目录。仅携带 Electron runtime、bundled Main/preload/renderer 和 `starter.glb`，通过 ASAR 排除 `src`、`node_modules`、workspace 与 pi/managed Worker/native 资源；未设置签名凭据或自动签名。

2026-10-08 的失败复制品 `dist/agent-pet-local-n86P5a`、`dist/agent-pet-local-1P3yhK` 和两份历史 `.d3` fixture 目录保持原样，未清理。2026-10-09（本次）在 Apple Silicon `arm64` 上构建独立产物 `/tmp/agent-pet-m5-package-20260301-final/mac-arm64/Agent Pet.app`；`app.asar` 检查确认 Main/preload/renderer HTML、bundled JS 与 `starter.glb` 存在且无源码/workspace/node_modules 路径。直接启动时使用全新 `/tmp` profile/HOME，并解除 `AGENT_PET_PI_ENDPOINT`、`AGENT_PET_PI_TOKEN`、`ELECTRON_RENDERER_URL` 与 `NODE_OPTIONS`；进程保持运行至 10 秒有界 smoke 停止，未访问日常 HOME、pi 配置或真实 acceptance 目录。`codesign --verify --deep --strict` 如实失败（无签名资源/Developer ID），因此不构成 Gatekeeper、签名、公证或分发验收。

验收：产物自带 Electron runtime，可从源码树外启动，无需 Node/pnpm/开发服务器；外部 pi 不被捆绑或自动安装。M5 已完成本机人工验收范围：用户从源码树外打开桌面 `.app`，隔离 pi 部署/连接、任务状态、停用与撤回流程均报告正常。产物仍为未签名本地 arm64 包，不代表 Gatekeeper、正式签名、公证、跨机器分发或自动更新通过；这些继续单列后续工作。

M5 packaging checklist（用户人工验收结果）：
- [x] 从源码树外的 `/Users/gan/Desktop/🥷/Agent Pet M5.app` 打开；界面正常，可重新打开，无启动错误。未签名限制保留。
- [x] 使用项目内可见隔离目录 `m5-acceptance/`，人工检查管理页、宠物、连接与任务状态；实验结果正常。
- [x] 在隔离 pi 目标上复验部署、连接、状态、确认、停用/撤回；用户报告实验结果正常。真实凭据仅以用户授权的 `auth.json` 副本供隔离目标使用，未读取或输出内容。

## 历史材料与后续生产化

- [P2 实施记录](DESKTOP-P2-IMPLEMENTATION.md)：B1–B4.4a 的实现与证据，非当前待办顺序。
- [连接](DESKTOP-P2B-LOCAL-CONNECTION.md)、[文件系统/D6](DESKTOP-P2B2-FILESYSTEM-POLICY.md)、[生命周期](DESKTOP-P2B2-LIFECYCLE-DESIGN.md)：现有机制不变量及旧严格准入；延期的验证保持未关闭。
- [安装契约](P0-MANAGED-INSTALLATION.md)、[本机安全研究](P0-LOCAL-SECURITY-DECISION.md)、[发布研究](P0-SECURITY-RELEASE-RESEARCH.md)：按 M1 路线取用已有正确性/所有权要求，不把未来全部生产承诺重新塞进 MVP。

M1 已选定 legacy 并验证临时合成切片；M2 为 PARTIAL（隔离目标预览、部署、连接、撤回和干净重启持久化已验；正式发布/生产安全未验）；M3 为 PARTIAL（正常任务、确认、多 Session、pi 断线重连和应用重启后显式恢复已由用户报告正常；真实错误终态、取消/retry 未验）；M4 为 PARTIAL（隔离目标停用/撤回、P1–P3 文件保护及窗口生命周期已验，其他失败场景未验）；M5 为 VERIFIED（本机源码外 arm64 `.app` 的启动、隔离 pi 连接、任务状态、确认、停用与撤回已由用户人工验收；未签名本地包限制仍保留）。原连接测试目标与 P3 的扩展已选择性移除；P2 中被测试修改的扩展按保护规则保留，pi 生成的配置与登录凭据保留。后续只在对应检查点取得证据后更新状态；技能是复用流程而不是项目进度表，当前优先级留在本文件和 AGENTS，不复制进通用 skill。

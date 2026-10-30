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

## 下一轮待办实施顺序

用户要求先处理现有问题，再规划并推进功能；生产签名、公证、自动更新放到最后。以下是执行顺序，不将历史未测项改为通过。

1. **稳定性收尾（先行门槛）**：缓存遗漏清理已由 `adad08e` 修复。继续核对 Pi 单 socket 切换 Session 时旧归属是否释放、认证超时是否真正销毁失活连接、heartbeat 与旧扩展兼容性、消费者发布失败后的重试，以及 renderer 崩溃恢复是否有循环风险。逐项用现有公开边界回归确认；仅修复能复现的问题，不增加新框架。完成后运行全量测试、typecheck、desktop build，记录未覆盖的睡眠/唤醒与长时间实机场景。
2. **Antigravity CLI 能力核对**：先核对官方事件/扩展接口、支持版本与隐私边界，不从进程存在或正文猜业务状态。交付可支持事件表和最小接入方案；若缺可靠接口，记录阻塞并转入下一项，不做私有协议逆向或无限探测。本机安装检查、真实启动与配置改动另给精确预览。
3. **Antigravity CLI 最小接入（以上一步证据为前提）**：按输入白名单 → 认证传输/会话身份与生命周期 → Main/配置预览与选择性撤回 → 正式 UI 四个可独立验证阶段推进，复用现有 Provider/Application 边界。每阶段有隔离 fixture 回归；真实模型/日常部署须独立授权。没有可靠任务事件时明确保持能力未知。
4. **自定义宠物加载与播放（收窄目标）**：直接复用现有 Three.js GLTFLoader、AnimationMixer 和名称映射。只交付“选文件夹 → 安全复制 → 选择/绑定 → 播放已有 clip → 失败回退/释放资源”。不做骨骼编辑、重定向、IK、动画生成或自行重写 glTF 动画语义。保留边界安全与资源上限，不再扩展内部精细校验；先修复预览/复制竞争与失败残留，再接 UI。入口在闭环验证前保持禁用。
5. **集中实机验收**：区分 Provider 支持与不支持的取消、下一轮、错误、等待、并发、断线恢复；补内存/GPU长时间观察及系统重启。dev 日常使用正常不替代专项验收。最新源码外 `.app` 的完整交互检查与启动 smoke 分开记录，操作前确认隔离范围。
6. **桌面宿主接入**：Codex、Antigravity 桌面端最后分别做官方能力与身份边界核对，不能直接套用 CLI 已验收结论。方案成立后再按独立阶段实现。
7. **正式发布**：签名、公证、分发、更新及生产隔离验收留到功能阶段之后；既有 guard 与未通过状态保留。

每个实现阶段按“回归复现 → 最小实现 → 聚焦测试/类型检查/构建 → diff 检查 → 单目的本地提交”交付；不默认推送、不新增依赖、不升级或重启日常 Agent。仅规划文档不强行独立提交，随对应工程阶段补充实测结果。

### 稳定性收尾：同 socket 切换 Session

真实隔离 socket 回归确认：新 Session 的 hello 会覆盖 mapper 上下文，原 Session 没有断开清理。现仅在身份变化时先发布旧会话的断开/空活动事实，再建立新基线，不让配置在线状态闪断；重复同身份 hello 保持原行为。相关 16 项测试、typecheck、desktop build 与 diff 检查通过。认证超时、旧扩展兼容、发布失败重试与 renderer 恢复循环仍待核对，未标整项完成。

### 稳定性收尾：认证空闲与旧扩展兼容

核对发现 `0a1a560` 设置的认证后 30 秒 socket timeout 仍复用仅在未认证时销毁的回调，因此并未实现 heartbeat lease。已恢复认证后禁用空闲计时器，避免将来直接启用销毁误断开不发送 heartbeat 的旧扩展；新扩展的 heartbeat 仍可发送，但不是强制存活契约。未认证 1 秒空闲关闭与 32 peer 上限保持。13 项连接/重连回归、typecheck、desktop build、diff 检查通过。此项不证明能检测已认证但卡死的进程；可靠 lease 需先协商能力并验证睡眠/唤醒，不把有效连接的静默视为失败。此前“认证连接 heartbeat lease 已完成”的表述予以纠正，managed 接收器未改。

### 稳定性收尾：Main 消费者发布失败

PiConnection 先提交版本再发布会导致消费者抛错后，同版本再次交付被丢弃。现失败时恢复先前版本（首条则移除），但不覆盖重入的新记录或已开始的停止清理；成功后才执行历史回收。39 项连接/重启回归、typecheck、desktop build、diff 检查通过，包含失败后重交付与发布中停止再抛错。范围仅为 Main observation sink：没有新增传输 ACK/自动重发，不能声称 wire 同序号重发已支持；mapper 消费序号与跨层部分发布失败仍需后续独立核对。

### 稳定性收尾：renderer 恢复上限

回归确认两个窗口在 did-finish-load 时重置重试次数，会让“加载完成后立即崩溃”无限重载。已删除该重置，每个窗口实例最多自动恢复一次；再次崩溃须人工重开应用/重建窗口，不伪称持续自动恢复。32 项 Main 测试、typecheck、desktop build 与 diff 检查通过；测试模拟真实事件次序，不等于原生崩溃注入验收。

### 后续功能：Antigravity 阻塞与宠物导入第一阶段

Antigravity 官方 hooks/plugins 原文抓取被网络安全检查阻止，后续搜索返回 `No search provider available`。研究运行 `e83cc2af` 仅取得候选链接，不能作接口规范；用户同意暂缓该 Provider 并转入宠物导入。不得将工具失败表述为官方没有接口。

宠物导入保持禁用。第一阶段把旧的 12 字节 GLB 魔数检查替换为完整容器长度/JSON/BIN 分块检查，限制 64MiB 文件、1MiB JSON、512 nodes、128 meshes、2048 accessors/bufferViews、64 images/textures/animations/skins、16 scenes、128 materials、累计一百万 accessor 元素及两万 JSON 遍历项；拒绝 URI（含 data URI）、扩展与 sparse，检查 bufferView 范围。模型读取改为 O_NOFOLLOW/O_NONBLOCK、fstat 有界读取与读前后 metadata 核对。22 项聚焦测试、typecheck、desktop build、diff 检查通过，内置 starter 实际字节作为正对照。

这不是完整 glTF 安全验证：节点引用/环、accessor 类型/跨度、图像解码像素预算、动画/绘制预算仍待补；manifest/avatar 与安装复制的 TOCTOU、未知目录保护/失败回滚仍待修复。未恢复 UI/IPC、不触碰用户资产，不将读取前后检查宣称为整个安装流程抗竞争。

### 宠物导入：失败时保留未知目录

回归复现安装失败 catch 会递归删除未登记的同名用户目录。现改为排他创建目标目录、排他复制文件，拒绝已有目录（含空目录），取消所有失败路径的递归删除；索引保存失败保留未登记文件，后续同名导入拒绝自动接管。25 项相关测试、typecheck、desktop build 与 diff 检查通过，覆盖未知文件、空目录身份和保存失败期间加入的用户文件。残留需要后续所有权清理机制，暂不自动回滚；源文件竞争、解码预算与 UI 披露尚未完成，导入仍禁用。

### 宠物导入：节点图与 accessor 布局

已增加节点子引用/默认场景/场景根/mesh、skin、camera 索引检查，拒绝循环、重复子节点、多父节点及超过 128 层的层级；未被场景引用的节点同样检查，允许不同场景共享同一棵合法树。accessor 检查 component/type、normalized、bufferView 索引、偏移对齐、stride 范围与最终元素字节跨度；保留无 bufferView 的零初始化与矩阵列填充/末列可省略尾填充的合法情况。新增 30 项用例，相关 55 项测试、typecheck、desktop build、diff 检查通过。

范围不是完整 glTF schema：skin/动画/primitive 内部引用、索引值、解码纹理和最终绘制预算仍待实现；安装竞争保护和残留清理仍未完成，UI/IPC 导入入口继续关闭。

### 宠物导入：几何实例预算

新增 primitive/attribute/index/material 引用与基础类型检查、单 primitive 最多 16 attributes/8 morph targets、全模型最多 256 primitives；按全部节点实例累计最多 256 个 primitive 绘制项、50 万顶点工作量（含 morph targets）及 50 万绘制元素，未实例化的几何也受总量限制，避免共享小 mesh 被大量实例引用绕过预算。预算是保守准入估计，不代表真实 draw call/GPU 性能保证。新增边界、超额、非法引用与 morph 工作量测试；71 项相关测试、typecheck、desktop build、diff 检查通过。

仍未检查索引缓冲实际数值、完整属性语义、skin/动画引用或纹理解码资源；入口继续关闭，下一步补纹理预算。没有新增依赖、模型导入或日常配置变更。

### 宠物导入：内嵌纹理预解码预算

内嵌 PNG/JPEG 增加有界结构/尺寸预检：单图片最多 4MiB、长宽各不超过 4096、全模型图片及纹理引用分别累计最多 16Mi 像素；重复 texture 引用计入预算。检查 image.bufferView、MIME 和 texture.source/sampler 引用，拒绝 URI、WebP/KTX 等未支持内嵌格式、APNG/压缩 PNG 元数据、JPEG 多帧/动态高度及过多扫描；支持静态 PNG 和 8-bit baseline/progressive JPEG 的尺寸读取。该子集限制针对 GLB 内嵌纹理，不改变头像格式契约。

85 项聚焦测试通过；最终全量 127 文件、1438 passed / 1 skipped，typecheck、desktop build、diff 检查通过。测试包括真实小 PNG 字节与明确标注的尺寸/结构合成 fixture；没有把 JPEG 合成头或修改尺寸的 PNG 当成真实解码成功。此阶段不解压像素、不校验完整压缩流/PNG CRC，也不保证真实 GPU 峰值（位深、mipmap、材质变体仍有额外开销）；损坏图片解码失败隔离、动画/skin 校验、源文件竞争保护和安装残留清理仍待完成，导入入口保持禁用。

### 宠物导入：动画与 skin 引用预算

新增动画 sampler/channel/target 引用、插值枚举、输出类型与数量检查（含 CUBICSPLINE 三倍输出和 morph weights 数量），拒绝同动画重复目标、matrix 节点上的 TRS 动画及动画 accessor 的交错 stride。读取实际时间缓冲区，要求有限、非负、严格递增且不超过 3600 秒；每 sampler 最多 1 万关键帧、总计 10 万，每动画最多 256 sampler/channel、总计 1024 channel、累计输出 100 万标量分量。skin 要求非空唯一 joints、有效 skeleton/inverseBindMatrices 引用与浮点 MAT4 数量，单 skin 最多 128 joints、累计 1024。

112 项聚焦测试、typecheck、desktop build、diff 检查通过，真实 starter GLB 保持通过；本轮未重跑全量。仍未完成几何索引实际数值、JOINTS/WEIGHTS 与 skin 的绑定关系、动画输出/逆绑定矩阵数值语义及完整解码验证；源文件竞争、残留清理与 UI 闭环未完成。入口保持禁用，不将结构预算等同于完整安全导入。

### 用户纠偏：只加载 GLB、调用已有动画

本条覆盖前述继续细化骨骼/动画校验的待办。移除自写的关键帧逐值扫描/时长政策、插值与输出数量配对、morph 动画基数推导、TRS/matrix 判断、逆绑定矩阵语义检查，动画解释交给现有 GLTFLoader/AnimationMixer。删除对应的越界产品职责断言；文件边界、节点环/缓冲区越界、资源计数/纹理上限、未知文件保留测试继续保留。现有玩家只按 clip 名称播放，不新增骨骼控制层。

下一步仅推进：固定预览字节的安全安装 → 失败保留/提示 → 复用现有导入 UI 与绑定 → 加载失败回退和正常/无动画 GLB 验收。不以“补全所有 glTF 语义验证”作为交付门槛，也不宣称任意第三方资产都安全或流畅。

### 按收窄目标推进：固定预览字节安装

`7783509` 已完成语义校验精简，相关 135 项测试及 typecheck/build 通过。随后统一 manifest/model/avatar 为有界 O_NOFOLLOW/O_NONBLOCK + fstat 读取，删除重复路径检查/魔数重读和安装时的 copyFile：只保留最近一次预览的私有字节快照，安装消耗该快照并用 wx/0600 写入，拒绝伪造、改动和旧预览。源文件在确认前被替换不会改变实际安装内容；这不是对任意祖先目录并发替换的系统级隔离保证。新增源文件变更、manifest symlink、预览篡改/失效回归，95 项相关测试和 typecheck/build 通过。未知目录/失败残留保护保持；导入仍未接回 UI，取消释放与失败提示随 UI 闭环处理。

### 导入闭环：Main 预览取消与确认

已接通 Main 原生文件夹选择、去路径预览、一次性 token 确认与取消；重新选择、窗口关闭/加载/renderer 退出及应用退出会失效并释放预览字节，迟到 picker 结果丢弃。旧 token 取消/确认不会破坏新预览。注册表异常、数量上限和重复资产在安装前拒绝；失败提示明确文件/残留保留，不自动删除。50 项 Main/导入/preload 测试、typecheck、desktop build、diff 检查通过。原生选择与真实文件导入尚未实机验收，Renderer 收藏页入口仍未恢复；没有读取用户模型或重启日常 dev。

### 导入闭环：收藏页与已有播放器接线

收藏页恢复“添加宠物”，使用现有抽屉/按钮展示 manifest ID、大小、许可和快照复制说明；确认后进入收藏并选择该资产，继续复用原绑定与 clip 名称播放链路。取消/关闭释放预览，迟到选择结果取消，失败不显示成功且要求新预览。模型字节不可读时明确提示内置回退；场景加载失败仍保留控件，换资产后重建错误边界恢复，不新增骨骼控制。

测试首次因真实 petAssets API 下临时空数组不断重建触发启动 effect 循环超时；固定空状态引用后一次复验消除循环，另更新一处残留“未开放”旧断言。最终全量 129 文件、1465 passed / 1 skipped，typecheck、desktop build 与 diff 检查通过。正式 Renderer 隔离浏览器宽/390×844 预览可见，无按钮遮挡，截图位于 `/tmp/agent-pet-import-preview.png` 与 `/tmp/agent-pet-import-preview-narrow.png`（示例数据，未提交确认）。

代码入口已开放，覆盖此前“UI 禁用”的阶段状态；尚未进行真实 Electron 原生文件夹导入/第三方 GLB 解码和长期 GPU/缓存释放验收，也未重启日常 dev、打包或触碰用户模型。失败残留目前保留并提示，不能自动接管同名目录；此限制继续记录，不宣称完整自动清理或任意模型安全保证。

### 用户实测反馈：导入兼容性与显示语义

用户确认动画播放正常，随后反馈解绑未立即消失、桌面无连接仍常驻且不能按 Agent 多宠物显示；新要求为仅在线且明确绑定的配置展示宠物，覆盖此前“解绑回退全局默认”和“桌面单宠物”规则。显示修复独立实施，不将反馈记为已通过。

指定目录 `/Users/gan/Downloads/小小格温-AgentPet` 只读复现 `invalid-model`：GLB 5.5MB、JSON 1766708 字节、7431 accessors、213 joints、15 clips/9408 channels、241979 keyframes、820128 输出标量，纹理 256/512/256 像素轴；文件权限正常。第一阶段调整过小的元数据准入预算为 JSON 4MiB、8192 accessors、25万遍历项、每 skin 256 joints、每 clip 1024 sampler/channel、累计16384 channels/50万 keyframes；原64MiB文件、节点/缓冲区/几何/纹理和100万 accessor元素/输出标量上限保持。仅放行现有 GLTFLoader 原生支持的材质 `KHR_materials_unlit: {}`，不安装 decoder、不允许其他扩展、外部URI或扩展载荷。合成计数 fixture、边界/拒绝测试和全量1468 passed/1 skipped、typecheck/build通过，未提交用户模型/内容。

**原包仍未通过，导入项在一次有界复验后停点：** 后续只读定位到内嵌 PNG 含 `bKGD` 和未压缩 `tEXt`，当前图片白名单拒绝；没有继续修改PNG guard、重写或自动导入用户文件。最小探针及失败证据保留于 `/tmp/agent-pet-user-import-repro.test.ts`、`/tmp/agent-pet-user-import-rejection.log`、`/tmp/agent-pet-artist-import-green.log`。下一步需同协议恢复后单独覆盖这两类元数据，而不是关闭图片预算。自动化绿不代表原包导入已修好；动画播放仅记录用户此前的实测，不推断该未导入资产已解码。

### 显示修复交回与主工作区复验

用户批准把隔离 lane 的补丁交回 Main 后，已审查并应用 `/tmp/desktop-pets-display-handoff.patch`：桌面按 configuration ID 管理独立窗口，仅在线且显式绑定时创建；解绑/离线即销毁并撤销其 IPC 身份，每窗口独立拖拽、布局、命中和一次 renderer 恢复预算。会话/气泡、绑定资产和名称按配置投递，跨窗口 Session 操作/资产请求拒绝，退出清理所有窗口。首页不再对未绑定配置回退 starter。设置移除“Agent 未启动时显示”，旧 offline 数据只保留兼容；CONTEXT 和当前需求同步新语义。

原 lane `d2c776c1-56c2-41c3-ae84-8e89f061e310` / worktree 分支 `pi-subagents/desktop-pets-d2c776c-8f36-s0-t0` 基于272ddf5，构建因宿主 node_modules symlink 触发 `ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH` 停止，未绕过。停止前全量1436 passed/36 failed/4 skipped；主工作区先重现4项依赖旧 fallback 的集成断言，再给fixture显式绑定，不删除在线/断线/清理断言。另32项store-corrupt在主工作区未复现，不认定它们的原环境根因已查明。

最终主工作区聚焦79项、全量130文件1478 passed/1 skipped，`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build` 与 diff检查通过。测试覆盖同Provider多配置、无eager默认窗口、即时解绑、迟到ready事件、跨配置拒绝和全部窗口清理；这是自动化/构建证据，不代替真实桌面多窗口、显示器切换、长时间资源与日常Agent实机验收。导入原包仍停在上条PNG元数据限制，未将显示交付冒充导入修好。

### 用户批准恢复：PNG 元数据兼容

用户要求继续修复后，仅在 PNG chunk 白名单增加 `bKGD`（背景色）和 `tEXt`（未压缩文本），不替换头像/纹理、不修改指定源文件；其余尺寸、4MiB编码大小、chunk范围/数量、纹理累计像素预算和压缩元数据/APNG拒绝保持。先以合成结构fixture复现失败，再一行修复；相关103项通过，包含指定目录的真实只读 `inspectPetFolder` 预检成功（探针未入库）。因此覆盖此前“原包仍被PNG拒绝”的停点，但不推断原生确认/安装和GLB解码已实测通过。

最终全量130文件1480 passed/1 skipped，typecheck、desktop build、diff检查通过。用户仍需在新版dev重选 `/Users/gan/Downloads/小小格温-AgentPet` 确认导入、播放并复测解绑/多桌宠；没有自动安装该模型、触碰Agent配置或推送。

### 用户验收与导入弹窗重设计

用户在 d13d976 上确认 Agent 启动/关闭、切换宠物和导入均正常；这是用户实测反馈，不扩大到未测的长期资源/发布项。随后要求将粗糙的收藏内联导入改为独立弹窗。

正式 Renderer 现以现有原生 Dialog + 共享玻璃 panel 承载“选择文件夹 → 预览 ID/大小/许可 → 确认”。收藏抽屉保留在下层，两个 dialog 为同级，导入期间仅保留一层遮罩；Escape/背景/取消只关闭导入并回焦“添加宠物”。支持重新选择、读取状态、失败重试及残留提示；取消请求失败保留弹窗并允许重试，关闭/页面切换释放预览，迟到 picker 结果取消且不重新打开弹窗。确认期间禁用关闭，强制卸载后的迟到确认不自动切换宠物；已发送的安装不是可撤销操作，未修改 Main 的快照/一次性 token 或文件边界。

先用正式 ManagementApp 回归得到2项红测，再实现；聚焦52项通过，最终全量131文件1490 passed/1 skipped，typecheck、desktop build和diff检查通过。新增浏览器隔离场景 `/management-review.html?case=pet-import`、`pet-import-error`、`pet-import-residue`，只用内存收藏和内置 GLB。此次实现尚未进行浏览器视觉/真实原生弹窗验收，待 Main 独立检查宽窄布局、遮罩和焦点；未重启日常 dev、未改 Agent 配置或模型文件、未提交/推送。

### 桌面宠物拖动反馈

仅复用现有 `dragging`（被拖动）触发项：实际屏幕 DIP 位移后播放对应 clip，按最近非零位移主轴识别上下左右，在动画根节点外的 group 上施加固定 ±10° pitch/yaw；不新增方向动画、不操作骨骼。按下未移动不触发，尺寸拖拽不触发；松开、取消、丢失捕获、失焦或卸载释放反馈。减少动画时倾斜为零且 clip 暂停；缺少映射沿用 idle/静态回退。拖动期间不消耗业务一次性 cue，方向/新业务 replay 不重启拖动 clip，结束后恢复最新业务展示。

已先复现 gesture 和真实 Three 播放测试失败，再最小接线；聚焦62项通过，全量131文件1501 passed/1 skipped，typecheck、desktop build、diff检查通过。测试包含真实 DOM 手势到 PetModel props、真实 GLTFLoader/Drei/AnimationMixer 的姿态与 cue 行为；未做原生桌面/用户资产视觉拖动验收，不宣称 GPU 或实机手感通过。没有改 Main/IPC、导入弹窗、用户模型或 Agent 配置，也未处理格温循环边界卡顿。

### 格温循环接缝：源特定候选拒绝，待作者修订

用户已澄清是动画末尾停顿/前后衔接不自然而非掉帧，并确认作者只交付自然循环动画；对外仍只有触发时机→准确clip名，不新增裁尾、混合、速度或循环区间控制，应用不自动加工导入素材。契约同步至[作者指南](PET-ARTIST-GUIDE.md#循环动画交付要求)与架构设计；原22项、fallback、单次/rest和可见性保持。

在`a8a006b`基线上仅克隆Three内存clip做一次/tmp源特定缩尾实验：Idle_Base/Cast_Cycle/Run_Haste的0.25秒人工闭合压至原采样帧约1/30秒，保留关键帧值和正文。两种差分步长均显示Run_Haste接缝速度差恶化约43.1%；前两项仅改善约3.4%/5.0%，不构成自然循环证明。候选整体拒绝，未导出GLB/可安装包，未继续调参。首探针LoopOnce终点clamp取样问题经一次有界修正后复验；原慢尾信号、track校验、原clip/原文件摘要不变断言通过，不代表候选通过。

详细数字与临时脚本路径见[循环诊断后续实验](GWEN-LOOP-DIAGNOSIS.md#源特定时间修正实验候选拒绝)。原GLB SHA-256仍为`3f0aeb7490c46ac279c6263604503e2871e50c7fb1226d0b05a057bbbfc5dae1`；无生产/永久测试变更、资产写入、安装/重绑定、依赖、dev重启或推送。文档阶段只做diff与链接检查，未重跑typecheck/build/全量；没有候选可做GLTF重载/导入预算验收。

**当前阻塞：需作者在DCC中修订原循环轨迹的首尾姿态/速度/方向，去掉人工慢闭合段并重新制作自然接缝，不是仅删尾或增加manifest选项。** 重新导出后再做格式/预算及实际循环至少3轮视觉验收。本次未修复用户可见停顿，不再将掉帧录屏作为素材接缝工作的前置。

### 格温循环卡顿：初次有界诊断记录

基于 `82fed8c`，只读授权的原包，使用实际 GLTFLoader/Three 姿态取样及正式 PetModel/ScenePet→Drei→PreferenceRenderLoop 控制流探针。Idle_Base/Cast_Cycle/Dance_Loop 两入口各3轮，在受控60Hz与普通重渲染下没有额外 reset/finished 或边界等待，相位误差<3e-13秒；不等于原生RAF/GPU无卡顿。原素材Idle_Base/Cast_Cycle/Run_Haste的0.25秒尾段骨骼位置RMS平均速度分别为正文约2.08%/2.65%/4.02%，但Idle_In约94.75%、Cast_Damage约129.59%；部分源迟滞已量化，仍不能解释用户“所有动画”。Dance_Loop无补尾却有端点姿态差，而且原映射success实际是单次，不因clip名称而循环。

完整方法、指标、探针路径和停点见[格温循环诊断](GWEN-LOOP-DIAGNOSIS.md)。首次探针spy落在错误Three实例，修正为实际Drei mixer后一次复验1 passed；独立固定时刻源姿态断言通过，原播放器/调度器53项通过。模型前后SHA-256一致，没有生产/测试实现变更、依赖、用户资产写入、dev重启或推送；仅提交完成的诊断与进度报告，未重复typecheck/build/全量。

初次诊断曾要求一个明确场景/触发项的至少3轮录屏及FPS/减少动画设置，必要时同步原生帧间隔和动作时间；该下一步已被上节用户澄清与源特定实验更新。尚无完整用户症状红/绿信号，不盲裁尾、变速、混合/生成动画或改骨骼；源素材调整须另行决定，原22项触发与fallback保持。

### 触发接线审计与后续顺序（当前22项）

用户确认：Agent无独立休眠概念，删除仅目录预留的 `sleeping`，保留 `idle`。同步公共类型、JSON目录、作者模板和设计说明；旧包携带该字段按既有未知映射规则忽略，不修改用户模型/包，不增加休眠计时器，不改变其他fallback。新增回归覆盖删除与旧包兼容。验证：聚焦10项、全量133文件/1524 passed/1 skipped，typecheck与desktop build通过；未修改用户资产、未重启应用或做原生视觉验收。

用户要求逐项核对后，已完成[触发审计](PET-TRIGGER-AUDIT.md)：区别目录/试播、真实事件来源、Renderer接线和原生验收；不把23项目录等同23项自动支持。拖动阶段已提交 `84edb31`，Main复核62项通过，子执行全量1501 passed/1 skipped、typecheck/build通过，真实方向手感未验。

hover/selected 与 connected 已按下节完成工程接线，原生视觉待验。后续顺序：①保留连接重挂/重连有界缓存限制并待实机验收；②Claude max_output_tokens 细类核对已到证据停点（见下节），取得精确原生语义前保持 generic error，其他缺原生可靠事实的 Provider 能力保持未知；③sleeping已按用户确认删除，仅保留idle空闲；disconnected保持现有离线立即移除、不私加延迟，attention暂仅回退；④按Provider/多Session/隐藏与reduced/快速事件/缺映射集中验收。短事件当前latest-wins，不保证每段完整播完，不擅加队列。格温循环接缝单独处理，不归入触发接通完成。

### 本地 hover / selected 接线

桌面和首页通过真实 R3F 模型进入边沿播放 `hover`，跨同一模型子 mesh 不重播；工具栏容器进入仍只管理工具栏。首页模型点击和在线宠物选择按钮的点击/Enter/Space 经同一显式计数触发 `selected`；初始焦点、重渲染、重挂和收藏缩略图不冒充场景选择，桌面未新增选择交互。复用现有播放器和目录，增加实例内最小 latest-wins 反馈，不加业务 IPC/队列/骨骼处理。

本地反馈播放一次即释放，悬停退出、取消选择、窗口失焦/隐藏、pointercancel/lostcapture、页面离开和卸载有界清理；拖动优先且不恢复被覆盖的旧 hover。交互期间业务 cue 不被消费，结束恢复最新业务请求/rest，已消费 once 不重播。缺交互 clip 不重置工作，reduced 不启动局部反馈，无动画仍静态；既有 fallback、一次语义、按配置隔离、在线绑定过滤及离线立即移除不变。

先以 PetModel 真实 GLB hover、HomeScene 接线、CompanionScene 明确选择分别取得红测试，再最小实现；追加子 mesh 切换红测并修复误重启。新增12项回归，聚焦 **98 passed / 7 files**；`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`pnpm test --maxWorkers=1`（**1513 passed / 1 skipped / 132 files**）通过。首轮 hover 完成断言未用 act 刷新 React 状态，补 act 后一次复验通过；Home fixture 首个 Work 数值断言校正到既有已知 0.3s 姿态后确认实际缺接线红测。未改生产阈值或旧保护测试，Three 多实例警告保留。`git diff --check` 通过，完整差异已核对仅含本阶段 Renderer/回归与相关文档。

这是 DOM 接线与真实 GLTFLoader/Drei/AnimationMixer 自动化证据，不是原生桌面/用户模型/GPU视觉验收。未重启 dev、未打包/推送、未操作真实 Agent/模型/配置；格温循环接缝未处理。当时下一独立阶段是 connected 的配置边沿/幂等核对；现已由下节独立阶段完成。

### 配置 connected 边沿接线

本阶段基线 `4852c7b`（上一阶段 hover/selected 已提交、工作区干净）。Main `Configurations` 只按已认证配置聚合离线→在线生成临时 `connectionCue`，离线清除；同配置第二 Session/重复发布/部分退出/命名/绑定切换不生成新身份，真正重连才换 ID。身份不写入 configurations metadata，不改变 Provider 业务事实、未读或协议。桌面沿既有 per-window `pet:snapshot`/preload/store/PetCanvas 接线，首页沿配置投影/HomeScene 接线；无新 IPC 命令、持久事件总线或队列。

共享播放器只在 idle/中性 presence 上播 connected once，当前工作/业务结果（包括已消费结果的请求）、拖动和本地交互优先；被覆盖/reduced/缺失的连接 cue 不等待下次 idle，新业务立即替换连接反馈。绑定模型URL未就绪时不让临时 starter 消费cue；读取失败保留既有fallback，不声称已播放连接。原动作键、schema、fallback、单次业务幂等、在线绑定过滤和离线立即移除保持，不实现 disconnected。

每个视觉 surface 可呈现同一配置边沿，复用既有 Renderer 模块最多256项缓存：同 Renderer 页面重挂不重播；renderer崩溃/窗口销毁后缓存丢失，可再次呈现同一ID，但 Main 不制造新边沿。这是明确的缓存范围，不承诺跨Renderer exactly-once；不是用户级持久回执。

红绿证据：配置真实隔离socket首次边沿缺失、PetModel真实GLB连接播放缺失、desktop/App/Home三处投递缺失，以及自定义模型等待阶段提前消费cue均先失败、最小实现后通过。新增 **10项**，更新已有pi/Claude/Codex/preload/store回归：无效peer不产cue、双Session/部分与全部断开/重连/配置隔离、未读保留、非持久化、旧窗口late-ready拒绝、恢复snapshot身份稳定、旧initial响应/订阅忽略、Home重挂、业务/局部反馈优先、最新业务替换、无clip/静态/reduced与延迟模型加载。

顺序验证：聚焦 **126 passed / 13 files**；`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`pnpm test --maxWorkers=1`（**1523 passed / 1 skipped / 133 files**）通过。`git diff --check`通过；差异已检查，仅本阶段源码/回归/设计与进度文档。日志 `/tmp/connected-{focused,typecheck,build,full}.log`；预期红测日志另存 `/tmp/connected-{aggregate,player,wiring,asset}-red.log`，没有非预期失败或基础设施回退。Three多实例警告和既有skip保留。

以上是Main/IPC/DOM和真实GLTFLoader/Drei/AnimationMixer自动化，不是原生窗口/GPU/用户模型视觉验收。未重启dev、打包、推送、安装依赖、访问真实Agent/模型或修改用户资产/配置。格温循环接缝仍独立未解决；后续明确业务细类或真实视觉验收不混入本阶段。

### connected 审查修复：首次 preferences 之前不消费连接 cue

基线 `c40dc61`，独立审查 Finding 1 经实际 App→PetStore→PetCanvas 回归确认：按 Main 的真实顺序分开发布带 cue 的 idle snapshot、首次 preferences，允许 React effect/微任务执行，临时 starter 在绑定未知时仍收到 `connected:bound:1`（预期 undefined）。原测试在同一 act 先发 preferences，漏掉了此竞争；现已改为真实顺序，随后等待自定义资产字节再放行。

最小实现仅增加 store 的 `preferencesReady` 与 PetCanvas 的连接 cue 门槛：仅当前订阅的 preferences 回调标记就绪，窗口 store 重订阅保留已知绑定；generation、旧响应/订阅守卫不变。真实 starter 首次确认后正常放行，自定义模型等待/读失败保持原 fallback，不新增 IPC 或调整 Main 发送顺序。播放器、业务/本地/拖动优先、latest-wins、Renderer 256 项缓存、22 项目录和离线立即移除均不变。

新增5项、更新1项回归：App 独立消息顺序/真实 starter/资产不存在和读取拒绝/卸载，store 同对象首次偏好/旧订阅/重订阅，以及 PetModel 真实 GLTFLoader/Drei/AnimationMixer 的临时 starter→绑定模型 connected once、普通重渲染不重启/不重播。播放器 seam 使用仓库内置 GLB，不依赖用户文件；App seam 验投递 props，非原生 IPC/GPU 端到端。

验证：预期红测1项；最小修复后该项通过；聚焦 **99 passed / 6 files**（含 Main desktop-pets、App/PetStore、PetModel、ScenePet/HomeScene、WebGL失败隔离）；最终 `pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`pnpm test --maxWorkers=1`（**1529 passed / 1 skipped / 133 files**）通过。首次 typecheck 在两处新增 fixture 的 inline snapshot 报 TS2353（旧 bridge double 参数为 SessionState），按原测试用具名 snapshot 变量后一次有界复验通过，无生产类型放宽。日志 `/tmp/connection-preferences-{red,green,focused,typecheck-initial,typecheck,build,full}.log`。diff 检查和自审通过；独立复审由 Main 接续，不提前宣称 review gate 通过。

未重启 dev、访问用户资产/已安装宠物/Agent 配置、调用模型/外网、安装依赖、打包或推送。未做原生窗口/GPU/用户模型视觉验收；格温源循环接缝保持独立未解决，不加工 clip/骨骼或新增作者控制。

### Claude output_limited 细类：证据阻塞，未实施

本轮从干净 `3a170d1` 开始；此前 hover/selected `4852c7b`、connected `3a170d1` 已分别提交，其测试证据保持上节范围，不作为本细类实现证据。

有界仓库检索与源码核对仅确认：`integrations/claude-hooks/normalize.ts` 对 `StopFailure.error` 做精确白名单，接受 `max_output_tokens`，其他未知字符串归为 `unknown`；对应测试是合成输入。`observations.ts` 当前把同一已知 prompt 的 `turn-failed` 统一发布为 error，保留错误未读，没有 output_limited occurrence/capability。README 的官方 hooks 链接及 2.1.78 新增 StopFailure 的 release 说明只证明事件/类别存在，不能证明输出限制的精确触发条件。

Main 另做一次有界[官方 StopFailure input 文档核对](https://code.claude.com/docs/en/hooks#stopfailure-input)：`error` 列举 `max_output_tokens`，与 `rate_limit` / `unknown` 并列，但该页未定义其精确触发语义，也未提 `model_context_window_exceeded`。因此尚不能排除上下文容量等不同含义，不以类别名字、合成测试或一般模型错误实测替代版本化原生字段证据。

**安全停点：** 没有修改生产代码/测试，没有把 Claude 的 output_limited 能力标为支持；generic/unknown 错误仍走原 error 未读，pi/Codex、latest-wins、once、fallback、在线绑定过滤与离线立即移除完全不变。继续实施所需来源：明确说明已支持 Claude 版本 `StopFailure.error=max_output_tokens` 何时产生、并能与上下文容量/限流/未知错误区分的官方字段定义或可定位的原生实现证据。未获此证据前不猜测、不继续搜索或请求真实模型。

本轮仅同步证据停点文档，`git diff --check` 通过；未运行测试、typecheck/build（没有代码或测试变更），不声称本细类已实现或原生/GPU验收通过。此文档记录可独立提交，不是未完成实现的提交。未重启dev、安装、打包、推送或读取/修改用户Agent配置/资产。

后续仍待产品决定且本轮不实施：sleeping 后续已由用户明确删除，不再待定义；attention 是否仅保留 fallback，还是需要独立关注及确认语义？若保持离线立即移除，disconnected 是否只保留手动预览，或另定义可见位置？retrying 仍缺可靠业务来源；格温循环卡顿独立未解决。

## Pi 观察缓存清理修正

复核发现 `73977e6` 的总量 256 条淘汰会丢失仍在线会话的停止清理责任。改为仅淘汰明确断开的历史，在线或连接状态未知的观察保留到能够发布断开清理；256 是历史回收目标，不是活跃会话硬上限。新增超过 256 个在线会话全部清理，以及混合在线/断开历史的排序与淘汰回归。仅使用自有 fixture，不修改日常配置或部署扩展；不将此项视为全链路内存硬上限验收。

## 重启连接恢复（2026-10-19，本机迁移与 dev 重开验证完成）

已修复新记录跨重启设备编号变化的持久身份，保留当前操作的严格文件检查；旧记录不自动绕过检查，提供显式私有记录迁移。pi 原临时目录缺失时可在显式恢复中核对原扩展并排他重建，token/地址/扩展保持；未知路径不接管。旧空 legacy 记录迁移后不再生成多余 pi，不删除配置。此项覆盖下方历史“缺失 runtime 一律拒绝”的恢复策略，不放宽未知目录/socket 或文件归属检查。全量 1157 passed / 1 skipped；首轮系统查询导致的测试超时及修复记录保留。用户已精确授权并完成三组迁移，保护文件前后摘要一致；dev实际列表恢复原两条，pi显式恢复后真实已连接。正常退出/重开后记录与hooks核对有效，最终由用户确认pi已连接、Claude等待启动。pi重开恢复通过；用户随后使用原入口新开Claude并确认已连接，接收恢复与新会话在线通过。旧会话不自动认领的限制保留，系统重启实测与Claude任务反馈未在本次完成。[实现与证据](CONNECTION-RESTART-RECOVERY.md)、[精确预览](CONNECTION-RESTART-REPAIR-PREVIEW.md)。

## Codex CLI 输入边界（2026-10-19）

**错误反馈契约核对（2026-10-20）：** 官方文档及同版本固定源码确认，现有 hooks 的普通命令结果缺少统一可靠的失败事实，部分处理器失败还会省略 PostToolUse；不解析正文猜错、不照搬 Claude 错误事件。新增8项跨 normalize/Application/宠物投影回归，连同相关模块61项、typecheck/源码build通过。现有执行/写入/取消保持；独立错误仍未支持，不修改日常observer/hooks或重启dev、不打包。详见[版本证据、行为与后续接口条件](CODEX-ERROR-FEEDBACK-LIMIT.md)。

**细分动作实测（2026-10-20，Main自行验证）：** 用户委托开发验证由Main操作。独立日常CLI测试会话实际命令/apply_patch/取消/exit7，App匿名记录证实executing、writing、cancelled及回idle，连接保持；exit7不制造成功/取消，但独立error反馈仍未实现，不能称已支持。原记录停止更新后仅一次恢复并补测，旧证据保留。53项相关回归、typecheck、源码build通过。测试TUI退出0、记录版dev退出0，已回普通dev，原配置/hooks/token/已有Agent保持，无打包/推送。缺少本轮原生CUA/实际动画截图，资产动画视觉未验收；模型错误/独立读取搜索/等待/并发/桌面端等保留。[范围、实测与限制](CODEX-TASK-LIVE-VERIFY-PREVIEW.md#最终实测结果2026-10-20)。

**日常CLI基础接入通过（最新）：** 已按精确授权追加10组自有hooks，用户正常codex启动、原生审核和一次任务后确认已连接/首页有宠物；实际普通dev的AX和真实GLB截图也确认Codex宠物出现。pi/Claude记录、原配置/token保留，匿名临时记录已关闭，继续普通dev，不打包。12项相关回归、typecheck、源码build通过。本轮原生聚焦点击因CUA失败未覆盖；工具/错误/取消/等待/并发/系统重启矩阵、自动扫描/其他安装方式、Codex桌面端及发布未验收。终端killed具体原因未定，撤回仍失败/恢复后新终端成功的证据不扩大成因果结论。见[日常验收与授权记录](CODEX-DAILY-CONNECTION-PREVIEW.md#最终结果2026-10-19)。下方未部署/待授权条目均为此前阶段快照。

**默认后台隔离实测已通过，日常部署未执行：** 用户按精确预览授权后，两轮默认0.163.0 TUI均退出0、可信连接true、各1本机任务+1标题请求、异常/拒绝0；正式Configurations重建接收器后同一hooks继续连接。隔离程序摘要匹配，接收器/隔离daemon正常停止。未用登录凭据/真实模型，不改日常配置或当前dev、不打包。初始化未OS过滤，不宣称零外网；未记录daemon PID连续性，不宣称两轮必为同一进程。正式UI为前阶段示例数据验证，本轮真实Main链路通过不等于日常Electron/真实模型验收。证据与后续边界见[默认实测](CODEX-DEFAULT-START-PREVIEW.md#本次执行结果2026-10-19)。下方待授权是前阶段快照。

**正式接线代码已完成，默认/日常实测待授权：** 已加Codex手动添加、10条hooks保留式预览/确认/暂停/恢复/撤回、私有记录备份与失败关闭、Main精确默认宿主入口解析，Configurations→共享Application→Home真实事件链路。首任务前等待，不把空CLI或daemon活着当在线；不读取对话文件，不启动Agent。默认daemon独立程序路径已由固定源码核对，尚需真实隔离实测。全量1310 passed/1 skipped/121 files，最后UI取消生命周期回归3项通过；原Claude93项通过。独立审查发现私有state并发编辑保护缺口，已用红绿回归修复；正式Renderer宽/窄窗口、弹窗回焦、GLB及Enter/Escape实看通过（示例数据，不是原生验收）。日常配置/dev不动，不打包。[接线与验证](CODEX-CLI-CONNECTION.md)、[默认模式精确预览](CODEX-DEFAULT-START-PREVIEW.md)。下方“尚未注册”记录是此前阶段快照，不覆盖本条代码状态。

最新原生普通启动有界复验已通过：新版10条原生信任保留，两轮隔离--no-daemon TUI均发布经过身份核验的真实连接、各1任务+1标题请求、正常退出0；接收地址轮换后同一hook仍连接，无专用连接环境变量。异常/拒绝0，不使用凭据/外网/真实模型，不改日常配置或现有dev/Agent，不打包。首试计数误判与漏存连接计数证据保留，不能倒推首试通过。63项test-support/typecheck/源码build通过，独立18项自有fixture复核通过。默认共享daemon、空CLI在线、正式连接页/首页与日常部署仍未验收。[实测结果与边界](CODEX-NORMAL-START-MOCK-PREVIEW.md)。

**普通启动基础模块已实现，日常接入未启用：** 新hook每次读取本应用私有activation，无需连接环境变量；原生helper核对UID/精确程序/完整祖先链/出生时间，独立区分宿主与多会话；首次可信非启动事件可建立unknown基线。Main私有记录轮换有完整性、编辑保留与pending失败关闭，停止等待尚在启动的receiver；dev编译新hook资产。自有Node与实际macOS自建宿主fixture通过，全量1288 passed/1 skipped、typecheck/源码build通过；新增聚焦16项通过。独立审查两处生命周期缺陷已修，最终22项自有fixture复核通过。Configurations/IPC/Renderer和日常hook尚未注册；新命令的原生信任已按[隔离预览](CODEX-NORMAL-START-MOCK-PREVIEW.md)取得单独授权并完成，不能据此自动授予日常信任。见[实现/边界](CODEX-NORMAL-START-IMPLEMENTATION.md)。

**首轮本机模拟已通过：** 固定本机Codex复用已审核隔离hooks，不改config/信任、不读凭据、OS仅回环；空线程150ms负对照后提交首轮，真实认证事件依次SessionStart/UserPromptSubmit/Stop/SessionEnd，任务完成，本地模拟Responses仅1次、stderr0。56项test-support/typecheck/源码build及独立3项复核通过。未打包/推送。普通启动与身份模块继续实施，日常接入/真实模型/正式UI未验收。[范围与结果](CODEX-FIRST-TURN-MOCK-PREVIEW.md)。

**后续方案复核纠正验收前提：** 用户要求独立research后，同版本0.163.0官方源码/测试确认SessionStart在首轮任务路径执行，空thread/start或空CLI等待不能判定此hook损坏。现有环境变量注入也仅覆盖自建探针，不是普通启动接入。停止沿用空启动验收，先准备不调用真实模型的首轮mock/停轮验证，再补持久激活与宿主/存在性；共享daemon须先证明状态范围、权限和正文边界，仍未采用。完整证据、方案比较及实施建议集中在[连接方案复核](CODEX-CONNECTION-RESEARCH.md)；下方历史实测保留，不表示首轮/正式UI已验收。本阶段仅调研，没有真实Agent/凭据操作、模型请求、dev重启或打包。

按用户“继续下一项”进入既定的Codex CLI阶段，桌面端仍最后。已根据当前官方文档实现独立64KiB输入白名单与33项行为测试；保留会话/轮次/工具身份与明确中断事实，丢弃正文/路径/参数。工具返回不等于成功，Stop不等于任务完成，审批检查不等于持续等待；未知工具不猜动作。没有接入Main或发布在线状态。与Claude输入边界合计58项、typecheck及desktop源码build通过，无打包。

旧本机版本0.163.0仅证明当时程序版本，当前文档不能代替该版本原生兼容验证。下一步为隔离原生hook形状/信任/宿主身份验证，再做认证传输、配置保留和正式UI接线；真实安装操作仍需精确预览授权。本阶段不读写日常Codex配置、不启动Agent，原dev保持运行。见 [模块与契约边界](../integrations/codex-hooks/README.md)。Claude查找/退出/并发等剩余矩阵保留，不因推进新Provider标为通过。

Codex下一阶段的版本/帮助检查脚本已就绪：固定入口、独占隔离HOME、输出与时间限制，不继承凭据、不读日常配置。40项相关测试、typecheck、desktop源码build通过；用户已按 [精确预览](CODEX-CLI-COMPATIBILITY-CHECK-PREVIEW.md) 授权并完成：本机0.163.0、版本与帮助均退出0，帮助提及hooks；仅保存白名单摘要。没有加载hook或启动任务、改日常配置、重启dev。此检查不能代替hook加载及任务验收。

### Codex 接收与共享状态链路（2026-10-19）

已实现独立Codex codec、认证loopback接收、静默stdin脚本、可选动作映射和接收→SessionObservation组合接口；传输/输入清理与Claude共用，保持Claude原协议和守卫。自有进程实际运行编译后的hook脚本，验证工具结果→共享宠物executing、明确Interrupt→cancelled；原生ID转随机别名。多会话身份分开，旧轮次/子任务/重复事件不冒充当前工作，退出与停止清理计时器。Stop/审批/工具返回不制造任务完成、持续等待或错误。实际资产动画仍按可选目录回退。

最终全量 `pnpm test --maxWorkers=1` 为1226 passed / 1 skipped / 102 files；`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过，仅源码构建。检查Claude兼容边界后另补无效运行编号+未知事件的返回类别回归，保持旧行为。独立审查发现探针后代进程和消费者异常两项清理问题，均修复并补回归；独立17项复核通过。首次后代测试的立即PID消失断言有异步回收竞争，改用存活后代的心跳停止断言后复验通过；原问题与失败证据保留在加载预览中。

外部Main必须先独立核对宿主身份和存活；此阶段未启用Codex正式连接页，也不从hook短命进程猜Agent在线。已准备 [原生加载精确预览](CODEX-NATIVE-START-CHECK-PREVIEW.md) 和可执行脚本：在独占隔离HOME创建空会话，网络限127.0.0.1，不发turn/start、不绕过信任；等待本次新增真实加载授权。现有dev、token、hooks、配置及历史native fixtures保留，无打包。

Codex原生首轮已获授权并尝试，初始化前退出，未收到事件，不标为通过。系统true复现证明本产品沙箱地址语法非法；改为macOS支持的localhost IPv4规则后，真实自有Node测试证实回环可连、外网EPERM。13项相关测试/typecheck/源码build通过。原失败目录保留，不放开网络或自动重试；[同一预览](CODEX-NATIVE-START-CHECK-PREVIEW.md)已列出r1新目录，等待复验范围确认。

Codex r1复验已获授权并执行：初始化成功，空会话RPC被拒绝（630字节输出、无stderr/无hook），尚不能归因，不标为通过。代码补上固定错误类别/有界错误码，并准备先导出本机版本schema再选择只读枚举的r2检查；不猜参数、不放开网络或启动任务。20项检查程序测试、typecheck及源码build通过；[r2精确范围](CODEX-SCHEMA-VERIFY-PREVIEW.md)待确认，原两次结果保留。

Codex r2已获授权并执行：本机schema确认read-only，修正r1的readOnly参数后初始化/空会话均成功（3140字节输出、无stderr），未收到hook。没有发任务、登录或改信任；不能宣称已接通。已准备复用r2配置的 [hooks/list只读核对](CODEX-HOOK-STATUS-CHECK-PREVIEW.md)，仅投影自有条目启用/信任状态和数量，不自动批准。25项检查程序测试、typecheck、源码build通过；新增真实只读范围待确认，原dev及日常配置保留。

Codex只读hooks/list已获授权并执行：精确匹配的本产品hook10条全部启用、全部未信任，其他来源/错误/警告均0；初始化成功，stdout7178字节、stderr0，未创建会话或改信任。原生通知未通过的当前阻塞已定位为审核尚未完成。已准备[用户隔离审核及条件复验](CODEX-HOOK-TRUST-REVIEW-PREVIEW.md)，通过Codex自己的UI审核，绝不直接改写信任；下一步需用户决定，尚未运行。日常配置及dev保持。

Codex隔离审核首轮已获授权，由用户运行后在进入审核前失败：pid-managed后台服务调用ps返回EPERM。自有Node在同款系统沙箱中仅查询自身PID复现spawn EPERM；未检查其他应用。审核脚本按官方建议添加--no-daemon，保留沙箱/信任边界，并使用review-r1独占助手保留首轮文件。[同一预览](CODEX-HOOK-TRUST-REVIEW-PREVIEW.md)已更新唯一有界复验范围；真实复验尚未运行，未声明Codex接通。原dev与日常配置保持。

Codex审核r1已获授权，用户运行后在Codex启动前被准备检查拒绝。固定隔离文件只读核对：observer内容一致、权限/归属有效；仅config多了首轮CLI正常写入的tui.screen_reader_detection_done=true，review-r1仅文档助手存在、checker和结果均未生成。已修正精确UI增量校验、r1同字节助手安全续接及固定失败类别；33项测试/typecheck/源码build通过，收窄复用后两项回归通过。未再次启动真实Codex；按有界失败规则在[审核记录](CODEX-HOOK-TRUST-REVIEW-PREVIEW.md)留停点，不自动重试或扩范围。--no-daemon真实启动、审核和回调仍未验收，dev/日常配置保留。

Codex修复后恢复准备检查已实际通过，用户运行后确认进入登录界面。review-status.json真实查询仍为10条启用/未信任、其他来源/错误/警告0。用户明确要求使用本机已有登录，已实现[仅审核期间的本机凭据临时使用](CODEX-LOCAL-AUTH-REVIEW-PREVIEW.md)：只读有界原auth、隔离600排他副本、交互退出finally核对清理、命令行file模式不改config、保留外网限制，无任务；新助手/结果名保留旧证据。37项测试/typecheck/源码build通过；尚未用真实凭证运行审核，不宣称信任/回调通过，日常配置与dev保持。

Codex本机凭据审核已由用户实际执行，TUI在account/read的workspace routing discovery失败（-32603）；临时副本已核对删除，原凭据metadata正常，两个新结果不存在，审核未完成。完全禁外网可能挡住账号初始化，尚未排除上游错误。已准备[仅chatgpt.com:443受限出口的对照](CODEX-ACCOUNT-NETWORK-REVIEW-PREVIEW.md)：原系统沙箱不放开，单次认证loopback网关、TLS透传、无任务/正文日志，临时凭据规则不变，新助手/结果保留旧证据。40项测试/typecheck/源码build及两项隧道复核通过；未实际外连/启动Codex复验，因新增外部账号请求需用户决定。dev及日常配置保持。

Codex受限联网已获用户精确授权；用户报告EEXIST并要求Main自行终端测试。Main真实PTY复现EEXIST，修复仅复用内容/权限/归属/单链接全同的network助手，无删除覆盖。一次真实PTY复验已越过准备，但TUI loading仍在account/read工作区路由发现失败（-32603），没有任务/信任审批/后续查询或空会话。临时凭据已核对删除、原auth metadata正常、隔离config保持预期，网关finally关闭。7项聚焦与完整40项测试/typecheck/源码build通过。按有界失败规则停止真实重试，代理使用/上游/账号路由原因仍未区分，见[实际终端证据](CODEX-ACCOUNT-NETWORK-REVIEW-PREVIEW.md)。dev、日常配置保持，不打包/推送。

Codex最新隔离实测已通过账号初始化和原生信任审核：网关原并发限制实际拒绝5条，修复有界排队（32客户端/8上游、全局2MiB）及同主机默认443格式后，真实TUI进入审核/主界面。用户明确授权Main代为信任10条，Native UI完成并正常退出；只读查询10启用/10trusted，其余与错误全0。只接受Native新增的10条自有hooks.state记录，原配置/凭据保留。离线空会话收到真实SessionEnd认证回调，但SessionStart仍未通过：探针ACK即退出缺陷已用红绿fixture修复，一次2500ms真实等待复验仍hook-not-observed（stdout3140/stderr241、仅SessionEnd），不归因或伪造在线。45项测试/typecheck/源码build通过，原结果分别保留；临时凭据清理确认、dev不变、无打包。启动事件按有界规则留停点，Main/UI尚未激活，详见[最新实测](CODEX-ACCOUNT-NETWORK-REVIEW-PREVIEW.md)。

最新启动诊断：真实离线空会话与一次修正后的原生CLI对照均只观察到SessionEnd脚本（accepted），正常CLI进入主界面并/quit退出0，真实认证退出回调通过、临时凭据清理true；SessionStart脚本未观察到执行。首轮CLI超时证据单独保留。尚不能确认首任务延迟触发或排除受限初始化影响，网关2MiB耗尽/其他域名拒绝仍有记录；不猜解析修复、不伪造在线、不放宽网络或自动发模型任务。本轮有界复验到停点，正式接线仍未激活。新增脱敏形状诊断、stdin保持/监听清理测试、非TTY入口拒绝与超时强制清理；53项测试/typecheck/源码build通过，独立审查发现并复核FIFO诊断阻塞修复；详见[本轮证据与后续边界](CODEX-STARTUP-SHAPE-CHECK.md)。

## Claude 任务反馈（2026-10-19，常用反馈真实验证完成）

用户再次要求复验后，未修改源码或放宽超时，原真实自有进程 schema2 链路及全量 **1121 passed / 1 skipped / 94 files** 通过，`pnpm typecheck`、desktop 源码 build 通过，不打包。三个自编译助手仅查询自身 PID，首次315/338/391ms，随后2/8/3ms；上轮3秒启动超时未复现，仍保留为启动稳定性风险，不宣称根因已消除。自检失败时不监听、不发布在线；真实Agent检查250ms和peer1秒限制保持。随后用户精确授权日常升级并完成：12组自有hooks已保存，其他设置及原备份核对一致；新版dev已启动，用户确认原路径新开的Claude已连接。真实读取、写入/修改、Bash执行及模型出错反馈已核对；Glob/Grep在当前会话不可用，查找未验收。

已实现任务事实→Main私有关联/随机别名→Configurations/Application→共享宠物反馈，以及保留原hooks的显式升级。动作可选、缺动画静态回退；工具反馈不伪造整个任务完成、取消或持续等待。原正式Renderer隔离dev已检查升级/取消回焦/首页GLB反馈；普通Claude启动/Home已有真实确认，本轮匿名状态记录验证常用动作请求，不证明模型资产具有对应动画。独立代码复核无新确定缺陷；检索性审查发现的一处过时验证摘要已修正。真实升级已按精确预览授权完成；实测后正常退出记录版并切回普通dev，未改token/hooks/配置，不打包。[实现、历史失败与最新证据](CLAUDE-TASK-OBSERVATION.md)、[升级预览](CLAUDE-TASK-UPGRADE-PREVIEW.md)。既有设置实机停点及native fixtures保持。

## Claude 自动发现（2026-10-17）

已将 Claude 接入自动扫描：有界 PATH/固定入口/NVM 发现，Main 候选重新核对后带入默认配置与原精确 hook 预览；多入口按程序去重，多安装可选，已有配置直接查看。原配置/hooks/进程与 pi 边界保留。npm 2.1.301 可准备；官方/Homebrew 仅显示待验证，不扩大真实兼容，终端 PATH 未修改。相关 118 项、独立复查 63 项、最终全量 1032 passed / 1 skipped / 92 files、最终界面复验 48 项、typecheck/项目标准源码 build 通过；临时副本 pnpm 拒绝和首次原终端测试超时证据保留。正式 React 浏览器隔离交互/窄窗口已检查，Electron 原生自动化滞后的覆盖限制已记录；本机扫描已获授权并完成：真实发现 npm Claude 2.1.301 一处、pi 0.85.1 两处；已有配置查看复用通过，原两条 UUID/路径保留，未部署或操作 Agent。pi 扫描 complete、Claude 受限，不宣称整机完整覆盖。原日常 dev 已启动并保持运行，Claude waiting、pi 未自动恢复，不打包。见 [设计与证据](CLAUDE-DISCOVERY-DESIGN.md)、[本机检查预览](CLAUDE-DISCOVERY-CHECK-PREVIEW.md)。此前完成的十个提交已推送至 `210ad8b`，本阶段独立本地提交。

## Claude CLI 一次配置、普通启动（2026-10-16）

**日常配置与实测（覆盖下方历史待授权记录）：** 用户已按[配置预览](CLAUDE-NORMAL-START-PREVIEW.md)及[临时阶段检查](CLAUDE-LIVE-STAGE-CHECK-PREVIEW.md)分别授权。默认settings原先不存在，仅新建自有SessionStart hook；原pi配置保留且未自动恢复。真实Claude由用户运行原入口完整路径，检查版连接/首页通过；临时记录完整撤回后，原observer/原Main摘要和自有hook复核通过，原版再次新开会话为observing/1/notice none，实际首页有对应GLB宠物。CUA旧绑定曾返回过时空态，不能据旧截图认定同步bug或宣称根因修复；初始等待原因仍未确定。偏好仅初次配置时摘要一致，最终发现仅petSize160→80变化，未归因/覆盖/恢复该值。原回调边界20项、阶段记录9种输入/guard及自有安装撤回闭环通过；前导空格修复`434ae5c`的45项/typecheck/build结果保留。当前原dev与用户会话继续运行，无依赖安装/模型请求/打包/推送。普通启动/恢复观察/首页链路通过，退出/并发/任务动作/终端PATH/桌面宿主与发布仍未验收，详见[验收记录](CLAUDE-CLI-ACCEPTANCE.md)。

用户后续明确覆盖专用launcher体验：仅追加自有SessionStart hook，保留原settings/hooks，以后正常运行claude。Main使用自有macOS helper核对hook真实祖先/Claude确切PID和微秒启动身份，只观察已知进程，不扫描参数/对话、不启动/控制Agent。正常模式已接正式页面与首页，启动命令不再显示；任务动作/提醒仍未启用。未暂停连接在应用启动时校验恢复，已运行但无新启动hook的旧进程不自动认领。

最终完整单并行复验1016 passed / 1 skipped / 91 files，typecheck/desktop build通过；独立122项复验无剩余确定缺陷。首次最终全量的既有pi Bucket边界断言失败（其余1015通过/1跳过），原文件20项独立复验与一次有界完整复验均通过，未修改该用例/生产guard。独立发现的旧目标绑定、修改hook误报撤回已修复补测；Main实机发现的启动加载取消恢复也已修复，重开独立dev回到waiting而非disconnected。共享JSON保留原字节，发布前保存私有原始证据，不能整份自动回滚覆盖后来编辑。原生隔离首次未连接原因未明，一次原始命令复验及双进程部分退出通过，不能掩去首次失败。日常Claude设置尚未读写或启用；无真实Agent/模型调用、打包或推送。[设计](CLAUDE-NORMAL-START-DESIGN.md)、[验收](CLAUDE-CLI-ACCEPTANCE.md)、[待授权精确预览](CLAUDE-NORMAL-START-PREVIEW.md)。

## Claude CLI 正式连接与首页（2026-10-16）

连接与静态陪伴已接入正式 Main/Configurations/连接页/首页；此节覆盖下方历史“尚未接通”的切片状态。用户终端显式启动，Main/UI不启动Agent；仅支持已核对的npm Claude2.1.301。私有材料精确预览/确认、认证控制通道、多运行身份、暂停/显式恢复/移除及保留运行文件已实现；任务动作和提醒仍未启用，不发布SessionObservation或伪造idle。原Claude/pi配置、hooks、shell和现有进程不变。

一次有界完整低并行复验924 passed / 1 skipped / 87 files；typecheck和desktop build通过，独立重点140项通过。首次双并行终端fixture就绪超时、原文件5项复验与低并行结果分别保留；未削弱deadline/guard。隔离dev启动正式代码，自有Node程序验证完整连接流程；日常Claude前台运行及发布未验收，没有打包/推送。兼容范围、文件与剩余验收见[设计](CLAUDE-CLI-PRESENCE-DESIGN.md)和[验收记录](CLAUDE-CLI-ACCEPTANCE.md)。

## 多 Agent 最新实施顺序与 Claude 回调通道（2026-10-16）

下一连接切片采用[明确用户终端启动、先连接与陪伴](CLAUDE-CLI-PRESENCE-DESIGN.md)，不在Main/UI启动Agent，不用idle冒充未知任务，不改Domain/Application。`launcher.ts`进程绑定库已实现：独立直接子进程/UUID/token，根hook观察和退出分别报告，断开观察不终止Agent，控制环境不继承；相关58项、最终全量822 passed / 1 skipped / 82 files、typecheck/desktop build通过，独立11项复验无确定问题；终端信号/原生参数及重入等覆盖限制见Claude记录。可执行入口、认证Main控制通道、私有材料部署/撤回和正式UI尚未完成，不能宣称Claude已连接。

用户本轮明确授权更新CLI程序，已保留原安装方式完成Claude Code 2.1.143→2.1.301、Codex 0.161.0→0.163.0、Antigravity CLI 1.1.27→1.4.0；候选版本/帮助及切换后原入口版本全部通过，旧程序与Codex旧release保留。只处理程序/安装选择，不读写日常Agent配置、凭据、对话或shell配置，不重启dev/现有Agent、不操作pi、不打包。Claude原NVM位置未进入当前dev shell PATH，接入使用绝对路径，不新增第二份安装。见 [范围/备份/结果](CLI-UPDATE-PREVIEW.md)。

用户另分别精确授权原生manifest校验和一次隔离`--init-only`：Claude2.1.301校验通过；修复版插件实际加载，退出0、无输出，真实收到startup及SessionEnd。接收绑定只接受本次实际创建且仍有效的child，退出立即退役，token/运行UUID未落盘，没有模型任务或原应用重启。原生工作/子任务身份、正常任务、正式连接和UI仍未通过；见 [manifest结果](CLAUDE-PLUGIN-CHECK-PREVIEW.md) 与 [启动回调证据](CLAUDE-NATIVE-START-PREVIEW.md)。

后续调用脚本已恢复并完成隔离验证：标准Readable证明closed标志早于排队error事件，修复清理时机后保留原失败回归，47项通过；最终全量811 passed / 1 skipped / 81 files、typecheck、desktop build通过，独立47项复验通过。输入契约限本机stdin（启用close事件），自定义emitClose:false异步销毁流的清理限制已明示。脚本/插件文档生成器不注册Main、不启动或加载真实Claude；阶段2提交`d8bdf26`不变。详见 [Claude记录](CLAUDE-CLI-ACCEPTANCE.md)。

用户进一步确认Codex桌面端与CLI均纳入，顺序为Claude Code CLI → Codex CLI → Antigravity CLI，桌面端（Codex、Antigravity）全部最后做；继续dev、不打包、保留现有配置。覆盖下方上一轮“Antigravity两宿主随后一起推进”的顺序，不放宽任何真实目标操作授权。

Claude新增独立认证loopback回调通道，发送前/接收后两次收窄字段，必须有外部可信运行绑定，支持近期事件去重、资源限制、关闭和回调重入保护。保留原生prompt/子任务身份，不用SessionStart或短命hook退出猜运行/在线。此阶段仍不注册Adapter、Main或UI，不发布业务状态、不触碰日常Agent配置；真实生命周期/部署/恢复仍未实现。相关41项、全量805 passed / 1 skipped / 80 files、typecheck与desktop build通过；独立审查发现的回调问题已补红测试并修复，最终41项独立复验与文档可恢复性审查通过。详见 [Claude实施与缺口](CLAUDE-CLI-ACCEPTANCE.md)。用户已按 [新精确预览](CLI-VERSION-HELP-CHECK-PREVIEW.md)另行授权版本/帮助；实际Claude返回2.1.143、支持临时`--plugin-dir`。脚本重复核对路径耗尽96次metadata预算，Codex/agy跳过未执行；没有加载插件、启动Agent会话或改日常配置。

## 新 Agent 接入准备与 Claude 输入边界（2026-10-16）

用户新增需求为Codex CLI、Claude Code与Antigravity桌面端/CLI接入，覆盖上文历史“新Provider不在当前范围”的工程排期限制；现有pi MVP与尚缺验收保持原状态。继续dev，不打包。真实安装读取/配置写入仍按各自精确预览授权，不因此放宽managed guard或数据保留契约。

已按用户精确授权只读检查72候选/132次metadata与链接/1份Node manifest：Claude包2.1.143、Antigravity桌面端2.22.0；agy入口存在但版本未确认，Codex入口进入排除的.codex目录而停止，未读配置/凭据/会话、启动Agent或改文件。[安装范围与实际结果](AGENT-INSTALLATION-CHECK-PREVIEW.md)。

第一阶段为独立Claude原生hook白名单输入边界：限定64KiB、丢弃正文/路径/工具内容，保留安全事实，未知事件忽略。区分无tool ID的PermissionRequest、实际permission_prompt、工具失败/中止和整个任务失败；Stop只是结束候选，不直接伪造完成未读，子任务不完成父Session。本阶段不注册Adapter、不改Main或UI、不启用回调、不建立在线连接；不能标为Claude已接通。本机版本只是metadata证据，真实加载与字段兼容性仍需另验。

相关24项测试、pnpm typecheck与desktop build通过，无新增依赖或打包。后续按独立阶段实施认证接收/运行与工作身份/排序、Provider连接管理和安全部署，再做真实加载验收；随后Codex CLI与Antigravity两种宿主分别推进。模块及下一阶段条件见 [Claude输入边界](../integrations/claude-hooks/README.md)。既有未完成设置记录与历史native fixtures保留。

## dev 显示比例与设置序号修复（2026-10-16）

当前应用的localhost保存了-1.5级缩放（约76%），同时影响管理页和桌宠；缩小还触发宽屏规则，暴露一直残留的设置序号。已在实际dev恢复100%，正式/原型都彻底删除序号节点和CSS；Main窗口入口恢复正常比例、View菜单移除放大/缩小，保留宠物大小偏好。当前dev未重启，Main保护下次启动生效，已用独立Electron验证同host双窗口及重载。没有修改pi配置、扩展或用户宠物大小。

全量 **760 passed / 1 skipped / 77 files**、typecheck、desktop build、原型build、真实Electron缩放fixture通过；当前正式dev设置页实看比例恢复、无序号。未打包或推送，pi细分任务验证暂停待继续。见 [修复与验收边界](UI-SCALE-REGRESSION-ACCEPTANCE.md)。原设置停点与native fixtures保留。

## 取消误报修复与等待/受控出错检查准备（2026-10-16）

用户继续实机验证取消，按Esc后pi显示“Error: This operation was aborted”；私有枚举记录先tool_error再error，取消验收失败，不能作为正常任务出错通过。观察扩展已改为只读保留当前运行的原生AbortSignal，settled时用真实aborted区分取消，取消工具不冒充tool_error；续跑替换signal、结束/卸载释放引用，不加监听或Agent控制。能力表按扩展实例隔离，避免多个实例相互虚增支持状态。

另备好独立test-support helper：用户显式命令打开真正确认框、用户自行选择的本机抛错模型触发受控失败；不发观察假事件，不自动选模型或请求，不进入正式部署源。独立focused10项、typecheck、desktop build通过。最终全量并行有1项原Worker启动unavailable（763通过/1跳过），原文件4项复验通过，一次有界完整低并行复验764通过/1跳过/78文件，未改guard或阈值。用户已精确授权；已正常停止dev、原子替换取消修复版扩展、独占创建0600临时helper及私有撤回记录，settings摘要不变；同profile的dev已重启并恢复原socket，原配置/凭据/runtime/disabled一致。用户reload后12:23真实取消复验通过：executing→idle/cancelled，无tool_error或整个任务error；12:17另收到真实thinking。临时命令两次reload仍无法识别且无相关错误，等待/受控任务出错未通过。已按原授权校验身份/摘要/权限/父目录，只撤回临时helper；settings摘要一致，正式观察扩展保留，用户确认清理后reload无相关错误，12:27新身份idle/connected，临时文件撤回与reload收尾完成。不改发现规则或换协议绕过，按有界规则记录停点。新的精确真实操作范围见 [预览](PI-CANCEL-WAIT-CHECK-PREVIEW.md)，原实机证据见 [记录](PI-EXTENSION-LIVE-ACCEPTANCE.md)。仍用dev，不打包。

## 当前连接的扩展更新与真实事件验证（2026-10-16）

用户要求更新当前pi扩展并做真实细分验证，保留配置，仅用dev。只读核对当前默认配置、私有receipt与现有扩展匹配，runtime有效/socket缺失。新增显式host/operator更新器：严格ownership与inactive保护、原目标绑定、700/600私有备份、原子替换及新receipt、显式校验恢复；保留接收配置与settings，不接Renderer/自动启动更新。dev可显式启用有界枚举证据，匿名身份、无正文/名称/凭据，打包应用忽略。

工程工具已验证：全量 **756 passed / 1 skipped / 76 files**，typecheck、desktop build通过；独立重点19项通过，最终目标绑定补测20项通过。没有打包或依赖安装。用户已确认精确预览；真实扩展替换和原配置dev接收恢复完成，settings校验一致，新源码/receipt匹配，目标/凭据/runtime/disabled保留。用户reload后自行完成限定任务，真实收到读取、写入、执行6.027秒、单个工具出错、继续回答与正常完成，任务中途保持working，能力随实际事件确认。思考/查找仍unknown，整个任务失败/取消/等待/整理/长度中断及真实动画显示未验收；见 [操作预览](PI-EXTENSION-UPDATE-PREVIEW.md) 与 [实机记录](PI-EXTENSION-LIVE-ACCEPTANCE.md)。原设置实机停点和native fixtures保留。

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

准确缺口：仅一只真实内置 starter 宠物，包导入尚未实现；其他未接入 Provider 仅可保存非秘密元数据，不能连接；CLI 自动扫描目前只做固定入口和安装 metadata 的有界检查，不能自动找遍项目配置或证明其活跃，Codex 仅已核对的 standalone 0.163.0 布局可进入配置预览；手动类型识别不确定时必须用户选择。旧已部署位置更换须先选择性撤回/移除再添加。系统登录项/GPU性能及新界面真实模型任务矩阵仍需实际验收；多 pi TUI 的空闲连接与生命周期范围已通过。映射、截图、运行方式和后续清单见 [正式迁移验收](MANAGEMENT-MIGRATION-ACCEPTANCE.md)。

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

### 第 3 阶段设置实机停点（尚未完成，不作为完成阶段提交）

同一隔离 profile 的正式包已通过原生页面将省电档位保存为 30 FPS / 75%，自身 preferences.json 核对一致。软件分类实际画面显示完整开关，但 CUA 的原生 AX 缺少开关节点；一次重新绑定恢复后仍缺失，单次坐标操作返回 noWindowsAvailable。按 AGENTS 的有界基础设施恢复规则停止该自动化路径，应用经原生菜单正常退出（exit 0）。软件开关实际效果、重启后 UI、登录项和 GPU 不标为通过；需要用户辅助操作或原生工具恢复后继续。没有修改系统登录项。隔离偏好保留本次 30/75 结果，日常 profile 未更改。本条为准确恢复上下文的未提交进度记录。

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

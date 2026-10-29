# 23 个动画触发审计

> 当前更新：拖动已提交 `84edb31`。hover/selected 本轮已完成 Renderer 接线与自动化（聚焦98项、全量1513 passed/1 skipped/132 files、typecheck/build通过），详见下节；仍不代表原生/GPU视觉验收。connected 等其他缺口和格温接缝未处理。

## 结论

**目录有 23 项 ≠ 23 项都有自动事件。** 当前 pi 的工作/细分活动/结果链路已接；Claude/Codex 有意只发布可靠事实，工具结果是短反馈，不是持续工作或整个任务完成。`hover`、`selected` 已接真实本地交互，`connected` 尚未接动画，`sleeping` 未定义来源，`attention` 仅作回退；`retrying` 没有可靠已接业务源。`disconnected` 与“离线立即销毁宠物窗口/移除首页实例”直接冲突。

原只读审计时拖动尚在实施，以下未更新的行号仍是当时快照，原1491测试数字仅属历史基线；当前拖动状态由页首覆盖。本轮仅实施下面 hover/selected 范围，没有运行应用/Agent/模型、网络、安装或用户资产操作。

## hover / selected 当前接线与证据

- `PetModel`、首页 `ScenePet` 的 R3F pointer over/out → `shared/usePetInteraction.ts` → `usePetAnimation`。仅真实模型进入触发 hover；out 的新 intersections 仍命中同一 group 时不算退出，因此子 mesh 切换不重启。App 工具栏 envelope 不提供动画输入。
- `CompanionScene` 的模型点击回调、在线宠物选择按钮点击/Enter/Space共用显式 selection counter → `HomeScene` → 对应配置 ScenePet。没有初始聚焦/重渲染/重挂触发；收藏选择和 PetPreviewScene 仍只是资产选择/试播。桌面无新增 selected 操作。
- 实例内 latest-wins；hover/selected 单次完成释放，拖动优先且取消旧局部反馈。退出 hover、取消选择、窗口失焦、隐藏、pointercancel/lostcapture、切页/卸载清理；reduced 不启动局部反馈。缺对应 clip 保持现有业务播放（不重置 Work/idle），手动试播及目录 fallback 不变。
- 局部 clip 正在播放时不消费/重启新业务 cue，结束恢复最新请求/rest，已消费业务 once 不重播。快速被覆盖的事件不排队；在线绑定过滤、每配置实例与离线立即移除保持。
- 红绿证据：`PetModel.test.tsx` 实际 GLB hover/重复进入/子 mesh/拖动/无映射/reduced/新业务与已消费 once；`ScenePet.test.tsx` Home接线、独立实例、显式选择及同帧业务 cue；`CompanionScene.test.tsx` DOM点击/Enter/Space、被动焦点、重复点击、Escape/返回全景/切页；`usePetInteraction.test.tsx` blur/cancel/hidden/unmount 清理。`App.test.tsx` 继续覆盖真实 DOM drag/cancel，并断言工具栏 envelope 不给模型命中输入。
- 聚焦98项、全量1513 passed/1 skipped/132 files、typecheck、desktop源码build通过；新增12项。测试不认证原生命中事件、GPU质量或用户模型视觉；没有 dev 重启、真实 Agent/模型请求、配置或用户资产修改。

## 共用证据索引

以下简写均是仓库相对路径；表格引用这些精确入口，避免重复长路径。

- **A** `packages/pet-runtime/src/actions.ts:3-27`：23 项公开 label/key；`:43-55` 按请求→有序 fallback 查真实 clip；`:62-64` 只将直接有映射且有 clip 的 trigger 列为可试播。
- **P** `integrations/pi-extension/index.ts:38-50,57-62,90-104,168-271`：原生事件白名单、能力按实际事件确认、活动和 occurrence；网络重连 retry 不代表业务 retry。
- **M** `packages/adapter-pi/src/session-mapper.ts:29-65,75-94`：seq 去重、hello 去历史 occurrence、断开清活动。
- **C** `integrations/claude-hooks/normalize.ts:27-31,77-125`；`integrations/claude-hooks/observations.ts:26-43,70-102`：prompt/tool 身份、2 秒 recent feedback、StopFailure 错误。
- **X** `integrations/codex-hooks/normalize.ts:28-35,64-80`；`integrations/codex-hooks/observations.ts:24-43,75-99`：Bash/apply_patch 结果、明确 Interrupt；Stop/审批不制造完成/等待。
- **D** `packages/domain/src/index.ts:62-102,104-128,158-184`：revision、baseline、未读终态及确认；`packages/domain/src/companion.ts:2-14`：统一 facts/capabilities。
- **Q** `packages/pet-runtime/src/presentation.ts:4-26`：waiting 优先，活动优先级 compacting→executing→writing→searching→reading→thinking→responding→retrying，随后 recentActivity/working/终态/idle；没有连接、hover、selected、sleeping 投影。
- **L** `apps/desktop/src/renderer/shared/usePetAnimation.ts:6-12,15-58`：共享播放器、一次 cue 去重、回归 restAction、reduced 暂停。
- **W** `apps/desktop/src/main/desktop-pets.ts:30-38,54-57,96-109`：每配置 Session 过滤、资产绑定、仅在线有绑定创建窗口，否则立即 destroy。
- **H** `apps/desktop/src/renderer/management/home-projection.ts:7-17`：同条件过滤首页，调用 Q；旧 Claude presence-only 特殊用未知 `presence` 静态请求。
- **R** 桌面 `apps/desktop/src/renderer/features/pet/PetCanvas.tsx:29,45-59` → `PetModel.tsx` → L；首页 `management/ManagementScenes.tsx:54-57` → `management/ScenePet.tsx:29` → L；试播 `ManagementScenes.tsx:62-67` 同用 ScenePet。
- **接收/Application** `apps/desktop/src/main/configurations.ts:92-115` 把 Claude/Codex 随配置命名空间发布并登记 Session 归属；`packages/application/src/index.ts:32-35` 统一 applyObservation→publish。pi 经 M 和已有 PiConnection 发布，非 Renderer 猜状态。

测试简写（本次仅阅读，不当原生验收）：
- **TP** `integrations/pi-extension/activities.test.ts:36-135`：流/并行工具/等待/整批 settled/取消/长度/压缩/断开与重连；另 `bridge.test.ts`、`reconnect.test.ts`。
- **TC** `integrations/claude-hooks/observations.test.ts:23-101`：unknown、短反馈、错误分离、旧 prompt/子任务/重复/退出；`normalize.test.ts`、`apps/desktop/src/main/configurations-claude-observations.test.ts`。
- **TX** `integrations/codex-hooks/observations.test.ts:17-83`：unknown、结果非成功、明确取消、迟到事件、并发与退出；`normalize.test.ts`。
- **TQ** `packages/pet-runtime/src/presentation.test.ts:7-31`、`packages/domain/src/domain.test.ts`、`apps/desktop/src/renderer/management/home-projection.test.ts:24-33`。
- **TL** `apps/desktop/src/renderer/features/pet/PetModel.test.tsx:194-246`（读取时行号）：once→idle/静态、缺 clip 保留工作、rest 更新不重播、等待/重挂不重播、新 work 重播；`management/ScenePet.test.tsx:94-99,119-147,180-195`：手动重播、无映射、缺 clip、reduced、静态；`packages/pet-runtime/src/actions.test.ts`。
- **TW** `apps/desktop/src/main/desktop-pets.test.ts:50` 起；`configurations-socket.test.ts:14` 起：多配置、最后连接退出移除、绑定、IPC 隔离。**没有证明断开动画已播放。**

## 逐项表

“已接”只指源码链路成立；必须有对应 GLB clip 才会表现为该动画。P/C/X 分别为 pi/Claude/Codex；“源不足”指当前已核对接口/适配策略不足，不宣称 Provider 永远不支持。

|公开 label / key|事件来源与 Provider 支持|实际状态、代码证据|相关测试；残余真实验收|
|---|---|---|---|
|空闲时 `idle`|P hello idle/活动清除；C/X unknown 无活动时使用视觉基线|已接 Q:10,18；不是 C/X 已证实“任务空闲”。旧 Claude presence-only 首页静态、桌面空 Session 可播 idle，存在表现不一致（H:8、R）|TQ/TL；三个 Provider 无任务/清活动/换资产实看|
|任务进行中 `working`|P agent_start→整批 settled；C/X 不把 submit/pre-hook 当开始|P 已接 P:182-190、Q:10,18；C/X 源不足，不应补假 working|TP:36；多轮续跑/并行和结束时序|
|正在思考 `thinking`|P thinking_start/end；C/X 未接可靠流事件|P 已接 P:217-230→Q；C/X 源不足|TP:36；真实流开始/结束及被工具优先级遮挡|
|正在输出回答 `responding`|P text_start/end；C/X 无此流源|P 已接 P:223-228→Q；C/X 源不足|TP:36；真实输出到 settled 的切换|
|正在读取文件 `reading`|P read start/end；C Read PostToolUse；X 不分类读取|P 持续、C 结果后2秒已接（P:231-244、C normalize:30 / observations:88-90）；C label 的“正在”不等于真实执行，首页已显示“刚刚读取” H:15|TP/TC/TQ；P 真读取有历史证据，C 已有常用反馈记录；仍需对应 clip 视觉|
|正在修改文件 `writing`|P write/edit；C Write/Edit/MultiEdit/NotebookEdit 结果；X apply_patch 结果|三者已接，但 C/X 仅 recentActivity 2秒（P:234、C:30-31、X normalize:30）|TP/TC/TX；真实工具后反馈时长、下一工具替换与视觉|
|正在搜索 `searching`|P grep/find/ls；C Grep/Glob 结果；X 未分类|P/C 已接，X 源不足（P:234、C:31）；不解析 shell 命令补搜索|TP/TC；Claude 查找此前不可用，保留未验收；P 搜索实机也需补|
|正在执行命令 `executing`|P bash/powershell start/end；C Bash结果；X Bash结果|三者已接，C/X 不代表还在运行（P:234、C:31、X:30）|TP/TC/TX；Codex 历史执行事实通过不等于动画视觉通过|
|正在压缩上下文 `compacting`|P before_compact→compact/failed/abort；C/X 前置 hook 可阻断，未认持续压缩|P 已接 P:254-271；C/X 源不足，PostCompact 当前不制造活动|TP:75；真实成功/取消/失败/旧 signal 清理|
|等待输入 `waiting_input`|P ui_prompt_start/end；C permission_prompt/approval 无可靠配对清除；X approval 不代表等待|P 已接 P:246-252→Q:6；C/X 源不足。单独 SessionStatus waiting_input 并不直接被 Q 映射，当前依靠 facts+supported|TP:36,63；P 真实等待此前 helper 未成功，仍未验收；不能以工具审批前置替代|
|任务完成 `success`|P message stop/toolUse 仅记候选，agent_settled 且 idle 才发 completed；C/X Stop 可继续|P 已接 P:38-50,192-214→D→Q:18-26；C/X 源不足。tool_execution_end/PostToolUse 都不是任务成功|TP:36,89、TL；真实整批完成/下一轮/未读确认/重连|
|发生错误 `error`|P settled 原生 error（length亦是错误终态）；C StopFailure；X 无可靠统一失败事实|P/C 已接 P:202-214、C normalize:117-120 / observations:92-93→D/Q；X 源不足，exit7不可猜 error|TP:63,105、TC:58、TX 负例；P 整轮真实错误仍需补；C 历史错误事实不证明对应 clip|
|工具执行失败 `tool_error`|P tool end isError 且非 aborted；C PostToolUseFailure 且 is_interrupt===false；X 无可靠失败字段|P/C 已接 P:239-244、C observations:83-87→Q:21-25；不改整个任务为失败|TP/TC/TL；真实失败后继续、重复 tool ID、并发短事件|
|正在重试 `retrying`|三者没有已接可靠业务重试事件|源不足；P:61 保持 unknown，Q:4 可消费受能力约束事实但无生产者。socket reconnect 不可替代|TP:39 负例、TQ；暂不安排伪造实机事件|
|输出达到限制 `output_limited`|P stopReason length→settled；C StopFailure max_output_tokens 类别已归一化但 observations 丢失细类；X 无源|P 已接 P:198,210-213；**C 是可用事实未接细分**（C normalize:4,117-120；observations:92），目前只 error。需确认该类别与公开 trigger 语义/原生版本一致后可最小接 occurrence|TP:63、TC normalize；P/C 真实长度限制与非限制错误，禁止解析正文|
|任务已取消 `cancelled`|P aborted / 本轮 AbortSignal；X Interrupt；C 工具中止不证明整轮取消|P/X 已接 P:202-213、X observations:82-85；C 源不足|TP:105-135、TX:33；P/X 有历史事实实测，仍验动画及下一轮不受旧取消污染|
|需要关注 `attention`|无独立生产事件；waiting_input/error/success/tool_error/output_limited 的资产 fallback|**部分：回退已接，独立自动 trigger 未接** A:13-20,48-51；Q 从不直接产 attention。配置 availability='attention' 不进宠物动画|A/TL；有 attention clip、无主 clip 的 fallback，业务 once 回退 attention 应只播一次；不要无请求增加提醒轮询|
|Agent 已连接 `connected`|P hello、C/X 已核验 presence；在线事实存在|**缺接线**：configurationOnline（shared/configurations.ts:29-30）用于 W/H 出现，不产生 connected cue，Q 无此分支。新建窗口≠连接动画|TW 仅窗口生命周期；首次上线、同配置第二 Session、重连、重挂不得误重播|
|Agent 已断开 `disconnected`|P transport disconnect、C/X 运行退出/retire；事实存在|**缺动画且产品冲突**：Q:14 过滤离线，W:96-101 立即 destroy，H:7 移除；当前没有可见载体播放 disconnected loop|TW/TP/TC/TX 验离线清理；须用户先决策可见范围，不暗加 grace period|
|鼠标悬停时 `hover`|本地真实 pointer 命中，与 Provider 无关|**已接**桌面 PetModel / 首页 ScenePet → usePetInteraction → L；工具栏容器不触发，子 mesh 切换不重播|本轮真实GLB/R3F、DOM与生命周期回归通过；原生入/出、透明空域与用户资产视觉仍待验|
|选中宠物时 `selected`|首页模型 click / 在线宠物选择按钮，与 Provider 无关|**已接** CompanionScene 显式 selection counter → HomeScene / ScenePet → L；点击、Enter/Space同源，初始focus/缩略图不触发，桌面无选择操作|本轮DOM与R3F覆盖重复点击/取消、配置隔离、最新业务恢复；原生键盘/动画视觉待验|
|被拖动 `dragging`|本地窗口 gesture，不是 Provider 事件|**已交付** `84edb31`，同一 dragging 映射；本轮保留拖动优先|原capture/cancel/blur/unmount及方向/业务回归保留，本轮补hover→drag→业务恢复；原生方向手感待验|
|进入休眠时 `sleeping`|未定义是用户空闲、Agent 空闲、系统睡眠还是手动|**缺定义/缺源/缺接线**：A:26 有目录；Q 无分支；PreferenceRenderLoop.tsx:9-10 的 hidden 暂停只是停绘制，不是 sleeping|无专门自动触发测试；定义后才做对应时钟/恢复/系统事件验收，不凭静默猜离线或休眠|

## 跨链路风险与生命周期

1. **不是每个已支持事件都保证完整播出。** Q 是当前快照优先级投影，不是事件队列。同配置多 Session 时优先取最近活跃 Session，工作可遮住另一 Session 的终态；快速下一 companion/活动会替换上一 occurrence，React 批处理也可能只呈现最后值。C/X 反馈两秒后主动清除；clip 长于两秒可被截断。这是当前行为边界，不能写成“所有事件必播一遍”。最小方案先测试并明确 latest-wins，不擅自增加业务通知队列。
2. **once 幂等有明确边界。** L 使用 `sessionId:occurrenceId` 或 `sessionId:workId:success/error`；重命名、restAction 更新不应重播，数字 replay 只用于手动试播。缓存为每 Renderer 模块内最多256项；不是跨原生窗口/进程持久化。窗口因离线销毁后重建、renderer 崩溃重载会丢缓存，Application 保留的未读终态可能重新播放。M 去掉 reconnect occurrence 不等于跨 Renderer 保留结果“不重播”。建议补这一有界回归，按当前产品决定是允许新呈现还是需保存展示身份，不先做持久消息系统。
3. **cue 在 effect 微任务记为已见，不是播放完成才记。** 无 clip、reduced 暂停、隐藏无帧、下一状态立即替换也可消费 cue。`reduced` 改变会重新跑 effect，已消费 once 回 rest；hidden 只停帧不禁止 effect。应验证“已接收但没看到”的边界，不能把 cue 去重测试当肉眼看见。
4. **fallback 已实现且应保留。** 可选全部 clip，包括 idle；未知请求/无匹配最终静态。细活动→working→idle；waiting→attention→idle；业务 once 回退 attention 仍一次；缺 transient 且当前有活动时不切 idle。结束后使用最新 restAction。不会自动生成或猜 clip 名，也不把导入资产当 starter 映射。
5. **试播与自动触发完全分开。** `PetsView.tsx:45,78-82` 展示可用映射；`ManagementApp.tsx:131` 每次手动增加数字 replay。即使 connected/hover/sleeping 可在这里播放，也不证明真实监听已接。首页显式选择和桌面真实命中现已接动画，但收藏选择仍不代表场景命中。
6. **在线/任务状态不应混淆。** Claude/Codex unknown 渲染 idle 是视觉默认，不是观测到任务闲置；旧 Claude presence-only 首页静态与桌面 idle 可统一为明确的未知状态策略，但不能引入假工作事件。waiting 状态必须有受支持 facts 配对清除。
7. **Gwen 循环卡顿独立未解决。** 既有“尾部闭合约0.25秒、首尾端点不连续”仅是待处理线索，本审计没有读取用户模型或证明根因/修复；触发接通不解决 clip 自身接缝。另开现有 clip 播放验证，不做骨骼、IK、retargeting、生成动画或新框架。

## 最小分阶段实施顺序

实施按下列独立阶段推进；拖拽阶段已由 Main 审查交付，第2项本轮已完成工程接线（原生视觉待验），下一项是 connected。以下保留原顺序与验收要求。

1. **先收口拖拽独立阶段。** 审查最终 diff，只复用当前 gesture 和 L；跑 writer 聚焦测试/typecheck/build，再做原生拖动。关注完成/工具错误在拖拽中到达、松手恢复最新 activity、无 dragging clip、reduced。方向变化不应不断 reset clip。不把中间红/绿测试误报为完成。
2. **补 UI 有真实来源的 hover / selected。** 范围：App/PetCanvas/PetModel、HomeScene/CompanionScene/ScenePet、L 的既有 request/replay/rest 参数及对应测试。用真实命中入边沿、明确 selection 边沿驱动局部 cue；键盘与鼠标一致，退出/blur/卸载清理。不把工具栏容器进入算命中模型；不影响业务 state/未读/IPC。先明确和拖拽、业务 once 的覆盖规则，优先最小 latest-wins，而非新框架。
3. **补 connected 并核对幂等。** 复用已认证配置在线事实；按“配置从离线→在线”而非每条 hello/每个 Session/每次场景挂载生成展示身份。范围：Configurations/Main 每配置投递 seam、desktop/home presentation、必要 shared/preload 类型和 tests。保持 per-config 隔离与迟到窗口 ready 守卫。先红测重连未读终态/renderer 重建边界，再决定最小展示身份放置点；不改 Provider 业务事实。
4. **补明确已有细分事实，其他能力保持未知。** Claude `max_output_tokens` 若原生类别与目标语义已证实，沿现有 occurrence/capability 加 output_limited，保留 error 未读、不制造 success；normalize→observations→Application/Q 回归即可。其余 C/X thinking/responding/working/success/wait/retry 等无可靠源的不强补；不解析 transcript、shell 或错误正文。
5. **决策后才做 sleeping / disconnected / 独立 attention。** sleeping 要定义来源、进入阈值/唤醒条件（若选择计时）及忙碌时是否禁止；没有定义不加任意计时器。disconnected 要在“保持离线立即移除”与“特定可见处展示断开”中明确产品范围；前者意味着桌面 disconnected 只能手动预览，不应宣称自动可见。**不默认为延迟销毁窗口。** attention 若仅保留 fallback，直接记录无需独立事件；若要未读持续关注，需用户确认其与 success/error once、确认和多 Session 的关系。
6. **集中真实验收，与 Gwen 接缝分开。** 各 Provider 用允许的已有原生事件、绑定已有 clips：事件事实→每配置投影→桌面/Home实际播放→退出/下一轮/重连；包括无映射/无idle/静态资产、切页隐藏、reduced、快速连续事件及长clip。先复用授权范围，新增 Agent/模型/用户文件操作另取精确授权。每阶段测试+typecheck+desktop build 通过仅是工程证据，不等于原生桌面动画验收。

需产品决定的真正阻塞：sleeping 的含义；disconnected 可见性与立即移除规则；是否要求每个短事件完整播完（当前 latest-wins），以及独立 attention 是否确实需要。其余清晰接线/回归无需人为增加审批仪式。

未做：日常配置/用户模型读取、原生/GPU视觉验收、dev 重启、打包或推送。
风险：23 项不能宣称全自动支持；latest-wins不保证快速事件完整播放，Gwen 循环接缝仍未解决。

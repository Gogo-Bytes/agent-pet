# 动画触发能力表

当前目录有22项，**不等于每个 Provider 支持22项自动事件**。Provider 事实、产品触发和资产已有 clip 是三层能力。目录唯一源为 [`actions.ts`](../packages/pet-runtime/src/actions.ts)，映射/制作见[作者指南](PET-ARTIST-GUIDE.md)，运行时交接见[架构](ARCHITECTURE-DESIGN.md#renderer-local-interaction-playback)。本文保留既有路径作为能力知识入口，不维护历史验收流水。

## 来源矩阵

下表限当前有界接入：pi0.85.1、Claude npm2.1.301、Codex standalone0.163.0；“未知/未接”不是活动不存在。短工具结果反馈不代表工具还在执行。具体字段/身份限制见 [pi](../integrations/pi-extension/README.md)、[Claude](../integrations/claude-hooks/README.md)、[Codex](../integrations/codex-hooks/README.md)。

| 触发 | pi | Claude | Codex / 本地边界 |
| --- | --- | --- | --- |
| `idle` | hello idle / 活动清除后的基线 | unknown 无活动时的视觉基线，不证明任务闲置 | 同 Claude；旧 presence-only 可静态显示 |
| `working` | agent_start 到整批 settled | submit/pre-hook 不足以确认 | 同 Claude |
| `thinking` | thinking_start/end | 未接可靠流来源 | 未接可靠流来源 |
| `responding` | text_start/end | 未接可靠流来源 | 未接可靠流来源 |
| `reading` | read start/end | Read 结果后2秒反馈 | 不从命令正文推测读取 |
| `writing` | write/edit start/end | Write/Edit/MultiEdit/NotebookEdit 结果后2秒 | apply_patch 结果后2秒 |
| `searching` | grep/find/ls start/end | Grep/Glob 结果后2秒 | 不从命令正文推测搜索 |
| `executing` | bash/powershell start/end | Bash 结果后2秒 | Bash 结果后2秒 |
| `compacting` | before_compact 到 compact/failed/abort | 可被阻断的前置 hook 不证明执行 | 同 Claude |
| `waiting_input` | ui_prompt_start/end 配对 | 无可靠配对清除，不用单个 permission_prompt 假装持续等待 | approval 不代表等待 |
| `success` | 观察到终态，agent_settled 且 ctx.isIdle | Stop 可继续，不产 completed-unread | 同 Claude；工具返回也不代表任务成功 |
| `error` | settled 的原生 error/length | 已知当前 prompt 的 StopFailure，保留错误未读 | 无统一可靠失败事实，见[边界](CODEX-ERROR-FEEDBACK-LIMIT.md) |
| `tool_error` | tool end isError 且非 aborted | PostToolUseFailure 且 is_interrupt 明确 false | 无可靠失败字段，不猜正文 |
| `retrying` | 当前 ExtensionAPI 不转发 SDK retry | 未证实可接生命周期 | 未证实可接生命周期；[来源](PROVIDER-ANIMATION-EVIDENCE.md) |
| `output_limited` | stopReason length 到 settled | 只保留通用 error，细分类依据不足 | 无来源；不能猜上下文容量/限流 |
| `cancelled` | aborted / 当前 run AbortSignal | 工具中止不证明整轮取消 | 明确 root Interrupt |
| `attention` | 无独立生产事件 | 无独立生产事件 | 仅资产 fallback；配置 attention 不触发动画 |
| `connected` | 认证配置聚合离线→在线 | 同左 | 同左；不是每 Session/hello/页面挂载 |
| `disconnected` | 离线事实存在 | 离线事实存在 | 离线立即移除实例，无自动可见载体；仅手动试播 |
| `hover` | 与 Provider 无关 | 与 Provider 无关 | 桌面宠物视口 DOM enter/leave（含透明部分）；首页各模型命中边沿 |
| `selected` | 与 Provider 无关 | 与 Provider 无关 | 首页模型/在线宠物按钮 click、Enter、Space；不含被动焦点、收藏选择，桌面无此操作 |
| `dragging` | 与 Provider 无关 | 与 Provider 无关 | 实际桌面位移后触发，同一映射；按方向外层旋转±10°，不改骨骼，resize不触发 |

`sleeping` 不属于目录：没有独立 Agent 休眠语义，旧包字段作为未知可选映射忽略；隐藏停帧不等于休眠，不增加空闲计时器。

## 播放与幂等边界

- 共享投影按当前快照优先级选择，不排队：waiting 优先，细活动 compacting→executing→writing→searching→reading→thinking→responding→retrying，随后近期反馈/工作/终态/idle。多 Session 保持独立业务/气泡，但一个配置宠物只表达当前选中投影；快速事件、React 批处理和2秒反馈期限可能截断或遮住 clip，不保证每事件完整播出。
- 业务 once 使用 Session+occurrence 或 work+终态身份；重命名/rest 更新不重播，手动数字 replay 可重播。每 Renderer 模块最多256项缓存，缓存淘汰、窗口销毁或崩溃可再呈现已有身份；不承诺跨进程 exactly-once。cue 在 effect 微任务标记已见，不是完成播放回执；缺 clip、reduced、隐藏或即时替换仍可消费。
- 拖动优先于 hover/selected，释放后恢复最新业务请求/rest；局部反馈期间不消费业务 cue。缺局部 clip 不用 idle 打断工作；完成或真实热区离开、取消、blur/hidden/lostcapture/unmount 清理。桌面模型自身运动/DOM子节点切换不是退出；hover 完成后需离开再进入才能重播。工具条/resize/间隙不是 hover 动画热区。
- connected 仅在 idle/中性 presence 呈现，低于业务/局部反馈；覆盖或 reduced/缺 clip 时不排队。首次偏好/绑定模型就绪前不在临时 starter 消费；每个视觉 surface 独立呈现，Main 不因 Renderer 重挂制造新连接边沿。
- 可选映射按目录尝试兼容 fallback：细活动→working→idle；waiting→attention→idle；业务 once 回退 attention 仍单次，success/error 不互相替代，最终静态。单次动作末姿保留至完成帧，交接在 mixer.update 之后并以 update(0) 采样，不等于跨 clip 平滑混合。
- 试播只证明资产有该 clip，不证明原生监听、窗口输入或 GPU 视觉；源码/合成测试、实际原生事实与视觉质量分别判断。持续状态阶段见[已确认但未实施的设计](PET-ANIMATION-TRANSITIONS.md)，不得提前使用未来包格式。

实施入口：[业务投影](../packages/pet-runtime/src/presentation.ts)、[共享播放器](../apps/desktop/src/renderer/shared/usePetAnimation.ts)、[本地输入](../apps/desktop/src/renderer/shared/usePetInteraction.ts)、[配置聚合](../apps/desktop/src/main/configurations.ts)。产品当前保持 attention 仅回退、离线立即移除和 latest-wins；改变它们须明确产品范围，不因目录保留项自动增加行为。任务入口见[MVP](MVP-EXECUTION-PLAN.md)。

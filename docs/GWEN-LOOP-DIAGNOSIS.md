# 格温循环边界诊断

状态：**完成有界源码/姿态测量；用户可见卡顿未修复，尚缺原生帧迹。** 基线 `82fed8c`。本轮没有生产代码或播放策略变更，不把素材接缝指标当作完整视觉根因。

## 范围与信号

只读用户授权包中的 `pet.glb`、`pet.json`、`loop-adjustments.json`，没有复制/提交模型、解码纹理、操作日常 Agent 或重启 dev。模型 SHA-256 在两条探针前后均相同：`3f0aeb7490c46ac279c6263604503e2871e50c7fb1226d0b05a057bbbfc5dae1`。

采用两条独立信号，避免把“端点相同”误判为“循环平滑”：

1. 实际 GLTFLoader 解析、Three AnimationMixer 取样原始 15 个 clip 的 213 个骨骼世界位置；纹理返回空 Texture，仅略过图片解码，不替换节点、轨道、时间或插值。按固定时刻比较接缝两侧和 0.25 秒闭合段速度。
2. 正式 PetModel（桌面）和 ScenePet（首页/试播）→ usePetAnimation → **实际 Drei useAnimations/mixer** → PreferenceRenderLoop/R3F advance。替换的只有 useGLTF 的网络/缓存入口和受控 RAF；测试 Renderer 不绘制真实 GPU。每17帧保持原映射重渲染，覆盖普通父组件重渲染。记录实际 action 时间、reset、loop/finished 和 mixer delta。

候选解释与可证伪条件：①若源闭合段导致迟滞，绕开 React 直接按原 clip 取样仍有速度下降；②若应用循环时重启动作，正式组件会出现额外 reset 或 action 相位偏差；③若为真实 RAF/GPU 卡顿，需原生帧间隔与动作时间的同步记录，恒定输入的测试不能排除；④若是单次反馈结束切回 idle，应先核对触发项，而非把 clip 名中的 Loop 当播放规则。

## 已测结果

### 播放器控制流

Idle_Base、Cast_Cycle、Dance_Loop × 桌面/场景两入口，共6种情况，各运行3个完整循环。在稳定映射、60Hz受控RAF下：

- 初始化完成后 **0次 reset、0次 finished**，每种情况恰好3次 loop；边界没有额外等待帧。
- action 相位对累计 elapsed 的最大误差 `< 3e-13 秒`；正 delta 为约 `1/60 秒`，边界与非边界一致。
- 所有测试视图卸载后 RAF 回调为0。
- 源数据取样第二圈的 mixer.update CPU p95 为约 `0.020–0.045ms`（Node 单实例、无纹理/GPU）。这不是应用总帧耗时，也不是原生性能通过。

**没有取得应用循环重置/暂停的失败信号，因此没有据此修改播放器。** 测试不覆盖实际操作产生的业务/交互切换、非稳定 props、系统调度或 GPU。

### 原素材运动变化

速度为213个骨骼世界位置的帧间 RMS 位移 / 静态模型包围盒对角线 / 秒。每个时间窗口120等距样本；尾段/正文使用 sidecar 指定分界并避免把首尾跳变混入速度均值。它是姿态变化代理指标，不是屏幕像素、蒙皮顶点速度或感知评分。

| clip | 附加尾段 | 尾段平均速度 / 正文 | 最后100ms速度 | 最初100ms速度 |
| --- | ---: | ---: | ---: | ---: |
| Idle_Base | 0.25s | 2.08% | 0.0023 | 0.0543 |
| Cast_Cycle | 0.25s | 2.65% | 0.0193 | 0.6520 |
| Run_Haste | 0.25s | 4.02% | 0.0233 | 0.4048 |
| Interact | 0.25s | 7.14% | 0.0160 | 0.2967 |
| Idle_In | 0.25s | 94.75% | 1.0981 | 0.5419 |
| Cast_Damage | 0.25s | 129.59% | 2.1314 | 2.6545 |
| Dance_Loop | 无 | 不适用 | 0.6334 | 1.1105 |

Idle_Base / Cast_Cycle / Run_Haste 的尾段在**不经应用**的原 clip 上已显著慢于正文，是局部“停一下”感的明确素材线索；但 Idle_In、Cast_Damage 不呈现同样现象，所以不能据此解释“所有动画”。闭合段相同端点仍可有速度突变。

Dance_Loop 没有补尾；`t=0` 与 `t=duration-1e-6` 的骨骼位置 RMS 差约为模型对角线的 **1.292%**，有源姿态接缝，不是播放器等待。Damage_Hurt、Death、Greeting 的同一差值约为13.293%、11.316%、0.223%。这不说明它们应该被循环或必须修改。

**诊断循环不等于正式触发规则。** 为对照边界，上述播放器探针临时将 Dance_Loop 作为 idle 的循环目标；未改任何 manifest。原包 `success → Dance_Loop`、`error → Death`、`connected → Greeting` 实际是单次触发，结束回当前 rest/idle；clip 名含 Loop 不会覆盖目录规则。Idle_Base/工作 Cast_Cycle 则实际循环。反馈结束切换与循环接缝必须分别验收。

## 证据与复查

- `/tmp/gwen-loop-diagnostic-82fed8c.test.tsx`：正式组件控制流探针，无模型字节。
- `/tmp/gwen-loop-probe.log`：首次探针失败，原因是 spying 的 Three ESM prototype 不是 Drei 实际 action 实例；不是产品 reset 缺陷。
- `/tmp/gwen-loop-probe-retest.log`、`/tmp/gwen-loop-measurements.json`：一次有界修正为观察实际 Drei 返回 mixer，复验 **1 passed**。最初累计步进的最后样本可能因浮点模数落在边界任一侧，因此接缝数字以下列固定时间探针为准。
- `node /tmp/gwen-source-seam.mjs`：固定时间 Three 源姿态探针，通过3个明显慢尾段、Dance_Loop端点差及Idle_In反例的断言；结果 `/tmp/gwen-source-seam.json`、`/tmp/gwen-source-seam.log`。
- `pnpm exec vitest run apps/desktop/src/renderer/features/pet/PetModel.test.tsx apps/desktop/src/renderer/management/ScenePet.test.tsx apps/desktop/src/renderer/shared/PreferenceRenderLoop.test.tsx`：**53 passed / 3 files**，日志 `/tmp/gwen-loop-existing-tests.log`。没有新增永久测试或更改保护断言。

复查组件探针时，仅在 `apps/desktop/src/renderer/shared/gwen-loop-diagnostic.test.tsx` 不存在时将临时探针放回该路径，再运行 `pnpm exec vitest run apps/desktop/src/renderer/shared/gwen-loop-diagnostic.test.tsx`；完成后移走本次临时文件。它依赖已授权本机包，不能加入普通CI。证据均为本机临时文件，不保证跨机器或清理后仍存在。

## 安全停点与下一步

没有用户可见症状的完整红/绿信号，不做盲目裁尾、加速、混合/生成动画或逐骨骼修补；原22项触发、fallback、单次/rest、局部交互与业务优先级、reduced、在线可见性全部保持。

继续需要：明确发生处（桌面、首页或收藏试播）和一个触发项；优先选择实际循环的“空闲/任务进行中”，鼠标离开模型，录制至少3轮，同时记录 FPS/减少动画设置。若所有 clip 仍有同节奏停顿，需要该场景的实际 RAF帧间隔、action时间及组件重挂迹象的同步脱敏采样，才能区分调度/GPU与素材接缝；这属于后续精确原生检查范围，不从本次恒定RAF结论外推。

若最终仅素材闭合段不理想，应由用户/资产作者决定是否重新制作源动画；本轮只读授权不允许自动加工或替换。没有请求新依赖、Agent调用、配置变更或隐式授权。

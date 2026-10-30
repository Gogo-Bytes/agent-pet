# 格温循环边界诊断

状态：**用户已明确是末尾停顿/接续不自然；一次源特定缩尾候选不合格，未交付修复。** 初次诊断基线 `82fed8c`，本次实验基线 `a8a006b`。没有生产代码或播放策略变更；继续需要作者修订源动画，不再以原生掉帧录屏作为本次素材接缝工作的前置条件。数值指标不是视觉验收。

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

## 初次诊断停点（已由后续用户澄清与下节实验更新）

没有用户可见症状的完整红/绿信号，不做盲目裁尾、加速、混合/生成动画或逐骨骼修补；原22项触发、fallback、单次/rest、局部交互与业务优先级、reduced、在线可见性全部保持。

继续需要：明确发生处（桌面、首页或收藏试播）和一个触发项；优先选择实际循环的“空闲/任务进行中”，鼠标离开模型，录制至少3轮，同时记录 FPS/减少动画设置。若所有 clip 仍有同节奏停顿，需要该场景的实际 RAF帧间隔、action时间及组件重挂迹象的同步脱敏采样，才能区分调度/GPU与素材接缝；这属于后续精确原生检查范围，不从本次恒定RAF结论外推。

初次诊断时未授权加工或替换。随后用户确认不新增精细接口，Main限定在独立临时副本实验；没有授权覆盖原包、安装或重绑定。没有请求新依赖、Agent调用或配置变更。

## 源特定时间修正实验：候选拒绝

用户澄清问题是动画结束停顿而非掉帧。确认的产品契约是「触发时机 → clip」，作者交付自然循环素材，应用不暴露裁尾/混合/速度/循环区间，也不自动修正导入素材。未改变22项触发、fallback、单次/rest或用户资产。

仅对实际循环映射的 `Idle_Base`（idle）、`Cast_Cycle`（working/writing）、`Run_Haste`（dragging/retrying）做**一次**源特定假设验证：通过真实 GLTFLoader 读取原 GLB，克隆 Three AnimationClip，仅将 sidecar 记录的0.25秒附加闭合时间压到原关键帧间隔中位数约1/30秒。原正文时间、所有关键帧值和原始 clip 均不改；无骨骼生成、混合、迭代调参或通用二进制工具。纹理解码仍以空Texture替代；无GPU渲染。

对213个骨骼世界位置取样，距离按原静态包围盒对角线归一化。分别以 h=1/240秒和1/960秒测量首尾姿态差、两侧速度向量差、正文→闭合段的速度差、全片采样速度峰值、差分加速度峰值，以及接缝局部加速度。下表列h=1/240，箭头为原始→候选；h=1/960给出相同改善/退化方向。LINEAR轨道导数本就可有跳变，差分加速度随h变化，不是精确物理加速度或感知评分。

| clip | 尾段/正文平均速度 | 首尾速度向量差 | 闭合入口速度差 | 全片采样速度峰值 | 全片采样加速度峰值 | 首尾局部差分加速度 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Idle_Base | 2.08%→15.59% | 0.04999→0.04827 | 0.06271→0.05843 | 0.22293→0.22293 | 25.654→25.654 | 11.998→11.585 |
| Cast_Cycle | 2.65%→19.90% | 0.74500→0.70746 | 1.07958→1.05560 | 1.15117→1.15117 | 259.099→253.344 | 178.799→169.790 |
| Run_Haste | 4.02%→30.16% | **0.15184→0.21732** | 0.28896→0.27974 | 1.17457→1.17457 | 340.073→340.073 | **36.442→52.157** |

首尾姿态差保持不变：Idle_Base约2.91e-8，另外两项为0。**端点闭合和全片峰值不升掩盖不了局部接缝变坏**：Run_Haste首尾速度/局部差分加速度恶化约43.1%。前两项接缝速度差仅改善约3.4%/5.0%，尾速仍明显低于正文；不能称自然循环。候选整体拒绝，不为前两项单独导出、不扩大至其他clip、不继续调参。

### 可复查证据与边界

- `node /tmp/gwen-source-seam.mjs`：本次再次重现原三个慢尾段，日志 `/tmp/gwen-source-seam-current.log`。
- `node /tmp/gwen-loop-seam-candidate/experiment.mjs`：候选探针；`results.json`、`run.log` 位于同目录。包含两种h下的完整数值、track.validate、原clip未修改及模型SHA-256不变断言。进程成功表示实验完成，**numericNoRegression=false** 表示候选不合格。
- 首轮探针的LoopOnce终点clamp影响后续倒序取样，触发原慢尾断言失败；唯一一次修正为每次固定时刻取样先reset action，复验完成。失败日志 `first-probe-failure.log` 保留，不算产品失败或额外候选迭代。
- 没有生成GLB或可安装宠物包：仅在独立/tmp目录保留脚本、日志、数值JSON。因此没有候选GLTFLoader重载/导入预算验收，也没有需预览/安装的合格候选；不声称导出保真已验证。
- 原文件SHA-256前后均为 `3f0aeb7490c46ac279c6263604503e2871e50c7fb1226d0b05a057bbbfc5dae1`。原包、已安装收藏、其他动画/几何/纹理/权重/元数据均未写入。未经确认许可的资产未入Git、上传或发布。

### 当前安全停点：需要作者修订源动画

请作者在原DCC制作文件中重做实际循环clip的衔接：去掉人工低速闭合段的设计，调整原轨迹/曲线，使首尾姿态、速度和方向自然连续，不以复制首帧或仅删尾/缩尾代替修订；保留clip名称和非目标内容。优先处理Idle_Base、Cast_Cycle、Run_Haste，其他循环映射逐项检查，不统一套时间规则。重新导出后检查GLTF加载和应用资源预算，再按实际循环触发连续看至少3轮，并单独验证单次反馈恢复；作者不需要任何新增manifest字段。

本次只交付明确接口/素材质量契约及失败实验记录，没有交付产品或素材修复。设计/文档检查不等于用户视觉通过；原生GPU、蒙皮表面及主观顺滑程度未验收。

# 格温循环边界诊断

状态：**用户已授权由开发侧承担离线素材修订；Idle_Base 原生制作候选已有数值改善，但 Blender 重导出超过导入预算，尚未交付可安装修复。** 最新基线 `f24ab87`，详见下节。原包、已安装宠物、生产代码和播放策略不变；对外仍只有触发时机→clip。此前缩尾拒绝和“待作者修订”是历史停点，最新授权覆盖责任归属，但不授权放宽导入 guard、安装工具或覆盖原包。数值指标不是视觉验收。

## 离线作者修订：Idle 候选与导出阻塞

### 范围与制作

本机已有 Blender 5.1.1、ffmpeg；原包没有 `.blend` 等 DCC 源文件。因此仅将原 GLB/manifest/头像/闭合记录复制到新建私有临时目录，用 Blender 原生 glTF 导入生成制作文件。没有执行包内脚本、加载第三方插件、安装依赖、改播放器/接口或操作 Agent。

只做一个代表性运动候选：`Idle_Base` 去掉人工0.25秒慢闭合，保留1.6秒原正文节拍；首尾各100ms以 Blender 原生 Bezier 曲线衔接共同的边界切线，内部曲线和其余14个clip不做作者编辑。不是仅缩短旧尾段或复制端点。保存为 `idle-candidate.blend`，保留动作名；Cast_Cycle、Run_Haste及其他循环片段尚未修订。

### 重载与有界数值证据

用真实 GLTFLoader/AnimationMixer 重载导出的 GLB；骨骼位置按原模型包围盒对角线归一化，旋转用世界空间四元数差分；蒙皮表面按各primitive实际绘制的索引角点取样，不把共享position accessor里的未绘制顶点重复当作该材质表面。纹理解码在此数值探针中仍由空Texture替代，真实图片另由Blender预览加载。

| 指标（h=1/240秒） | 原版 | Idle候选 |
| --- | ---: | ---: |
| 最后100ms骨骼平均速度 | 0.002285 | 0.080015 |
| 最初100ms骨骼平均速度 | 0.054299 | 0.054838 |
| 正文平均速度 | 0.116546 | 0.116547 |
| 首尾骨骼速度向量差 | 0.049991 | 0.011658 |
| 首尾蒙皮表面速度向量差 | 0.059693 | 0.011169 |
| 首尾角速度向量差（rad/s RMS） | 0.607354 | 0.181354 |
| 全片蒙皮速度峰值 | 0.276850 | 0.276852 |
| 全片蒙皮差分加速度峰值 | 33.69857 | 33.69962 |

h=1/960秒下改善方向相同；候选首尾骨骼/表面姿态RMS差约1e-9，7个手/脚/剪刀节点端点位置差为0，速度差均下降。正文没有被减速成静态，峰值差约为数值重采样量级；但60Hz LINEAR导出仍有残余速度差，不能据数值称完全光滑或用户已验收。

14个非目标clip时长不变，各121个固定时刻与**同设置未编辑roundtrip**的骨骼轨迹差为0。与原包相比，Dance_Loop/Dance_In/Run01最大差约模型对角线0.0162%，其余小于0.000044%；这是原生往返已有误差，不归因为Idle修订，也不宣称字节保真。Idle→Cast、Cast→Idle、Dance_Loop→Run01、Death→Greeting四组按既有stop/reset规则切换，结果与独立新场景同一目标clip一致，没有测到旧姿态残留。

图片3份PNG字节摘要、5个primitive绘制索引数量、1个skin/213个joint和15个clip名称保持；原生重导出重新组织顶点/缓冲，并把部分材质 `extras.hash` 大整数变成字符串，还显式写入unlit下不参与渲染的PBR默认值。**未知元数据类型保真未通过**，后续工具处理必须保留原字段含义，不能把当前重导出视为无损包。

### 当前阻塞与预览

未修改曲线的roundtrip也生成10211 accessors/10214 bufferViews；Idle候选为10212/10215，超过既有8192/2048上限。经Main批准仅一次标准 `export_optimize_animation_keep_anim_armature=False` 导出复验，数量未下降，停止导出尝试，不写自制GLB去重器、不放宽guard。

实际 `inspectPetFolder`：原包 `ok:true`，候选 `invalid-model`。首次临时探针传入macOS `/var`别名，正确被safeRoot拒绝为not-directory；改用同一自有目录的canonical realpath后一次复验得到预期invalid-model，没有修改guard。原根目录22个普通文件的摘要均不变，GLB仍为 `3f0aeb7490c46ac279c6263604503e2871e50c7fb1226d0b05a057bbbfc5dae1`。

已生成同镜头并排离线预览：768×384、15fps、96帧、6.4秒，覆盖原版约3.46圈和候选4圈。单帧已确认模型/纹理/标签可见；完整动态顺滑、原生GPU和应用内播放未验收。预览不代表候选可导入，**没有安装、替换或重绑定宠物**。

后续需要用户批准在新临时工具目录安装固定版本标准 glTF 优化工具（候选 `@gltf-transform/cli`，只做无损accessor去重/缓冲打包，并处理原材质extras类型保真），不进入项目依赖；版本、下载量/磁盘范围须安装前核对。未安装或调用该工具，不能预先保证其能满足预算。先验证当前Idle候选可导入及视觉，再处理其他循环clip，不扩大未经验证的修订。

### 本机证据路径

临时根：`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/gwen-author-revision-vl_6l6d8`（canonical前缀为`/private/var`）。内容仅本机保留，未入Git/上传/授予再分发许可：

- `source/`、`original-hashes.json`：原文件只读副本及根文件摘要。
- `imported.blend`、`idle-candidate.blend`：原生导入和Idle制作候选。
- `roundtrip.glb`、`idle-candidate.glb`、`*-compatible.glb`：导出证据；均不是可安装交付。
- `rejected-inspection/`：只用于正式预检的拒绝fixture，ID为`chibi-gwen-loop-review`；原归属与未核实许可保留，内有NOT-FOR-IMPORT提示。
- `inspect-blender.py`、`author-idle.py`、`export-compatible.py`及对应日志：标准工具操作。首轮作者脚本删除关键帧后持有失效RNA引用，已唯一修正为逆序索引删除；失败日志单独保留。最初全量强制重采样roundtrip同样未通过预算，现已改用原生非强制采样导出，非目标插值不统一重烘焙。
- `measure.mjs`、`metrics.json`、`verify-evidence.py`：最终导出重载指标及证据自检；早期错误计入未绘制顶点的表面样本另存`metrics-unused-vertices.*`，以上数字以修正后的实际索引角点取样为准。一次最终自检错误要求两次候选导出字节完全相同而失败：Blender重载后重排部分动画/accessor/bufferView，改为分别用真实Loader重载比较，数值结果完全一致（`metrics-first-export.json`保留首次导出结果），不把二进制重排称为动画变化。
- `preservation.mjs`、`preservation.json`：图片/几何计数、非目标和切换证据；`import-probe.test.ts`、`import-probe.log`、`import-results.json`：正式预检及原文件不变断言（1 passed）。临时测试曾按相对import seam放在Main目录，运行后已移除，未成为依赖用户模型的CI测试。
- `render-comparison.py`、`preview-frames/`、`idle-comparison-3cycles.mp4`、`original-seam-contact.png`、`revised-seam-contact.png`：标准Blender渲染与ffmpeg合成。原接缝接触表为1.667–2.000秒，候选为1.400–1.733秒，各6帧。

本轮只提交制作进展/阻塞文档；没有生产或永久测试变化，不重跑全量/typecheck/build，不宣称格温所有动画已修好。

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

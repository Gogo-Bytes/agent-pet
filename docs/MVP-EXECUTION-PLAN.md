# 当前 MVP 执行计划

## 优先级与范围

**当前目标：先交付单用户、本机 macOS、pi 的可用 MVP，再补生产安全与正式分发。** 本文是当前执行顺序、检查点与进度的唯一入口；旧 P0/P2/B/D 阶段文档保留技术契约和历史证据，不再决定本地 MVP 的先后顺序。产品语义见 [需求](../PRODUCT-REQUIREMENTS.md) 与 [领域术语](../CONTEXT.md)。不另建任务数据库或完成百分比。

MVP 复用现有 Electron Main、管理窗口、React/R3F 宠物、Application 状态模型和 pi 观测扩展：一个宠物、多独立 Session，只观察名称和状态；不启动、接管、审批或控制 Agent，不读取对话正文。先跑通一个明确授权的真实 pi 配置目标；不扩大到 Windows、Codex、Claude Code 或新核心框架。

最终需要脱离源码目录可运行的本地 `.app`，不是要求用户一直运行开发服务器。正式签名、公证和自动更新不作为这个本地 MVP 的前置条件；未签名/本地签名的使用限制必须明示，不能宣传为正式可分发安全产品。

### 延后，但不是通过

以下是后续生产化工作，**不阻塞 M1–M5 的本地 MVP 排期**：跨用户隔离验收、完整 socket ACL/peer 身份验证、原生 syscall 故障注入、正式签名/公证/更新流水线、自动恢复/reset/revoke-all。状态仍为未验证或未实现；D6 完整安全准入仍 **BLOCKED**，不能改标为 PASS。

这次优先级变更不授权删除生产 guard、绕过 `acl-unverified`、引入 allow-all policy 或把测试 policy 接入真实目标。既有正确性、撤销竞争、数据保留和失败关闭测试继续保留；若 M1 选择涉及生产入口的实现变更，须明确其边界、残余风险和对应验证后再实施。延期安全验证不等于已有安全保证。

### 不变的底线与权限

- 秘密不进日志、Renderer、诊断或随包源码；不采集 prompt、响应、工具正文或完整 transcript。
- 保留未知配置/文件与用户修改；不覆盖共享 settings/trust，不绕过用户禁用扩展的意图，不自动删除不确定数据或残留 owner/lock。
- 安装候选、配置目标、已部署、已加载、连接在线与业务事件通过分别提供证据。只读检查不是安装同意，socket connect 不是业务验收。
- 本次仅文档校准：不读真实配置、不运行 pi/App、不激活连接、不安装依赖、不改运行代码。下一步 M1 可先做代码与临时目标工作；M2 真实读写/部署/连接必须先给出**精确目标、读取和写入范围、变更预览、生效条件与撤回方式**并获得授权。本次没有该授权。
- 普通实现与小修复由 Main 按范围推进，不逐项询问用户；只有结果/范围变化、真实环境权限、不可逆动作、新增依赖/实质成本或风险接受需要另行确认。打包依赖安装与签名账号/证书成本分开处理，不默认获准。

## 当前事实与证据

基线：`eedda5d935bd464220085697438d389fcfbae5c8`。以下代码入口已静态核对；历史执行结果归属原阶段，不是本次重跑。

状态用语：**PLANNED**＝未交付该检查点；**IMPLEMENTED-NOT-ACCEPTED**＝有实现，但缺该范围实际验收；**VERIFIED**＝仅所列范围有执行证据，不外推到整个产品。

| 能力 | 状态与准确边界 | 可复查入口 |
| --- | --- | --- |
| 宠物、Session/确认、管理窗口与 P2a 只读检测 | IMPLEMENTED-NOT-ACCEPTED（完整本地 MVP）；既有自动化与局部用户反馈保留，原生菜单栏/选择器等仍有缺口 | [桌面 README](../apps/desktop/README.md)、[P2a](DESKTOP-P2A-PREFLIGHT.md)、[pi 反馈](PI-ACCEPTANCE.md) |
| legacy 开发 opt-in bridge | 已实现并接入 Main；依赖显式 endpoint/token，扩展需主动加载，不是零配置安装器，也不是 managed fallback | [Main](../apps/desktop/src/main/index.ts) 的 `startConfiguredAdapters`、[pi-config](../apps/desktop/src/main/pi-config.ts)、[Adapter](../packages/adapter-pi/src/index.ts)、[扩展](../integrations/pi-extension/index.ts) |
| legacy 纵向自动化 | VERIFIED（合成 pi callbacks → 真实隔离 socket → Application，以及重连）；不是运行中的真实 pi TUI | [bridge.test.ts](../integrations/pi-extension/bridge.test.ts)、[reconnect.test.ts](../integrations/pi-extension/reconnect.test.ts) |
| managed 公开工厂与生产 policy | 休眠且 fail-closed；调用在参数读取/FS/socket 之前拒绝 `acl-unverified`，Main/扩展未接线 | [managed/index.ts](../packages/adapter-pi/src/managed/index.ts)、[path-policy.ts](../packages/adapter-pi/src/managed/path-policy.ts)、[service.test.ts](../packages/adapter-pi/src/managed/service.test.ts)、[legacy-regression.test.ts](../packages/adapter-pi/src/managed/legacy-regression.test.ts) |
| managed 内部 Core/AuthStore/native/Worker | 已有复用实现与 fixture 集成，不是全部尚未接入，也不是生产入口已可用 | [service.ts](../packages/adapter-pi/src/managed/service.ts)、[Worker 测试](../packages/adapter-pi/src/managed/worker/service-worker.test.ts)、[P2 历史记录](DESKTOP-P2-IMPLEMENTATION.md) |
| B4.3 / B4.4a | VERIFIED（历史 Electron Worker / disposable staged-resource 范围）；B4.4a 没有 ASAR/最终 `.app`/签名，不是应用包 | [P2 B4 证据](DESKTOP-P2-IMPLEMENTATION.md)、[staged launcher](../scripts/electron-managed-worker-staged-smoke.mjs) |
| D6.1 | VERIFIED（有界同账户 harness 已完成）；完整 D6 仍 BLOCKED，且不再是本地 MVP gate | [D6.1 契约](DESKTOP-P2B2-FILESYSTEM-POLICY.md#d61--bounded-synthetic-current-account-harness)、[harness.test.ts](../packages/adapter-pi/src/managed/d6/harness.test.ts)、[evidence.test.ts](../packages/adapter-pi/src/managed/d6/evidence.test.ts) |
| 独立本地应用包、真实部署全链路 | PLANNED；真实端到端验收 **NOT DONE**，不能说“只剩加载一下”或“生产集成就绪” | [desktop scripts](../apps/desktop/package.json)、[根 scripts](../package.json)、[adapter exports](../packages/adapter-pi/package.json) |

最近 Main 执行的基线结果：**489 passed / 1 skipped**；D6.1 runner **8 PASS / 7 BLOCKED，exit 2**。本次不重跑测试、native harness 或构建。单项 skip、blocked 与保留的 fixture barrier 不因总测试通过而消失。旧文档中的 335/371/448 等数字仍只对应各自历史阶段。

`PI-ACCEPTANCE.md` 的工作/完成/重启等用户反馈继续有效，但没有记录为当前 M2–M5 路线下完整部署、故障、卸载和应用包验收；不能升级为全链路通过。

## 顺序检查点

每段只交付一个可独立验证、回滚的增量，复用已完成阶段。实现阶段按改动运行针对性测试、必要类型检查/构建并核对 diff；本地提交与推送遵循 [工程规则](../AGENTS.md)。文档校准以链接、范围一致性和独立审查验证，不以未运行的功能测试作为完成证据。

### M1：选定最小接入路线并交付一个纵向切片 — PLANNED

**下一可执行动作就是 M1，不是补完整 D6。** 先以代码作一次简短决策，比较：

- **沿用 legacy bridge**：Main 与自包含扩展已有状态链路；仍需解决日常启动的配置供给、连接状态、授权部署/停用，不能把手填环境变量当最终产品，也不能宣称已有 managed auth/ack 或完整端点保护。
- **复用 managed 内部机制**：已有每目标授权、发现、撤销和 Worker 存储；公开工厂仍关闭，生产目录/端点、扩展消费方式与外部 Node 资源交付仍有缺口。不能把换掉拒绝值当完成集成。

产物是**一个有代码依据的路线结论＋一个临时目标上的小纵向切片**：明确复用入口、必要改动、适用本地边界、未验证项及回滚点；把一条当前状态送到既有 Application/气泡并证明断开不阻塞 pi 侧逻辑。保持另一条路线独立，不复制 Core/AuthStore/协议状态机，不另造通用安全框架。若所选路线改变 guard/风险边界，先明确实施决定，不能由文档延期自动推导许可。

验收：针对性合成集成测试通过；现有正确性/保留数据断言不下降；失败有明确停点。这里不要求完整安装器、多目标管理、跨用户或正式打包。若发现阻塞，限定一次最小复现/修复/复验，仍失败则按同一任务协议报告并停止，不扩大成架构项目。

### M2：一个明确授权的真实 pi 目标部署与连接 — PLANNED

基于 M1 路线复用 P2a 的安装/目标区分，先在临时目标完成预览、取消零写入、同名冲突零覆盖、并发变化拒绝与自有文件追踪，再请求真实目标的精确授权。仅部署一个自包含观测入口；不改未知 settings，不自动 reload/重启 pi。

验收：用户授权目标与实际版本记录明确；新部署不会重复加载；UI 区分“已配置/等待加载/已连接/失败”；用户在允许时机正常打开或重载 pi 后，真实 Session 建立观察连接。连接依据须符合所选协议，legacy 的 hello 不冒充 managed auth/ack。保存脱敏证据和选择性撤回方法，不泄露 token。单独在线还不是 M3 通过。

### M3：真实状态、确认、重连与重启 — PLANNED

验收同一目标上的 idle → working → completed-unread / error-unread → 点击确认；idle 是无工作/无未读时的宠物基线，不新增 idle 通知。工作中点击不消失，终态确认后旧事件不复活；名称更新、多轮与独立 Session 不互相覆盖。错误必须来自可证明的工作终态，不能把工具单次错误或连接断开伪造为 Agent 失败。

覆盖桌面重启、pi 正常重启/用户安全 `/reload`、连接中断再恢复；只发布当前 working/idle，不回放离线完成/错误；未读无需跨应用重启恢复。取消/retry 的实际观察与未覆盖路径分别记录。Open Session 可诚实返回 unsupported，确认行为仍完成。不由测试者替用户发起 Agent 控制。

验收证据须区分真实 TUI 与合成回归；缺少真实失败/重启等场景则该项未通过，不能以既有用户反馈替代整段。

### M4：日常生命周期、失败提示、停用与选择性卸载 — PLANNED

复用 P1 的关闭隐藏、Dock/菜单入口、单实例和退出等待；验证重新打开、全隐藏找回、退出释放连接。修复阻碍日用的菜单入口问题，未采用的可选登录自启保持默认关闭，不暗中登记登录项。

验收：宠物在 pi 不在线/配置冲突/连接失败时仍可用，界面给出可理解的连接状态而不是伪造业务错误；扩展断线退避、不阻塞或保活 pi。用户可停用接收并选择性移除仍匹配身份与内容的自有扩展/配置，保留用户修改和未知残留；重启后停用不自动复活。清理或持久化失败如实报告，不谎称完全卸载。直接拖删 `.app` 不承诺自动清理，给出卸载前入口与残留说明。不实现自动 recovery/reset/revoke-all，不用删除未知 owner/lock 修复故障。

### M5：脱离源码目录可运行的本地应用包 — PLANNED

先确认最小本地打包路径；若需安装 packager/依赖，单独说明范围并取得许可。复用现有构建、资产和 M1 路线，只携带实际需要的 Worker/native/扩展资源；外部 pi 不依赖 workspace、源码路径或 Electron ASAR 的特殊读取。

验收：产物自带 Electron runtime，可从源码树外打开，无需 Node/pnpm/开发服务器；已有外部 pi 不被捆绑或自动安装。至少在本机移动/重新打开 `.app` 后复验连接、状态和停用链路，记录实际 OS/架构与资源加载结果；不以 `electron-vite build` 或 B4.4a staged smoke 代替。未签名/本地签名及 Gatekeeper/隔离属性限制明确记录，不要求关闭系统保护来假装通过；若系统阻止本地运行，则该项仍未验收。正式签名、公证、跨机器分发和自动更新继续单列后续工作。

## 历史材料与后续生产化

- [P2 实施记录](DESKTOP-P2-IMPLEMENTATION.md)：B1–B4.4a 的实现与证据，非当前待办顺序。
- [连接](DESKTOP-P2B-LOCAL-CONNECTION.md)、[文件系统/D6](DESKTOP-P2B2-FILESYSTEM-POLICY.md)、[生命周期](DESKTOP-P2B2-LIFECYCLE-DESIGN.md)：现有机制不变量及旧严格准入；延期的验证保持未关闭。
- [安装契约](P0-MANAGED-INSTALLATION.md)、[本机安全研究](P0-LOCAL-SECURITY-DECISION.md)、[发布研究](P0-SECURITY-RELEASE-RESEARCH.md)：按 M1 路线取用已有正确性/所有权要求，不把未来全部生产承诺重新塞进 MVP。

本计划尚未选定 legacy/managed 路线，也没有给予真实目标权限。后续只在对应检查点取得证据后更新状态；技能是复用流程而不是项目进度表，当前优先级留在本文件和 AGENTS，不复制进通用 skill。

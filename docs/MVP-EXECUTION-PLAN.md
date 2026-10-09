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
- 此前仅授权 M1/M2 部署与桌面授权入口的代码实现、自有临时目标/隔离 socket 验证。2026-10-08 用户另授权以 Computer-Use 操作桌面端验收，范围为本轮自建的独立测试目录；开发版 App 已运行。仍不读写日常 HOME/pi 配置或安装目标、不安装依赖。M2 的目标读写/部署/连接须先给出**精确目标、读取和写入范围、变更预览、生效条件与撤回方式**并获得授权；本轮已按预览确认写入并在同一桌面进程撤回自有测试扩展。
- 普通实现与小修复由 Main 按范围推进，不逐项询问用户；只有结果/范围变化、真实环境权限、不可逆动作、新增依赖/实质成本或风险接受需要另行确认。打包依赖安装与签名账号/证书成本分开处理，不默认获准。

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

### M3：真实状态、确认、重连与重启 — PARTIAL（两轮正常任务、确认、pi 重启不回放已验）

验收同一目标上的 idle → working → completed-unread / error-unread → 点击确认；idle 是无工作/无未读时的宠物基线，不新增 idle 通知。工作中点击不消失，终态确认后旧事件不复活；名称更新、多轮与独立 Session 不互相覆盖。错误必须来自可证明的工作终态，不能把工具单次错误或连接断开伪造为 Agent 失败。

覆盖桌面重启、pi 正常重启/用户安全 `/reload`、连接中断再恢复；只发布当前 working/idle，不回放离线完成/错误；未读无需跨应用重启恢复。取消/retry 的实际观察与未覆盖路径分别记录。Open Session 可诚实返回 unsupported，确认行为仍完成。不由测试者替用户发起 Agent 控制。

验收证据须区分真实 TUI 与合成回归；缺少真实失败/重启等场景则该项未通过，不能以既有用户反馈替代整段。

### M4：日常生命周期、失败提示、停用与选择性卸载 — PARTIAL（独立目标的停用和选择性撤回已验）

复用 P1 的关闭隐藏、Dock/菜单入口、单实例和退出等待；验证重新打开、全隐藏找回、退出释放连接。修复阻碍日用的菜单入口问题，未采用的可选登录自启保持默认关闭，不暗中登记登录项。

验收：宠物在 pi 不在线/配置冲突/连接失败时仍可用，界面给出可理解的连接状态而不是伪造业务错误；扩展断线退避、不阻塞或保活 pi。用户可停用接收并选择性移除仍匹配身份与内容的自有扩展/配置，保留用户修改和未知残留；重启后停用不自动复活。清理或持久化失败如实报告，不谎称完全卸载。直接拖删 `.app` 不承诺自动清理，给出卸载前入口与残留说明。不实现自动 recovery/reset/revoke-all，不用删除未知 owner/lock 修复故障。

### M5：脱离源码目录可运行的本地应用包 — IMPLEMENTED-NOT-ACCEPTED

已取得明确授权并安装 `electron-builder@26.15.3`（根开发依赖及 lockfile）。新增 `apps/desktop/electron-builder.config.mjs` 与 `scripts/package-desktop.mjs`：复用现有 `electron-vite` 输出，固定 `com.agentpet.desktop` / `Agent Pet` 元数据和 macOS `arm64` 目录目标；输出脚本拒绝非空目录，默认创建源码树外的 `/tmp/agent-pet-m5-*` 目录。仅携带 Electron runtime、bundled Main/preload/renderer 和 `starter.glb`，通过 ASAR 排除 `src`、`node_modules`、workspace 与 pi/managed Worker/native 资源；未设置签名凭据或自动签名。

2026-10-08 的失败复制品 `dist/agent-pet-local-n86P5a`、`dist/agent-pet-local-1P3yhK` 和两份历史 `.d3` fixture 目录保持原样，未清理。2026-10-09（本次）在 Apple Silicon `arm64` 上构建独立产物 `/tmp/agent-pet-m5-package-20260301-final/mac-arm64/Agent Pet.app`；`app.asar` 检查确认 Main/preload/renderer HTML、bundled JS 与 `starter.glb` 存在且无源码/workspace/node_modules 路径。直接启动时使用全新 `/tmp` profile/HOME，并解除 `AGENT_PET_PI_ENDPOINT`、`AGENT_PET_PI_TOKEN`、`ELECTRON_RENDERER_URL` 与 `NODE_OPTIONS`；进程保持运行至 10 秒有界 smoke 停止，未访问日常 HOME、pi 配置或真实 acceptance 目录。`codesign --verify --deep --strict` 如实失败（无签名资源/Developer ID），因此不构成 Gatekeeper、签名、公证或分发验收。

验收：产物自带 Electron runtime，可从源码树外启动，无需 Node/pnpm/开发服务器；外部 pi 不被捆绑或自动安装。M5 仍为 **IMPLEMENTED-NOT-ACCEPTED**：尚缺用户从 Finder/移动后的人工视觉验收、真实连接/状态/停用链路复验；不以 bounded process smoke 冒充这些结果。正式签名、公证、跨机器分发和自动更新继续单列后续工作。

M5 packaging checklist（待用户手工完成）：
- [ ] 从 `/tmp/agent-pet-m5-package-20260301-final/mac-arm64/Agent Pet.app` 或复制后的新路径通过 Finder 打开，记录 Gatekeeper/隔离属性结果。
- [ ] 在不使用日常 HOME/pi 配置的明确授权隔离目标中，人工检查管理页、宠物/气泡视觉与退出/重开。
- [ ] 仅在另行授权的隔离 pi 目标上复验部署、连接、状态、确认、停用/撤回；不得把启动 smoke 记录为真实业务连接。

## 历史材料与后续生产化

- [P2 实施记录](DESKTOP-P2-IMPLEMENTATION.md)：B1–B4.4a 的实现与证据，非当前待办顺序。
- [连接](DESKTOP-P2B-LOCAL-CONNECTION.md)、[文件系统/D6](DESKTOP-P2B2-FILESYSTEM-POLICY.md)、[生命周期](DESKTOP-P2B2-LIFECYCLE-DESIGN.md)：现有机制不变量及旧严格准入；延期的验证保持未关闭。
- [安装契约](P0-MANAGED-INSTALLATION.md)、[本机安全研究](P0-LOCAL-SECURITY-DECISION.md)、[发布研究](P0-SECURITY-RELEASE-RESEARCH.md)：按 M1 路线取用已有正确性/所有权要求，不把未来全部生产承诺重新塞进 MVP。

M1 已选定 legacy 并验证临时合成切片；M2 为 PARTIAL（独立测试目标的预览、部署、真实连接、重连、撤回、管理页视觉检查与干净重启持久化均已验；仍不包含独立 `.app`、正式发布或生产安全）；M3 为 PARTIAL（两轮真实任务 working→完成未读→确认、Open Session 不支持提示、同桌面进程内 pi 重启不回放已验；可选错误终态与完整多 Session/异常重连矩阵未验）；M4 为 PARTIAL（独立测试目标停用与选择性撤回、P1–P3 文件保护已验，日常生命周期和失败场景未验）；M5 为 IMPLEMENTED-NOT-ACCEPTED（已生成源码外 arm64 `.app` 并完成资源检查与进程 smoke；Finder/移动/视觉、真实 pi 连接与停用仍待人工验收，未签名限制已记录）。原连接测试目标与 P3 的扩展已选择性移除；P2 中被测试修改的扩展按保护规则保留，pi 生成的配置与登录凭据保留。后续只在对应检查点取得证据后更新状态；技能是复用流程而不是项目进度表，当前优先级留在本文件和 AGENTS，不复制进通用 skill。

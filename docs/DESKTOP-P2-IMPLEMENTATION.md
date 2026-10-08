# P2：pi 一键接入分段实施与历史证据

**当前执行顺序已由 [MVP 执行计划](MVP-EXECUTION-PLAN.md) 替代，下一步是 M1，不是完成 B5/B6/D6 后才允许推进本地 MVP。** 下文保留旧严格生产契约及阶段证据；“本阶段/后续/必须先完成”按记录时点解读，不是当前待办。D6.1 harness 已完成，完整 D6 仍 BLOCKED；延期不表示安全通过，不改变 managed 公开入口的 `acl-unverified` 拒绝或授权/数据保留约束。真实目标操作仍另需精确预览授权。

当前代码已有 P2a、managed 内部 Core/AuthStore、native FilesPort 与 Worker 集成；B4.3 Electron Worker、B4.4a staged-resource 的证据只覆盖各自测试范围，不是最终应用包或生产接入。旧 `a9a3be3` 基线的“原生写入与核心集成尚未实现”已过时；公开工厂与 productionPolicy 仍关闭，Main/扩展只有独立 legacy opt-in bridge。

依据：[产品设计](DESKTOP-PRODUCT-DESIGN.md)、[P0 契约](P0-INTEGRATION-CONTRACT.md)、[本机安全边界](P0-LOCAL-SECURITY-DECISION.md)、[安装与撤销契约](P0-MANAGED-INSTALLATION.md)。初始兼容研究只有 pi 0.85.1 标准发行版，版本范围不得随意放宽；Windows/Codex/Claude 延后。

## P2a：检测与只读预检（已完成）

交付：管理连接页能发起检测、展示候选安装和图形化选择配置目标；只读检查发现规则/权限/同名冲突，解释为什么可进入后续步骤或被阻止。

约束：

- 不执行 pi、shell profile 或未知 wrapper；不启动 Agent，不扫描对话/会话文件，不枚举所有进程。
- 自动扫描仅有限的明确位置或 GUI PATH 候选；有预算、大小/文件类型限制，避免递归全盘扫描。找不到就提供手动选择；不为假装自动检测强行猜终端环境。
- Agent 安装身份与 agentDir 分开。已验证包元数据才确认发行版/版本；可执行文件名或配置目录存在只能作为候选。
- Main 打开选择器并持有选定目标，Renderer 不获得任意路径读接口。仅明确用户选择/发起检查后，读取必要配置字段；结果不回传整个 settings 或秘密。
- 默认目标是候选，不保证活跃终端使用它。只检查用户目标，不递归读取项目配置，不改变 trust/ignore/排除规则。
- root entry/manifest、ignore 与 settings exclusions 区分；不能简单用字符串匹配假装完整复刻 pi 规则。无法可靠解析的规则显示“无法确认/需检查”，不是绿色通过。禁止直接执行可能触发 npm/git 安装的 package-manager resolve 来检测用户环境。
- 非标准/未验证版本明确显示待支持，不把任意版本显示为兼容。
- 未安装扩展时只显示“已检测/预检结果”，不显示已配置、在线或假会话数。真实安装按钮保持未开放，说明下一阶段。
- 用户取消选择器不修改目标；并发检查采用最新请求结果，旧响应不覆盖新目标。

测试：临时目录的包身份/版本、默认与手选目标、路径与大小限制、配置不支持/被禁用/冲突、取消、超时/并发、跨窗口 IPC 拒绝与 UI 状态；不得以 mock 证明原生选择器已验收。测试不读取真实用户配置。

## P2b：本机连接与授权存储（未完成）

已完成部分见[连接核心](DESKTOP-P2B-LOCAL-CONNECTION.md)与[原生文件系统契约](DESKTOP-P2B2-FILESYSTEM-POLICY.md)。早期验证基线为 19 项原生测试、38 文件 / 366 项回归测试，类型检查和桌面构建通过；这组旧结果不是原生写入、Electron addon 加载或跨用户隔离的证据，后续 B4 记录另列。

### 历史顺序与阶段记录

完整生命周期契约见 [P2b.2 生命周期与文件事务设计](DESKTOP-P2B2-LIFECYCLE-DESIGN.md)。当时的顺序是先完成 D1/D2，再恢复 B2.2 草稿；当前内部 native/Worker 集成事实见 MVP 计划，不按这里旧草稿措辞推断未实现。

以下编号是执行拆分，不新增产品能力或放宽既有安全契约。每段开始前核对实际代码、确认文件所有权和测试范围；不再将整个 P2b.2 交给单个实施任务。

| 阶段 | 实施范围 | 验收结果 / 退出条件 |
| --- | --- | --- |
| B1：复用存储边界 | 提取小型内部 FilesPort；现有 PrivateFiles 作为 Node 适配器；AuthStore 与 discovery 改依赖该接口，仍只有一份授权状态机 | 现有调用实际经过接口而不是留下空抽象；原有事务顺序、失败注入、撤销/停止竞争及公开拒绝行为不变；无原生安全升级宣称 |
| B2：原生事务与授权存储 | 实现目录句柄约束的创建、写入、发布、替换、删除和同步；稳定锁初始化与持有；native FilesPort 接入同一 AuthStore | 临时 APFS 上实际完成 prepare/enable/revoke/rotate 与重开；原生 syscall 故障矩阵证明失败关闭和保留不确定状态；不是只测未接入的写入函数 |
| B3：连接核心纵向集成 | 同一 service/client 使用原生存储；先持锁再接触授权状态；停止排空后才释放锁；残余 Node UDS 操作独立为明确的测试边界 | 实际 native FS → AuthStore/core → 测试用真实 UDS → Application；重连不回放、双目标隔离、轮换撤销、失败后保留 owner 并拒绝重开全部通过 |
| B4：异步运行与交付兼容 | 分为 B4.1 Node Worker fixture seam、B4.2 actual Darwin addon Worker、B4.3 Electron Worker、B4.4 packaged/signed delivery；各阶段单独验收，不提前激活生产入口 | GUI 不被原生 I/O 阻塞；Worker 死亡/暂停不会误报成功、提前释放写入权或接受旧结果；开发运行和打包运行分别验证，不以桌面构建代替 native 加载证据 |
| B5：生产目录与端点安全 | 固定生产 namespace 与锁域；跨窗口/实例/渠道一致；补齐 socket 叶节点 ACL/身份检查、发送 token 前验证与关闭语义 | 无测试祖先豁免进入生产；伪造发现记录/端点时实际收到零 token 字节；明确解决或经用户接受已记录的 Node close 替换叶节点删除限制，不靠“目录私有”掩盖问题 |
| B6：安全准入与恢复决策 | 经授权在独立第二用户环境执行读目录/凭证/连接 UDS 的正反例；核对兼容与打包证据；单独落实已确认的恢复策略或明确保持恢复不支持 | 逐项证据审查通过后才安排 P2c；失败、未测与不支持不能显示成通过。真实安装仍另需用户授权 |

B1 实施记录（已完成独立审查与主代理复验）：已增加内部 `FilesPort` / 只读 `FilesReader` 与 `NodeFilesPort`，AuthStore 及实际 service/client 的授权、发现文件读写经过适配器；所有权 receipt 不携带 Stats/数值身份，由适配器私有 WeakMap 关联，伪造、跨适配器及错路径 receipt 在写入前拒绝。保留唯一授权状态机、原有 PrivateFiles 与 Node socket 边界；未实现原生写入或 B2–B6。新增 5 项接口/适配器行为测试；本轮验证 40 文件 / 371 项回归、19 项原生测试、类型检查、桌面构建和 diff 检查通过。原生测试仅重跑既有切片，不代表原生存储接入或安全升级。

B1–B3 保持生产入口关闭，只允许显式临时测试目标。B4–B6 也不得顺带打开安装或真实连接开关；通过准入审查后，再单独安排产品入口接线。B4 与 B5 的设计可以并行，修改共享原生/核心文件时串行实施。

#### B4.1–B4.4 边界

- **B4.1（本阶段）**：仅使用固定内部 Node `worker_threads` entry 与既有 `NodeFilesPort`/fixture backend。Worker 独占 backend roots、owner claim、transactions 与 receipts；Main 保留 Core、AuthStore、UDS 与同步 fail-closed fencing。消息使用有 generation/sequence/requestId 的严格 envelope、有限队列、opaque capability IDs；超时不是取消，不重启/重放/抢租约。此阶段证明 fixture owner-claim ordering，不证明 Darwin writer lease、native syscall fault injection、Electron loading 或 packaging。
- **B4.2（已完成本阶段）**：真实 Darwin addon 在固定 Node Worker 内加载；root/lease/owner/transaction/receipt 全部由 Worker 持有，Core/AuthStore/UDS 保持既有 host 边界。真实 Worker fixture 覆盖读写/release、Core start-stop discovery/owner cleanup、保留 lease 竞争及 clean reopen；受控 adapter/transport fault seam 覆盖启动 ownership-busy 清理与 committed owner unlink 的 poison/fence 传播。未把受控 seam 描述为 native syscall failure；现有 native fault-injection gate 仍为 skipped。
- **B4.3（后续）**：显式 Electron Worker entry，验证嵌入 Node/N-API 兼容及 Main responsiveness；不以 desktop build 代替 Worker/addon load evidence，且保持 managed production activation 关闭。
- **B4.4a（本阶段）**：仅测试用 disposable staged-resource Electron evidence；复制固定 Worker/loader closure 与 Darwin addon，manifest 在 Worker import 前验证 schema、Electron 36.9.5、Darwin arm64、native version=1、N-API=8、SHA-256 与固定相对路径，并验证实际 `process.resourcesPath` 与显式资源根模型及 clean Worker lifecycle。此证据不是 packaged/signed evidence；不加入 runtime download、arbitrary path override、recovery 或 silent fallback。
- **B4.4（仍阻塞）**：固定 ASAR 外 native resource layout、nested addon/app signing 与 packaged Worker load verification；当前无 packager/archive/signing inputs，不能宣称 formal B4.4。

B4.2 实施记录（本阶段）：`worker/service-worker.test.ts` 的 Darwin-only fixture 在 Node Worker 中实际执行 native addon read/write/release/remove、lease contention、Core discovery/owner 清理和 clean reopen；受控 `darwin-files-port.test.ts` 模拟 committed owner unlink 后验证 removed 状态、终端 poison 与不重试。验证结果为 B4.2 focused 38/38、全仓 Vitest 448 passed/1 skipped、native-check 70 passed、`pnpm typecheck` 与 desktop build 通过；尚未宣称真实 syscall failure 注入、Electron Worker、打包/签名加载或生产入口启用。

B4.4a 实施记录（staged-resource evidence）：增加仅测试使用的 disposable Electron staged-resource harness/launcher；固定 manifest 在 Worker import 前校验 schema/version/arch/relative path 与复制后文件 SHA-256（copy-time integrity，不是 checked-in canonical artifact digest），Worker 通过固定内部 seam 接收并实际加载 manifest-selected staged native addon，native handles 仍 Worker-local。launcher 使用显式 PASS/SKIP/FAIL/TIMEOUT、20s bounded deadline、raw child output 和 disposable HOME/profile；此路径不创建 ASAR、不签名、不宣称 packaged evidence。正式 ASAR/packaged/signing B4.4 仍 blocked。

B4.3 实施记录（本阶段）：增加仅开发/测试使用的 Electron 36 harness 与 launcher；它通过本地 workspace Electron 36.9.5 启动真实 Main，清除继承的 `ELECTRON_RUN_AS_NODE`，在 `whenReady` 前隔离 disposable `userData`/`sessionData`，解析并检查固定 loader/entry/native 资源 URL，复用已注册 loader 的 `entry.mjs`，并让 `WorkerHost` 注入匹配的 generation。首先用同一 Electron 36.9.5 可执行文件做最小差分：顶层 `await app.whenReady()` 在 10s 内只到 entry 日志并超时，而非等待的 `app.whenReady().then(...)` 到达 ready 并 exit 0，确认原阻塞是 ESM entry evaluation 的 top-level-await deadlock；因此 harness 不再以 top-level await 延迟 module evaluation，异步导入与 smoke work 均位于带失败处理的 ready callback。Worker zero-code exit 仅在匹配 remove-owner requestId、generation/sequence 的 acknowledgement 与 clean stopped event 均确认后接受；unexpected exit 先同步 poison 再拒绝 pending request。Launcher 结果 seam 与 Worker/entry focused tests 共 22/22 通过。真实 Electron smoke 使用 20s 外层 deadline 明确为 explicit PASS：Electron 36.9.5、arm64；阶段到达 `app-whenReady-complete`、`service-import-complete`、`worker-entry-loaded`、`native-open-complete`、`start-complete`、`stop-complete`；native init/write/read/release/remove/start/stop 完成，bounded cooperative Worker delay 窗口记录 Main heartbeat 40 次（550ms），并清理已确认 clean stopped fixture。这里的 `napi=8` 是 addon 原生接口版本，Electron runtime 自身报告 N-API 10。B4.4 的 ASAR 外 native resource layout、架构/manifest 检查、nested signing 与 packaged Worker load 仍未验证；native syscall fault-injection gate 也仍未关闭。

### B2 内部检查点（避免再次变成过大任务）

这些是顺序开发检查点，不把每个未接入函数包装成完整交付：

1. **锁与写入范围**：固定已有锁 inode；显式首次初始化只接受已验证空目录，独占创建并锁定同一个 fd；普通重开缺锁、残留 owner 或初始化不完整时拒绝。并发初始化、创建与抢锁之间的竞争均有实际测试。绝不删除或重建锁来恢复。
2. **原生事务实现**：单组件路径、句柄类型和资源预算；新文件实际继承 ACL 在写入秘密前验证；首次发布 no-clobber，替换/删除只处理持有所有权证据的对象；未知文件不递归清理。
3. **同步与错误语义**：修改对象和父目录须与锁同一可写 APFS 卷；按顺序 fsync，再通过锁 fd 执行 F_FULLFSYNC。同步失败不降级；区别“未修改”和“修改结果不确定”，不承诺断电认证或同 uid 原子比较并删除。
4. **AuthStore 接入与故障验收**：使用实际 native FilesPort 而非“检查 native 后调用 Node 路径写入”；覆盖 create/write/file-sync/publish/directory-sync/full-sync/cleanup，验证拒绝准入、保留 owner、无秘密泄露。

如单个检查点超过实施容量，先报告具体剩余工作和安全停点，再继续同协议任务；不得未经确认改交付无关加固，或把部分完成标为 B2 完成。接口提取、原生实现和核心接入由不同阶段承担，避免同时改动全部层次。

### 持续保留的约束

- 私有 UDS、每目标凭证，不使用连接证书或 TCP 回退，不承诺恶意同 uid/root 隔离。
- 撤销先立即拒绝/断开，再持久化；既有 stop/queue/revision 修复必须保留。
- 锁释放不代表允许恢复旧 owner；不从残留凭证重建授权，不用 PID 判断后抢占。
- 所有不确定授权事务保留恢复屏障；干净停机最后删除 owner 后同步失败的既有例外需单独测试和描述。
- B3 的 UDS 是真实 socket 但其安全边界仍为测试用途，不是原生 socket 安全验收。
- 普通测试不得悄悄依赖本机构建 addon；原生专项测试缺失 addon 应明确失败，不能静默改用 Node 后端。

### 需要用户另行确认的事项

1. **异常恢复**：是否允许用户明确发起修复后撤销全部旧授权、要求每个目标重新授权？未确认前不实现 recovery/reset/revoke-all；可继续 B1–B5，不自动处理残留状态。
2. **第二用户测试**：提供或授权专用环境和账户。不默认使用 sudo、创建账户或修改系统设置。
3. **真实 pi 安装验收**：P2c 临时目标验证通过后，另行确认具体目标与写入预览；开发批准不等于安装同意。

恢复未获批准不必阻止可独立完成的代码工作，但不得交付自动修复或声称支持异常后的自恢复。

## P2c：受管理安装、修复与断开

旧严格生产路线要求 B6 准入完成后实施；当前本地 MVP 改按 M1/M2 选择并实施最小路线，不默认激活 managed。原安装契约保留：先交付临时目标上的预览→明确授权→原子部署→等待加载→握手在线；处理 no-clobber、并发变更、所有权、备份不被发现、失败后的安全停止与持久撤销。修复/恢复仅实现用户已确认的策略，不把安装失败当成覆盖未知文件或撤销全部授权的许可。临时目标和故障注入通过后，在用户明确同意具体目标时才进行本机实际安装验收。不自动重启/reload pi。

## P2d：真实 pi 端到端验收

普通启动 pi 即连；已有会话待加载提示；工作/终态/确认；重连不回放历史；多个目标/会话；应用重启；断开撤销；旧扩展兼容与残留。区分单独握手在线与真实业务事件通过。Open Session 仍 unsupported，不新增 Agent 控制。

## 交付原则

历史实现段分别留存测试、类型检查、构建、审查与本地提交证据；当前按 AGENTS 配置与改动相称的验证和审查，推送由用户决定，不混入下一段。文档记录实际事实和剩余风险。原生选择器、跨用户 ACL、菜单栏问题、打包登录项和发布签名只能按实际证据关闭；P1 顶部菜单栏缺陷不以 P2 工作掩盖。

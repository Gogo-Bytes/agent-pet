# 本机观察与数据保护边界

本文维护当前约束及休眠 managed 核心的安全不变量，不是历史验收报告或生产启用许可。排期见 [MVP](MVP-EXECUTION-PLAN.md)，进程/IPC 分层见[架构](ARCHITECTURE-DESIGN.md)，具体 Provider 配置见各[模块说明](README.md#agent-接入)。

## 适用范围与权限

- 产品仅被动观察本机已授权配置；Main 可以启动自有观察 helper，不能启动、重载、审批或控制 Agent。连接失败不得阻塞、保活或终止 Agent。
- 真实操作须预先给出目标、读取/写入范围、采集字段、变更预览、生效条件与撤回方式。读取同意、安装确认、原生 hook 信任、模型请求、依赖安装、系统设置和发布是不同权限。
- 安装候选、配置目标、文件已部署、宿主已加载、认证在线、业务事件分别判断。版本/metadata 匹配不是二进制签名认证，socket connect 不是已通过业务验收。
- 只投影白名单元数据，不采集 prompt、响应、工具正文、完整 transcript、argv 或环境枚举。原生身份在需要时留 Main 私有关联层；Renderer 只见配置域内的有界别名和安全快照。
- token、activation、原配置备份及生成的带凭据扩展只存私有材料，不进普通偏好、Renderer、日志、诊断、Git 或公共 bundle。私有明文 at rest 依赖 OS 权限，不等于加密存储。
- 本地方案不承诺对抗恶意同 UID/root；随机 token 用于准入和误用控制，不提供同用户应用沙箱。ack 不证明服务端代码签名身份；TLS/Keychain 也不能凭名称自动补足该边界。

## 文件操作与选择性撤回

- Main 独占目标与一次性计划；Renderer 不能任意指定程序/文件路径。旧扫描、目标变更、取消、窗口关闭/导航/崩溃或新预览使旧授权失效；确认必须重新验证目标证据。
- 私有目录/文件使用 0700/0600、排他创建与有界读取。拒绝 symlink、异常 hardlink、FIFO/设备、错误归属/权限、未知 schema 与超限数据。`O_NOFOLLOW | O_NONBLOCK`、fd `fstat`、前后 metadata 检查是分层保护，不是整条祖先路径抗恶意替换或跨用户 ACL 证明。
- 不覆盖/认领同名未知对象，不递归删除未知目录，不因失败而重建 authority、删除 owner/lock、抢占 socket 或放宽权限。只有身份、内容、所有权仍匹配的自有文件，以及仍匹配且为空的自建目录，才可选择性清理。
- 共享配置只能局部追加/删除精确自有条目，保留无关原字节、值、权限和用户编辑；重复键、歧义引用、已修改条目、pending 或不确定状态失败关闭。备份可能含秘密，不能整份回滚覆盖后来的修改。
- 外部编辑器不参加产品事务；比较后 rename 不是原子 CAS。安装/更新期间避免并发编辑共享配置，失败保留现场，不静默重试。原子 rename 也不等于目录耐久性或断电保证。
- 停用/撤回先同步阻止新消息和迟到回调、关闭本目标接收，再持久保存停用/撤销结果，之后选择性清理。停止、持久化和文件清理各自报告；持久化失败不得丢弃唯一 ownership 证据或宣称完全卸载。
- 删除文件不等于已加载 hook 卸载；运行材料可为旧 hook 快照保留。直接拖删 `.app` 没有可靠清理回调；使用产品移除入口，不以重装自动授权旧残留。pi 的 settings/trust/ignore/禁用意图不得被修改来绕过冲突；Claude/Codex 仅按各自明确预览追加 hooks，不代写原生信任。

## 休眠 managed 核心

公开 [`managed/index.ts`](../packages/adapter-pi/src/managed/index.ts) 的服务/客户端工厂与 production policy 在参数检查、文件或 socket 活动**之前**拒绝 `acl-unverified`。无启用开关、Main 接线或 legacy fallback；内部 native/Worker 实现不代表生产可用。测试 policy 只能用于自有 fixture，既有 guard、竞争、失败关闭与数据保留测试不得删除。

### 准入、身份与协议

- 只用私有 UDS，无 TCP/TLS fallback。`authSetId` 为授权集身份，普通重启保持；`targetId` 为目标身份，epoch 为凭证世代，revision 为并发版本，generation 为服务运行身份。凭证存在不等于 enabled；pending/revoked 不准入。
- 目标 token 为32随机字节的规范小写 hex，定长解码后恒时比较。首帧 auth 与 auth_ok 绑定协议版本、授权集、目标、epoch、generation；ack 前不发 Session，普通 Session 帧无 token。认证+Session 同包抢跑、额外字段、重复认证和旧世代拒绝。
- 客户端每次尝试重新读取经策略接受的 discovery/authority/credential，在发送 token 前验证端点；凭据引用不能成为任意文件路径。端点从受限 runtime root/实例派生，UTF-8 最多100字节，不截断、不删碰撞目录。发现仅在 listener 与权限校验成功后发布。
- managed Session 带授权集/目标命名空间；每连接一个 Session，首次 hello 仅当前 working/idle，严格递增 wire seq，不回放离线结果。Application revision 在模块生命周期内单调，重连/Core 重开不重置；它不是持久因果序号。
- 注册表最多128目标（包含 revoked tombstone），不驱逐撤销证据；队列、连接、认证 deadline、frame/byte/速率/背压均有硬限。常量以 [`auth-store.ts`](../packages/adapter-pi/src/managed/auth-store.ts)、[`frames.ts`](../packages/adapter-pi/src/managed/frames.ts)、[`protocol.ts`](../packages/adapter-pi/src/managed/protocol.ts) 为准，不以业务静默判离线。
- prepare：持久凭证→pending；enable：凭证/上下文复核→持久 enabled→准入；revoke：同步 deny/关闭全部目标 peers/失效排队事件→持久 revoked/epoch→选择性清理；rotate：deny/关闭→pending/新 epoch→新凭证→enabled→准入→清理旧凭证。清理失败不能重新准入。

### Owner、lease 与事务

`ManagedCore` 独占 lease、持久 owner claim、FilesPort、AuthStore、runtime/listener 和最终清理；AuthStore 只拥有 registry/fence/凭证/串行队列，不能独立删除 claim。客户端使用只读 backend，不取得 writer lease。

启动顺序：新鲜验证 root/完整祖先链与卷条件→稳定 `writer.lock` lease→拒绝已有 owner/未知残留→创建并同步 owner/父目录→打开 authority→ready。`acquireWriter` 仅使用已有 lock inode；初始化仅可在明确的新空根排他创建并同步。缺失/损坏 authority 不从凭证重建，PID 消失或 failed-connect 不授权抢 lease/删 owner。

正常停止：立即停准入/关 peers→排空 AuthStore queue 和所有事务→完成 authority/非 claim 资源→用仍有效 OwnerClaim 删除并同步 owner→释放 lease/root/backend。租约释放或进程死亡不等于 durable barrier 可删除。

- mutation/close 不确定、queue saturation/取消/内部错误（即使没有 I/O）、stop 无法排空都同步 poison Core，保留持久 owner 屏障；关闭内存对象不能清屏障。
- **最终正常释放的例外**：授权工作均已 settled 后，owner 已删除但父目录 sync 失败，报告失败、不重建 owner，也不能声称 owner 仍在；是否可重开由真实状态决定。此例外不适用于不确定授权变更。
- 普通 read receipt 是 backend-local、不可伪造/跨 backend、无长期 fd 的证据；所有 caller 必须消费或释放，replace/remove 重新打开验证。事务、OwnerClaim 是独立有 owner 的资源，不能通过通用 close 提前丢弃。
- 写事务只允许合法 Prepared/Writing/Published/Aborted/Uncertain 转移；publish 消费事务，仅确认未发布时 abort 可清理自有临时文件。发布或结果不确定后不自动删除、重试、回滚。
- backend 明确区分 KnownNoOp、MutationUncertain、CloseUncertain。close 不确定不重试可能已复用的 fd，不推测释放额度或锁。

### Darwin 文件/ACL 与 Worker 约束

- 使用 descriptor-rooted `openat` 和保留的完整父链；根必须 canonical absolute（最多4095 UTF-8字节/64段），子名为单段（最多255字节，无斜线/NUL/`.`/`..`）。类型标签、祖先绑定和关闭状态必须验证，不暴露 raw fd。
- 新鲜 dev/ino/link/size/nanosecond time、uid/gid/mode/ACL/mount 证据必须绑定操作。秘密读取先 `prepareRead`→TS policy 同步接受全部 evidence→无 await/callback 的 `readPrepared`→native 重验再读并检查结果；不能先读秘密再接受 policy。raw addon evidence 不等于权限批准。
- 写入使用新鲜 policy/lease/parent/target→排他临时项→检查继承 ACL→完整写/fsync/约定 F_FULLFSYNC→no-clobber 或 receipt-checked publish→父目录同步/flush→最终证据。不得“native 检查后用旧 Node pathname 修改”，Darwin backend 不降级到 Node。Node fixture backend 共享事务语义但不获得原生隔离保证。
- 每 addon environment 最多256 active capabilities、256 owned descriptors（含祖先）、4096 allocated wrappers、128 ACL entries；explicit close 释放活跃容量，finalize 才释放 wrapper。close 不确定保守保留 descriptor charge；lease 的原生强引用持续到显式关闭或环境退出。不是进程级总 fd 限额。
- ACL 缺失必须由成功 `fstatx_np` + `filesec_query_property(FILESEC_ACL)` 证明；ENOENT 或遗漏属性不是“无 ACL”依据。Darwin `acl_get_entry` 成功返回0，结束为 -1/EINVAL；未知 tag/flag/permission 失败关闭。
- 私有对象精确 current uid、0700目录/0600单链接普通文件；拒绝所有 allow ACE（含 inherited/inherit-only），已识别 deny-only 仍受实际操作结果约束。祖先可允许 read/search 或 deny-delete，但拒绝任何写/增删/属性/安全/owner 修改权，不推断 principal 组成员。
- 仅接受本地、尊重 ownership 的 APFS 和代码白名单 mount/ACL bits；私有可写对象拒绝 readonly/snapshot，祖先可按策略接受，各段保留自己的 fsid。未知、ignore-ownership、nonlocal、union 等拒绝。`/private/tmp` sticky 不是 managed 生产祖先豁免。
- 同步原生 I/O 不放 Electron Main；Worker 有界请求、capability ownership、迟到结果 fencing、死亡和 stop/drain 必须保留。Promise 包装和测试 timeout 不能取消任意挂起内核调用。没有同 UID 原子 compare-and-read/ACL-and-mutate 承诺。

实现入口：[`service.ts`](../packages/adapter-pi/src/managed/service.ts)、[`darwin-files-port.ts`](../packages/adapter-pi/src/managed/darwin-files-port.ts)、[`darwin-policy.ts`](../packages/adapter-pi/src/managed/darwin-policy.ts)、[`native addon`](../packages/adapter-pi/native/managed-darwin/managed-darwin.c)、[`worker`](../packages/adapter-pi/src/managed/worker)。ACL 公共 API 依据固定 Apple Libc [`acl_file.c`](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/posix1e/acl_file.c)、[`filesec.c`](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/gen/filesec.c)、[`statx_np.c`](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/sys/statx_np.c)；公开源码不是所有安装二进制/文件系统的认证。

## D6 与生产发布：延期，未通过

完整 D6 **BLOCKED**，不阻塞单用户本机 MVP，也不授予生产安全声明。生产启用仍需稳定 authority/lock/runtime namespace、跨 release-channel 所有权、socket-leaf ACL/peer 身份、原生故障/竞争与耐久性、支持 Node/Electron/OS/架构、最终资源交付和签名等证据；自动恢复/reset/revoke-all 及其撤销后果需另行批准。

- **零凭据字节的界限**：非法 discovery、拒绝的 path/ACL/identity 应在发送前阻断；格式正确但已退休 generation 在已接受端点上要求认证拒绝、零 Session admission/observation，不能声称零 token 字节。独立发送前 freshness authority 尚无保证。
- Node `Server.close()` 可能 unlink 同路径被替换的 socket leaf。检测不匹配必须停准入、关 peers、关闭 listener、报告 path-changed 并保留 owner/discovery；不能声称 foreign leaf 保留已解决，也不能为避免 unlink 留无界 live listener。生产须解决或在已验证私有目录条件下明确评审接受此限制。
- 跨用户验证须单独授权既有第二普通账户，在隔离 fixture 检查目录、合成凭据/discovery 和真实 UDS，并有获准 allow-ACL 正控制及恢复后的拒绝对照。当前账户 chmod/ACL/mock 不代替第二用户，也不承诺同 UID 隔离。
- 原生 create/write/sync/publish/close 故障、句柄释放与崩溃矩阵仍需真实证据；TS 故障替身、process kill、正常重启不等于断电或完整快照防回滚。
- D6 harness 只用新自有 fixture，固定别名/枚举/计数输出，禁止原始错误、账户身份、生产路径、token/token hash；源码摘要不是凭据摘要。缺 prerequisite 记 NOT-RUN/BLOCKED。runner exit1 是失败/不完整，exit2 是仍有阻塞，永不以 exit0 表示生产准入。
- D6 lease-death fixture **故意保留 owner barrier**；包括全量测试在内的每次 harness 调用都可能留下该新目录。清理先等 native handles/child/socket settle，再检查精确身份和完整有界 allowlist；未知/失败/不确定一律保留。不得删除历史 fixture、扫描清理遗留目录、修改现有祖先 ACL 或自动重试恢复。
- 本地 `.app` 不等于正式分发。签名/公证需要获准的 Developer ID、适当 Hardened Runtime/entitlements、timestamp、notarization/staple 和最终下载包的 Gatekeeper/升级/卸载验证；不要求用户关闭系统保护。ASAR 不是加密，不让外部 Node 假设可以直接读取 ASAR，不在运行时修改签名 bundle。

D6 可检索入口：[`harness.ts`](../packages/adapter-pi/src/managed/d6/harness.ts)、[`evidence.ts`](../packages/adapter-pi/src/managed/d6/evidence.ts)；开发命令见[adapter README](../packages/adapter-pi/README.md)。签名规范见 [Electron](https://www.electronjs.org/docs/latest/tutorial/code-signing) 与 [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。

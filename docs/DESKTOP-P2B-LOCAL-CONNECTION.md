# P2b.1：休眠的本机连接机制核心

状态：**机制核心、合成测试和最终独立代码审查完成；真实激活仍被阻止。不是 P2b 安全完成，也不是安装许可。**

本阶段仅交付 `packages/adapter-pi/src/managed/` 的 Node 服务、授权存储、发现、认证和单次客户端连接边界。公开 `@agent-pet/adapter-pi/managed` 的服务/客户端入口始终返回 `acl-unverified`，在读取参数、任何文件系统访问、凭证访问或 socket 活动之前拒绝。没有默认 home 路径解析、Main 自动启动、IPC、UI 安装控制、pi 扩展部署或真实配置访问。已有环境变量开发桥接保持独立，绝不是受管理连接失败后的回退。

**P2b.2 的已验证 ACL/本地挂载/恢复后端及原生证据，是进入 P2c 的强制前置条件，不是发布脚注。** 此处不提供开启开关。内部文件可被同 uid 代码深层导入，并不构成同 uid 沙箱。

后续 [P2b.2a 原生文件系统切片](DESKTOP-P2B2-FILESYSTEM-POLICY.md) 新增独立的 macOS ACL/挂载检查、descriptor-rooted 读取和现有 inode writer lease 原语；**尚未接入本页机制，不包含恢复，不代表 P2b.2 完成**。本页 P2b.1 行为、生产阻断及最终耐久性边界不变。

## 1. 已冻结的机制边界

- 仅私有 Unix domain socket；无 TCP、TLS、证书、helper 或 Agent 控制。
- `authSetId` 是随机授权集身份，普通重启保持；`targetId` 是随机配置目标身份；epoch 是目标凭证世代；revision 是注册表并发版本；generation 是每次服务运行的新随机身份。没有隐式 reset、恢复或重新登记。
- 受管理 Session ID 为 `managed:<authSetId>:<targetId>:<legacy-session-id>`，防两个目标提交相同 process/session 标识时互相覆盖。保留原始有界 provider/process 元数据；开发桥接 Session ID/API/生命周期语义不变。
- 一个受管理连接只绑定一个 Session；首次 hello 只允许当前 `working` 或 `idle`。未来扩展变更 Session 身份必须重新连接，不重放离线 completed/error 历史。
- token 为独立的 32 随机字节、规范小写 hex；固定长度解码后 `timingSafeEqual` 比较。普通 Session 帧不携带 token。公开快照去掉 token/digest，不返回原始错误、路径或帧；没有秘密日志。
- ack 是应用层接受，不是密码学服务端认证。客户端发送第一字节 token **之前**必须验证端点路径；握手成功后才返回可发送 Session 的句柄。

本说明采用详细 [安装与撤销契约](P0-MANAGED-INSTALLATION.md) 的顺序：**同步内存拒绝 → 关闭目标连接 → 持久 revoked/epoch → 选择性清理**。早期安全/接入概要中“先持久化再断开”的简写与之冲突；本阶段不采用那一顺序，也没有顺带重写历史文档。

## 2. 模块及可调用边界

| 文件 | 责任 |
| --- | --- |
| `index.ts` | 永久阻断本阶段的公开生产入口；没有 policy 参数 |
| `path-policy.ts` | 根/uid/身份/操作绑定的策略契约；生产 policy 明确不可用 |
| `private-files.ts` | 强制 owner/mode/type/link/祖先检查、有界 fd 读取、独占持久发布、身份匹配清理 |
| `auth-store.ts` | 显式初始化、prepare/enable/revoke/rotate、串行修改与脱敏快照 |
| `discovery.ts` | 严格非秘密发现记录与受限派生端点 |
| `protocol.ts` / `frames.ts` | 认证协议、token-free 事件校验、有界 NDJSON、速率/背压 |
| `service.ts` | 内部策略注入边界、显式 start/幂等 stop、每目标连接集合 |
| `client.ts` | 内部单次连接；每次调用重读注册表、发现与凭证，无离线队列 |
| `test-policy.ts` | 仅测试替代不可用 ACL/挂载判断，钉住指定临时根身份；不导出到公开包入口 |

内部 `openManagedCore` 接受显式合成 roots、policy 和 publish；先持久取得独占 owner claim，再打开存储。`prepareTarget()` 创建 pending；`enableTarget(targetId, epoch, revision)` 是可信调用方的显式边界，不表示已安装扩展或持久用户同意。P2c 才负责真正的同意/部署证据。修改要求当前 epoch/revision，旧完成动作不能覆盖撤销；排队修改最多 128 个。

`store.snapshot()` 表示最后已提交的授权状态及全局 blocked 标记，不是安装状态或连接状态；撤销入口之后、磁盘提交之前，旧 enabled 快照不代表可准入。`connectionsSnapshot()` 单独返回每目标当前授权连接数；一个 socket 断开不把整个 pi provider 标离线。

客户端本阶段仅实现一次尝试；测试重试器验证最多三次、250 ms 起的抖动退避（上限 5 s）、unref 定时器及每次重读。**这不是生产扩展重连已完成**。无 UI/renderer 可调用的策略绕过。

## 3. 私有布局、文件与事务

位置仅由临时 fixture 显式指定，生产 namespace/home/runtime 推导尚未冻结：

```text
storageRoot/                    # current uid, 0700
  owner/                        # 独占 mkdir + 目录/父目录 fsync 的写者 claim
  authorization.json            # schema/authSetId/revision/targets；0600
  targets/<targetId>.<epoch>.json # schema/authSetId/targetId/epoch/token；0600
  discovery.json                # schema/protocolVersion/authSetId/generation/instance/credentialLayout；0600
runtimeRoot/<128-bit instance>/s # 私有 0700 实例目录，0600 UDS
```

发现记录不携带 token、配置路径或 Session 信息。端点仅从经校验的 runtimeRoot 和 32 字符 hex instance 派生，UTF-8 路径最多 100 字节；不截断、不移到共享端点。随机目录碰撞最多重试四次；不删除碰撞目录/socket。发现仅在 bind、socket 类型/权限和策略再校验后发布。

路径必须绝对、规范、无 NUL/遍历/未知 symlink；所有祖先接受 owner/mode 及策略检查。普通祖先 root/current uid 且不可 group/world 写；产品目录必须 current uid/0700。公共 sticky 祖先没有通用豁免，只能由策略单独确认。文件必须 current uid/0600、普通文件、单链接、大小有界。读取使用 `O_NOFOLLOW | O_NONBLOCK`，对 fd 与 leaf 的身份、size、mtime、ctime 再检查；FIFO/symlink 替换不进入无界阻塞读取。

发布顺序：同目录独占临时文件 → 写 → 文件 fsync → 发布 → 父目录 fsync。首次发布采用 hard-link no-clobber 并移除临时链接；替换只针对身份/修改时间仍匹配的已拥有文件再 rename。rename 本身不是耐久性证明。失败保留有界恢复证据，不自动删临时项或扫描备份恢复 enabled。

| 操作 | 顺序与失败行为 |
| --- | --- |
| prepare | 持久独立凭证 → 持久 pending；凭证单独存在不准入 |
| enable | 校验凭证摘要/上下文 → 持久 enabled → 内存准入 |
| revoke | 同步 deny/关闭全部本目标 peers、使排队事件失效 → 持久 revoked/epoch+1 → 验证旧凭证摘要及身份后清理 |
| rotate | 同步 deny/关闭 → 持久 pending/epoch+1 → 持久新凭证 → 持久 enabled → 准入新世代 → 清理旧凭证 |
| stop | 立即停准入/销毁 peers；等待已在途存储工作；关闭 listener；仅正常确定状态清理自有发现/空实例目录/claim |
| uncertain | poison 整个存储、关闭所有 peers；stop 返回错误且保留预先持久的 claim；新实例返回 ownership-busy |

失败不会报告撤销成功。rename 后目录同步失败是 `outcome-uncertain`，不是“已持久撤销”。撤销/轮换的 cleanup 失败也不重新允许目标；授权变更不确定期间即使上一次 enabled 仍是磁盘最后状态，claim 也阻止另一个实例恢复准入。例外是已经没有未决授权变更的最终正常退出：删除 owner 后的父目录 fsync 若失败，stop 报错，但已删除的 claim 无法保证仍存在，新实例可能可打开此前已持久的 authority。这不是撤销失败可绕过恢复屏障；专门测试先完成持久撤销，再注入最终 claim-release 同步失败，重新打开仍为 revoked。旧 owner claim 不根据 PID 或 failed-connect 被偷取。缺失/损坏 authority 不从 credentials 重建。崩溃、未知残留或用户修改可能要求未来显式修复；此阶段**没有**修复/重置 API。

注册表最多 128 个目标，**包括 revoked tombstones**；耗尽时拒绝新增，不驱逐撤销证据。不持久 Session 历史/unread。保守失败处理可能关闭整个受管理实例；不影响独立开发桥接。

## 4. 协议与资源上限

首帧严格为 `auth { protocolVersion:2, authSetId, targetId, epoch, generation, token }`；响应严格为同上下文 `auth_ok`，无 token。服务拒绝认证前 Session、附加字段、重复认证、错误世代/版本/凭证、pending/revoked 和认证+Session 同包抢跑。协议拒绝采用直接关闭连接，不暴露“未知目标/坏 token/已撤销”细分信息。

ack 之后的 Session payload 复用既有 schemaVersion 1 字段白名单，但**删除 token 字段**。首次 baseline 后禁止再发 hello，要求相同身份、严格递增 seq，并在每次观察发布前再次检查当前授权/epoch。publish 回调异常隔离于该连接。空闲有效 baseline 不会因无业务事件而失联。

wire seq 是连接内的重放检查，重连可从 1 开始；传给 Application 的 managed Observation.revision 则由模块实例生命周期内共享的单调计数器在授权复核后的实际发布处生成，跨连接及同模块内 core 重新打开不重置，溢出拒绝发布。它表示本进程接收顺序，不是持久世代或发送方因果顺序，不更改 sessionId/workId 或旧开发协议 revision。Application-backed 实际 UDS 测试覆盖 working→重连 idle、同 Application 的 core 重开、确认终态后重连不重放未读，以及新 workId 的工作/终态正常生成气泡。

下表是机制最大值，不是吞吐保证；内部测试覆盖只能降低的配置：

| 资源 | 上限 |
| --- | --- |
| socket 总数 / 未认证 / 每目标 | 64 / 16 / 8 |
| 每连接 Session / 总并发 Session | 1 / 64 |
| 绝对认证 / 首次 baseline deadline | 3 s / 3 s；trickle 不续期 |
| auth / 普通帧 | 2 KiB / 64 KiB |
| 保留输入每 socket / 全局 | 128 KiB / 8 MiB（输入计数，不是总 heap 承诺） |
| socket 待写队列 | 64 KiB |
| 新连接速率 / burst | 32/s / 64，全局 |
| 帧速率 / burst | 每连接 32/s / 64；全局 1024/s / 2048 |
| 字节速率 / burst | 每连接 256 KiB/s / 512 KiB；全局 8 MiB/s / 16 MiB |
| 每次解析批次 | 最多 16 帧，随后 setImmediate 让出 |
| discovery / credential / registry | 4 KiB / 2 KiB / 256 KiB |
| shutdown | 立即 destroy，不等待慢 peer 的优雅 flush；stop 幂等 |

连接与定时器 unref；没有无限诊断或离线队列。未知挂载不能靠 timeout 包装成安全：Node 无法取消任意挂起的内核文件 IO，stop 对在途存储的等待也不提供这种保证。

## 5. 实际证据及严格限度

测试使用真实短临时目录和真实 Node UDS；替代的只有不可用的 ACL/挂载证据。当前验证环境为 **Node v22.22.3、darwin arm64**。没有 pi、真实用户配置、原生 App 启动或跨用户操作。

- `service.test.ts`：双目标身份隔离、认证/version/generation/epoch/auth-set、pending、baseline 前零观察、立即撤销与已 coalesce 帧、B 持续可用、轮换、幂等 stop、异常隔离。
- `auth-store.test.ts`：写/文件 fsync/发布/目录 fsync 故障，enable/revoke/rotate/prepare 顺序，故障后 stop + 新实例拒绝，孤立凭证不复活、旧完成与撤销竞态、队列耗尽、tombstone 上限、凭证修改保留。
- `crash.test.ts`：实际杀死隔离测试 worker，在 revoked rename 可见而目录 fsync 尚未执行的点退出；claim 保留且新实例拒绝。不是掉电模拟，也没有自动 crash recovery 成功的声明。
- `private-files.test.ts`：真实 symlink/hardlink/FIFO/宽权限/oversize、fd 替换、根身份、Unicode 字节限制、独占碰撞、修改后的发现/凭证保留、未知实例子项不递归删除。owner mismatch 是 stat 形状的 guard 测试，**不是原生跨用户证明**。
- `frames.test.ts`：真实慢 peer、绝对 deadline、socket/frame/byte/保留输入/全局/背压上限、UTF-8 分片、coalesced frame、空闲连接。
- `client.test.ts`：非法发现/端点的合成 decoy 收到零 token 字节，错误 ack 前无 Session 元数据，每次尝试重读与当前 baseline。
- `legacy-regression.test.ts` 及既有套件：原有桥接 ID/API/事件、扩展生命周期/重连、Main 不激活 managed。

### 已复现的 Node socket-close 限制（未修复）

在 Node v22.22.3 的真实合成 UDS 中，绑定后先 unlink socket，再在同路径创建合成普通文件，`net.Server.close()` **仍会自行 unlink 该替代 leaf**。这不是应用显式 owned-cleanup 的行为，Node 公共 API 没有原子的 compare-and-unlink 接口。

服务检测到 dev/ino/mode 身份不符时停止准入、关闭 peers，正常关闭 listener，不保留无界 live listener；stop 返回 `path-changed`，保留 owner/discovery，后续启动拒绝。**不宣称 foreign socket-leaf preservation 已实现。** 对其它文件的显式清理仍必须精确身份/修改时间匹配，不递归删实例目录，不触碰未知兄弟项，不删碰撞 socket。

在真正受保护的私有目录中替换该 leaf 需要 same-uid/root 或另一个已破坏可信边界的组件；这些不在强隔离承诺内。本阶段未使用 Node 私有句柄、移动未知文件或 helper。P2b.2 必须在已验证 ACL/私有目录条件下解决，或明确评审接受这个特定 runtime 限制后才能激活。

## 6. P2b.2 → P2c 必须先完成

1. 选择并验证 macOS ACL（含继承/祖先/effective access）和本地 filesystem/mount 后端；Main 与外部 Node 客户端均需兼容。未知/缺失/过期证据始终 unsupported。
2. 专用授权环境的原生跨用户访问测试：目录、凭证、发现及实际 socket，不以 chmod、mock/fault 标签代替。
3. 冻结生产 namespace、根推导、跨 release-channel 独占所有权和显式 stale-claim 修复/恢复流程；评审上述 Node close 限制与 Node/Electron 差异。
4. 核实支持文件系统的 publication/fsync/掉电边界；成功的合成重启不等于任意掉电保证或旧快照防回滚。同 uid/root 完整还原旧快照不在本模型保证内。
5. 然后才能实施 P2c 同意/安装/修复的临时目标事务；真实安装仍须用户另行明确许可。P2d 普通 pi 启动、原生生命周期及发布签名等尚未验收。

最终审查过程中主会话复现并修复了两项缺陷：① revoke/rotate 排队后立即 stop（含排在 prepare 后）会在 poison 捕获外失败；四例新增回归修复前全部失败，将 available 检查纳入 poison 捕获后通过，未落盘拒绝保留 claim 并阻止重新打开；② 重连 seq 重置导致 Application 丢弃 idle baseline、停留 working；真实 UDS→Application 回归修复前失败，采用上述 managed 接收 revision 后通过。另新增最终干净 claim-release 同步失败的契约边界测试。

主会话最终独立验证：`pnpm test` **37 文件 / 335 项通过**（managed **109** 项），`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、`git diff --check` 均通过。旧 Three.js 重复导入警告仍存在。扩展回归初轮曾因气泡状态预期误写为 completed、旧测试假设 revision 从 1 开始及测试 helper 返回类型过宽失败，修正测试契约和类型后复跑通过，未放宽安全断言。

最终只读审查检查了完整实现及主会话修复后的实际文件，确认上述缺陷已关闭，无剩余需修复项；结论只适用于未启用的 P2b.1。审查者未执行测试，执行结果属于主会话。早期开发报告的 329 项与 `/tmp/agent-pet-p2b-review.patch` 校验值对应修复前快照，不是最终提交。子任务首次 30 分钟超时后沿原子任务协议恢复，没有切换执行模式。

本阶段无新增依赖、Main/UI/扩展接入或真实用户配置操作。验证后创建本地独立阶段提交，不推送。

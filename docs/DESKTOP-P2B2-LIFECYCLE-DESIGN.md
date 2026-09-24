# P2b.2 生命周期与文件事务设计

状态：**已确认设计，尚未完成实现**。本文件是 P2b.2/B3/B4 的生命周期契约；不表示生产激活、真实 pi 配置访问或恢复功能已实现。

## 1. 目标与边界

目标是让托管授权存储在正常运行、停止、崩溃、写入结果不确定和重启时都保持失败关闭，并且不会因读取/轮换次数增加而泄漏原生文件描述符。

本设计不承诺：

- 恶意同 UID 程序或 root 的对抗隔离；
- 突然断电后的通用防回滚保证；
- 自动修复、自动重置、自动撤销全部旧授权或从残留凭证重建授权；
- TCP/TLS fallback、后台 daemon 或 Agent 控制；
- 在 Electron Main 中直接执行可能阻塞的同步原生 I/O。

当前生产入口继续拒绝 `acl-unverified`。B2.2 只使用显式、临时、仓库本地测试 fixture；B3/B4/P2c 另有准入门槛。

## 2. 所有权模型

`ManagedCore` 是一个托管实例的唯一 owner，持有：

- `writer.lock` 的稳定内核 lease；
- 持久化 `owner` claim；
- 一个 FilesPort；
- 一个 AuthStore；
- runtime/discovery 资源和 UDS listener（B3）；
- 最终停止、claim 清理和资源释放顺序。

`AuthStore` 只拥有授权 registry、目标 fence、凭证引用和串行 mutation queue。它不独立删除 owner claim；不可继续的错误必须同步通知 ManagedCore。

客户端不是 owner：只使用 `NativeFilesReader`（B3），不取得 writer lease，不删除或修改授权文件。

## 3. 启动与停止状态机

### 启动

```text
Closed
  -> RootValidated
  -> WriterLeased
  -> ExistingOwnerChecked
  -> OwnerClaimed
  -> AuthorityOpened
  -> Ready
```

顺序不可交换：

1. 打开并新鲜验证 storage root、完整祖先链和同卷条件；
2. 取得稳定 `writer.lock` lease；
3. 检查 owner claim；已有 owner、未知残留或不确定状态均拒绝，不抢占、不删除；
4. 在 owner capability 仍然有效时创建并持久化本次 owner claim；
5. 同步 claim 和父目录；
6. 之后才打开 AuthStore/authority。

缺少 lock、lock 不安全、已有 owner、权限/ACL/挂载未知、初始化不完整，都不是恢复请求。

### 正常停止

```text
Ready
  -> AdmissionStopped
  -> PeersClosed
  -> QueueDrained
  -> TransactionsDrained
  -> AuthoritySettled
  -> OwnerRemovedAndSynced
  -> LeaseReleased
  -> Closed
```

1. 立即停止新连接和新 mutation；
2. 立即拒绝/关闭旧 peer；
3. 等待 AuthStore queue；
4. 等待所有写事务显式结束；
5. 仅清理有明确 ownership 且确认未发布的临时文件；
6. 确认授权工作已 settled；
7. 使用仍然有效的 `OwnerClaim` capability 删除 owner 并同步父目录；
8. 之后才释放 lease、关闭 root 和 backend。

Owner 删除后父目录同步失败是既有的 clean-final-release exception：报告失败，不重建 owner，不声称 owner 仍存在；后续是否可重新打开由实际目录状态决定。任何其他不确定授权或 owner 变化都保留屏障。

## 4. Poison 与 durable barrier

`poisoned`/`uncertain` 不是崩溃恢复许可，而是拒绝继续的状态。

以下情况必须传播到 ManagedCore 并留下持久 owner barrier：

- 文件 mutation 结果不确定；
- transaction/lease/root close 不确定；
- AuthStore queue saturation、取消或内部错误，即使没有发生文件 I/O；
- stop 无法排空 queue/transaction；
- owner 删除或同步结果不确定。

关闭内存对象不能清除 barrier。只有所有授权工作 settled、所有非 claim 资源释放、owner 由其仍有效的 capability 成功删除并完成父目录同步，才可以释放 lease 并结束正常生命周期。

本设计不定义自动 repair/reset/revoke-all。残留 owner、未知 debris、缺失 lock 或 incomplete bootstrap 必须由未来明确授权的恢复流程处理。

## 5. Receipt 与事务资源

### 普通 read receipt

普通读取返回 backend-local、不可伪造、不可跨 backend 使用的 descriptor-free receipt，包含受保护的路径/身份/时间/父链证明，但不长期持有 fd。

需要 replace/remove 时，backend 重新打开并新鲜核对 receipt；释放/消费后的 receipt 不得再次授权操作。所有 read caller 都必须明确“消费 receipt”或使用内部 helper 在返回 parsed value 前完成释放。

### 写入 transaction

临时写入不使用普通 receipt，而是显式 transaction：

```text
Prepared -> Writing -> Published
Prepared -> Aborted
Writing -> MutationUncertain
any live state -> CloseUncertain
```

- `write` 只允许 Writing；
- `publishNew`/`publishReplace` 消费 transaction；
- 确认尚未发布时，`abort` 可删除自己创建的临时文件并同步父目录；
- 发布后或结果不确定时禁止自动删除/重试/回滚；
- 任意 close 不确定都 poison owner lifecycle；
- transaction fd 和临时 inode 必须有单一 owner，不能由 AuthStore 丢弃。

`FilesPort.close()` 不能在 owner claim 尚未处理前粗暴关闭所有 capability；OwnerClaim 是显式、独立、最后处理的资源。

## 6. 读取协议与策略边界

在 credential、authority、discovery 或未来 client read 中，不能先把秘密字节读出再接受策略。

采用两步协议：

1. `prepareRead` 新鲜取得完整 root/ancestor/private-parent/leaf evidence，并生成一次性 read guard；
2. TS 策略同步接受全部 evidence；
3. 无 await/callback 地调用 `readPrepared`；native 重新核对 guard、身份、大小和 binding 后读取；
4. 返回前再次检查结果，超过上限、身份或时间变化都失败关闭。

原生 guard 减少路径替换和句柄错配风险，但不提供恶意同 UID 的 compare-and-read 原子性承诺。raw addon evidence API 不等于策略接受；生产 adapter 必须完成 TS policy gate。

## 7. 写入与错误分类

所有控制面写入都必须是 descriptor-rooted，不得出现“native check 后调用旧 Node pathname mutation”。

顺序：

1. 新鲜完整策略和 lease/parent/target 检查；
2. 创建受约束临时文件/目录；
3. 检查实际继承 ACL；
4. 完整写入并 `fsync` 文件；
5. 按设备 flush 约定执行 `F_FULLFSYNC`；
6. no-clobber 发布或带 receipt 的 checked replacement；
7. `fsync` 父目录和设备 flush；
8. 新鲜最终 evidence 后才报告成功。

错误分类必须由 backend 固定，不由调用者猜测：

- **KnownNoOp**：系统调用前已确定未发生变更，例如参数错误、已知冲突、明确不存在的 cleanup 目标；按契约处理，不污染 owner；
- **MutationUncertain**：调用可能已经改变 namespace/data，或后续 sync/最终检查失败；transaction/相关 receipts 转 uncertain，保留 owner barrier；
- **CloseUncertain**：无法确认 fd/lease/transaction 已关闭；不重试 fd，不释放安全额度，不清理未知对象，保留 owner barrier。

Previous receipt、transaction receipt、published receipt 的状态转换必须逐项定义，不能只返回一个字符串错误。

## 8. FilesPort 与 backend 兼容

B1 的 FilesPort 保持单一 AuthStore 实现，但需要补齐内部生命周期契约：

- read/parsed-value helper 的 receipt 消费规则；
- transaction `abort/close`；
- OwnerClaim 的 acquire/remove/sync/close 顺序；
- backend close 与 owner claim 的先后关系；
- fixed error/effect mapping 和 poison 通知。

`NodeFilesPort` 必须实现同一语义，保留既有测试和失败矩阵；它不因此获得原生安全声明。`DarwinFilesPort` 只能使用 policy-gated native adapter，不得 fallback 到 Node pathname 操作。

## 9. B3/B4 及客户端

B3 才把同一 FilesPort/owner/core 接入 synthetic real UDS 和 Application。服务端先持 lock/owner 再接触 authority；客户端使用 NativeFilesReader 读取 discovery/authority/credential，不持 writer lock。Node UDS 仍是明确的 residual socket boundary，不宣称原生 socket ACL 安全。

B4 将同步 native I/O 移出 Electron Main，通过 Worker 定义：请求上限、资源 ownership、迟到结果 fencing、worker death、stop/drain 和 addon 加载兼容。Promise wrapper 不算异步。

## 10. 必须覆盖的测试矩阵

### 资源与生命周期

- 重复 read/prepare/rotate/reopen 不增长永久 fd；
- receipt consume/release/foreign/stale/double-use；
- transaction abort、publish、close failure、root close、lease close；
- owner claim 仍活跃时 backend close 被拒绝或延迟；
- 正常 stop 顺序和 stop 中 revoke/rotate/prepare 竞争。

### 策略与文件

- 完整祖先、storage root、targets、parent、leaf、lease ACL/mode/mount 变化；
- symlink、hardlink、FIFO、wrong owner/mode、unknown children、cross-volume；
- 读取前策略接受和 guard 绑定；
- no-clobber、checked replacement/removal、临时文件 cleanup。

### 错误与重启

- 已知冲突/不存在 cleanup；
- native create/write/fsync/publish/parent-sync/full-sync fault stages；
- mutation/close uncertain 后 owner barrier 保留；
- AuthStore 无 I/O poison、queue saturation、取消和 stop；
- 杀进程后 lock 释放但 owner 保留，fresh open 拒绝；
- clean final owner removal sync exception。

### 纵向与准入

- native storage → AuthStore → synthetic UDS → Application；
- reconnect/no replay、target isolation、revoke/rotate fencing；
- 第二用户正反例；
- Node/Electron addon 加载、Worker、打包和签名。

当前 native fixture 通过的成功路径不能替代 fault injection、跨用户、Electron/Worker 或生产证据。

## 11. 实施顺序

1. **D1：receipt/read/transaction 内部契约**，先修资源与读取顺序；
2. **D2：Core owner lifecycle**，统一 owner claim、AuthStore poison、stop/drain/reopen；
3. **D3：DarwinFilesPort 接入**，以 D1/D2 契约为前提接入实际 native backend；
4. **D4：B3 synthetic UDS/Application 纵向验证**；
5. **D5：B4 Worker/Main 与 Node/Electron/package 兼容**；
6. **D6：跨用户、socket、namespace、恢复决策与 P2c 准入**。

在 D1/D2 完成并通过独立审查前，不继续修改当前两份 B2.2 草稿，也不把它们标记为可交付实现。

## 12. 仍需用户单独确认的事项

- 是否允许未来显式修复操作撤销全部旧授权并要求重新授权（当前仍未批准）；
- 是否提供专用第二普通用户环境进行跨用户验证；
- 何时授权对具体真实 pi 目标执行安装验收。

# P0 隔离实验：传输兼容与文件基础检查

状态：有界实验完成，**不是产品实现、完整安全验收或 P0 全部门槛通过**。接续 [候选契约](P0-INTEGRATION-CONTRACT.md)。

## 范围与隔离

用户同意继续隔离验证。本轮使用 `/tmp/ap-p0.9P7j2j` 下的抛弃式脚本、临时 socket、内存随机合成凭证与一天有效的实验自签证书。没有启动 pi、没有连接现有桌宠、没有访问用户配置/Keychain/会话、没有新增依赖或修改产品源码。Electron 使用 `ELECTRON_RUN_AS_NODE=1` 独立子进程，不是 GUI 主进程实测。Node 客户端模拟未来 pi 扩展传输，不代表实际扩展已接入。

两个方向均测：系统 Node 客户端 → Electron 内嵌 Node 服务端，以及反向。正式产品只需要前者，反向用于揭示运行时差异。子进程环境剔除 `AGENT_PET_*`；合成秘密经 IPC 传递，不进入命令行/报告。证书和私钥实验后已删除，秘密不落盘；只保留无秘密的 JSON 结果和临时脚本。临时脚本不是产品协议，不复用其逐次 data 事件当完整消息的简化写法。

运行时：

- 系统 Node **22.22.3** / OpenSSL **3.5.6**。
- Electron **36.9.5** 内嵌 Node **22.19.0**，`process.versions.openssl` 报 **0.0.0**，不能按系统 Node OpenSSL 版本推断其功能。
- 证书由本机 OpenSSL CLI **3.6.2** 生成，仅实验工具；不意味着产品可要求用户安装 openssl。

## 1. TLS-PSK 候选失败

在 Electron 服务端设置 `PSK-AES128-GCM-SHA256`、TLS 1.2 时，`tls.createServer` 在 secure context 初始化失败：

```text
ERR_SSL_NO_CIPHER_MATCH
error:100000b1:SSL routines:OPENSSL_internal:NO_CIPHER_MATCH
```

服务端未启动，客户端没有握手。实验父进程随后报 `IPC timeout: ready`，这是子进程初始化失败的后果，不是 socket 网络超时。没有进入原有 Agent 环境。

随后检查 `tls.getCiphers()`，Electron 的 PSK 项为 `[]`，见 [electron-crypto.json](evidence/p0/electron-crypto.json)。

**结论：当前锁定 Electron 运行时不能采用此次候选 TLS-PSK 套件；排除它作为首版默认方案。不为了绕过此问题升级 Electron 或降低认证。** 不推广为未来所有 Electron 版本永远不能使用任何 PSK。

## 2. 证书 TLS + 加密通道内目标凭证：通过有界互通

- 使用独立合成自签证书，客户端通过实验中预先分发的 CA 文件信任，不从服务端现取现信。
- 固定 servername `agent-pet.test`，保留 `rejectUnauthorized: true` 与默认证书身份校验。
- 只有 secureConnect 后才发送合成 target ID/token，服务端验证后发送实验 ack。
- 分别强制 TLS 1.2 和 TLS 1.3，两个方向均成功。TLS 1.2 协商 `ECDHE-RSA-AES128-GCM-SHA256`，TLS 1.3 结果以 JSON 为准。

每轮执行：

| 检查 | 结果 |
| --- | --- |
| 正确证书/目标/凭证 | ack epoch=1 |
| 不信任自签服务证书 | `DEPTH_ZERO_SELF_SIGNED_CERT`，未进入凭证发送分支 |
| 错误 token | 服务端关闭，未得到 ack |
| 未知 target ID | 服务端关闭，未得到 ack |
| 携导出 session 数据重连 | 连接成功但 `isSessionReused() === false` |
| 轮换到新 epoch 并主动关闭已建连接 | 客户端收到 close |
| 旧 token 重连（有/无旧导出 session 数据） | 未得到 ack |
| 新 token 重连 | ack epoch=2 |
| 正常 stop | socket 文件消失 |

实验设置 `SSL_OP_NO_TICKET`，服务端 resumeSession 回调拒绝恢复。这里验证的是**本次导出 session 重试没有复用**，不是完整 TLS 1.3 ticket 获取/多轮 session cache 安全矩阵；不把旧 session 输入被拒绝夸大成所有恢复路径已证明安全。产品仍需每连接应用层目标授权检查及即时撤销，不依赖 TLS 恢复禁用作为唯一控制。

原始证据：

- [Node → Electron / TLS1.2](evidence/p0/node-to-electron.json)
- [Electron → Node / TLS1.2](evidence/p0/electron-to-node.json)
- [Node → Electron / TLS1.3](evidence/p0/node-to-electron-tls13.json)
- [Electron → Node / TLS1.3](evidence/p0/electron-to-node-tls13.json)

**候选收敛：证书 TLS + 加密通道中的按目标凭证，在当前运行时有互通依据。** 尚未解决产品内证书生成、信任锚安装/固定、到期、更新、撤销持久化及恢复事务。不能将 OpenSSL CLI 实验步骤交给最终用户。

## 3. 文件基础检查：10 项通过

[filesystem.json](evidence/p0/filesystem.json) 包含全部结果：

1. 新建私有目录显式 mode 0700。
2. 新建文件 mode 0600，fd 检查后读取成功。
3. `wx` 拒绝覆盖已有文件。
4. `O_NOFOLLOW` 拒绝叶子 symlink（ELOOP）。
5. nlink 检查拒绝 hardlink。
6. 拒绝 0644 的秘密/发现文件。
7. 拒绝 0755 的候选私有父目录。
8. 同目录 rename 后新打开看到新完整内容、旧 fd 仍看到旧内容。
9. 拒绝大于实验上限 1024 字节的文件。
10. Unicode socket 路径字节数大于字符数，证明必须按字节预算。

这是实验自定义 guard 的验证，**不代表现有产品已经有这些检查**。没有 chmod 用户目录，所有检查仅在可销毁临时目录进行。实验 socket 路径仅 35 bytes；没有验证 macOS 最大路径边界。

未验证：跨用户/ACL、恶意父路径并发替换、网络文件系统、崩溃持久性/fsync、磁盘故障、安装目标事务、长路径真实 bind。mode 与 owner 检查不足以证明所有上述安全性质。

## 4. 复现与清理记录

临时脚本位于 `/tmp/ap-p0.9P7j2j`（可能被系统清理，不是永久交付或生产源）：

- `server-psk.cjs`、`probe-psk.cjs`：原候选脚本副本；probe 副本仍引用 `server.cjs`，复现失败需先将对应 server 副本放入独立复现目录，不直接运行以免混合版本。
- `server.cjs`、`probe.cjs`：最终 TLS1.3 版本；TLS1.2 轮次使用同结构，只改变 min/maxVersion。
- `fs-probe.cjs`：10 项候选 guard 验证。
- `cert.cnf`：实验 SAN/CN 配置，不含秘密。私钥、证书及生成日志已清除。

最终脚本 SHA-256：

```text
3ad694ac33512c277a9dccfeb74d018e97ca3adeef11a5b3446344fd4454c354 probe.cjs
27292d0f24c2dbc4665486476b6b8812199234382e7a92159386a7ff29327df6 server.cjs
19fc9faf1d656e5a604fd36bccef77bd3bc6ef64a8d05ffd7916b9b2679d8244 fs-probe.cjs
```

命令形态：系统 node 运行 probe，传入已安装 Electron executable；反向用 `ELECTRON_RUN_AS_NODE=1 <electron> probe.cjs <node>`。证书仅在私有目录用 `umask 077` 生成。所有成功轮次正常关闭子进程与 socket；失败轮次子进程已退出。随机 token 只在进程内存及父子 IPC，报告不保存。

本轮未跑产品 test/typecheck/build：没有产品代码改动，这些命令不能替代本次机制实验或证明新契约实现。

## 5. P0 状态与下一步

完成：当前双运行时的传输候选排除/互通、10 项文件基础检查。

剩余：pi 自动发现临时目标测试（不能据静态研究宣称动态通过）、安装/升级/撤销事务与身份语义、完整证书生命周期、ACL/路径/并发验证，以及发布平台/签名条件。

建议采用已经验证有基础的证书 TLS 路线继续完善契约，保留私有文件凭证候选及明确 OS 用户威胁边界；先形成可审阅协议与安装流程，再决定哪些隔离实验仍必须完成。**仍不进入管理窗口或一键安装功能编码。**

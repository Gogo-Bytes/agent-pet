# Research: P0 macOS 本机 pi bridge 安全与预览版发布

## Summary
macOS 上 Electron 与外部 pi Node 通过用户私有发现文件和 Unix domain socket 连接具有官方 API 基础，不需要用户设置环境变量；但路径、凭证取用、双向认证与撤销尚不能视为已验证契约。私有明文凭证文件与 Keychain/窄 helper 各有可行性成本，本报告不冻结偏好；预览发布还需真实签名、公证、安装/升级/直接删应用后的残留验收。

范围：仅设计研究，macOS preview first；Windows ACL、named pipe、安装器与签名延后。不访问用户配置或凭证、不安装依赖、不生成密钥、不实现或测试生产代码。本报告只写 runtime 指定产物路径，不改共享仓库文件。

## Findings

### 1. 已读代码的实际基线
**Claim:** 当前连接不是产品版自动发现或双向认证实现。**Sources:** 本地 `docs/DESKTOP-PRODUCT-DESIGN.md`、`apps/desktop/package.json`、`packages/adapter-pi/src/index.ts`、`integrations/pi-extension/index.ts`。**Support:** direct evidence。**Confidence:** high。

- 扩展加载时读取并固定 `AGENT_PET_PI_ENDPOINT` / `AGENT_PET_PI_TOKEN`；每次消息携带 token，连上即发送含名称/项目名的 hello，没有读取服务端数据/ack 的处理。
- adapter 对 token 做字符串相等检查，收到 hello 即报告 connected；全 server 共用配置 token，没有按目标授权表、服务端身份验证、认证超时或定向撤销接口。已有连接跟随启动时凭证，不会因删文件自动失效。
- 已有行/缓冲上限、错误隔离、退避和 unref，可保留；连接数/认证前资源上限仍缺。扩展现有 socket timeout 只在 connecting 时 destroy，不等于认证或 liveness 超时。
- desktop package 仅列 dev/build/typecheck，build 是 `electron-vite build`；**仅此文件不能证明全仓库不存在打包方案**，但也不能据此声称已有可分发签名安装包或确定 Electron/嵌入 Node 版本。

### 2. Unix socket 与无环境变量发现
**Claim:** Node 支持 pathname Unix socket，macOS 路径典型上限为 103 **bytes**，正常 server.close 可 unlink，崩溃可遗留 socket。**Sources:** [Node net](https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections)。**Support:** direct evidence。**Confidence:** high（具体构建边界须测试）。

**设计解释 / researcher inference：**
- 持久发现入口、运行 socket、凭证存储应分开。发现记录建议含 schema/protocol、opaque target ID、instance/generation、endpoint 和非秘密 credential reference；target ID 不等于授权。连接前及每次重试重新读取，认证成功后才发送 session 元数据。
- Electron `app.getPath('userData')` 默认是 macOS `~/Library/Application Support/<app name>`，适合偏好/所有权子目录；它不是权限保证，也不能假设外部 Node 知道 app 的重命名或 setPath。[Electron app](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
- 两端需冻结稳定产品标识、发现目录解析规则；可在受管理扩展中带非秘密 bootstrap 定位信息，不带 token。不能由 cwd、shell PATH 或任意 descriptor 字段拼出不受约束的凭证路径。
- 不将 socket 直接塞入可能很长的 userData 树。候选为短的用户私有运行目录 + 短随机实例 basename，持久入口指向它；短目录的安全创建方式仍待确认。不得依赖 Linux abstract socket（Node 文档只给 Linux 支持）或把 `/tmp` 固定文件当安全方案。
- 应按完整实际路径 UTF-8 字节计数并预留余量；长 home、Unicode、解析前后路径差异均须验收。若无安全短路径，明确失败，不静默切换无认证 TCP。
- listener 成功且权限校验完成后再原子发布发现记录。清理须限定当前 instance/generation；`EADDRINUSE` 不足以授权删除未知 socket。正常 Node close 也会 unlink，不能让新旧实例共享并抢占同一 socket 路径。

### 3. 权限、symlink 与 TOCTOU
**Claim:** Node 文件 API 支持权限、lstat、文件描述符检查和 `O_NOFOLLOW`，但官方明确反对先 access/exists 再 open 的竞态模式。**Sources:** [Node fs](https://nodejs.org/api/fs.html)。**Support:** direct evidence。**Confidence:** high；完整防竞态方案未验证。

**设计要求 / researcher inference：**
- 私有目录目标 mode `0700`，descriptor/秘密文件 `0600`；socket 权限也收紧并验收。不要依赖默认 mkdir mode（文档默认 `0777`）或进程恰好有安全 umask；不要 chmod 用户既有 home/共享配置树。已存在目录须检查所有者、类型和权限，不假设递归 mkdir 修好了它。
- 创建临时文件时直接独占创建（如 `wx`/`O_EXCL`）并指定限制权限，写完后在同一目录 rename 发布；失败恢复仅涉及本次自有内容。原子发布不等于持久性或完整事务，fsync/崩溃顺序需单独决定。
- 拒绝秘密/发现文件是 symlink；open 后对 fd 做 fstat，检查 uid、regular-file、大小上限，必要时拒绝异常 hardlink。lstat→open 不是原子授权，realpath→write 也不是。
- **不能把 `O_NOFOLLOW` 宣称为整条父路径防替换措施。** 已检查父目录、leaf no-follow、fd 检查只是分层措施；纯 Node path API 对恶意可写祖先路径的保障未证明。自定义目标若有不可信祖先/不可收紧权限，首版应拒绝或标未支持；强保证可能需要 native dirfd/openat 类 helper，须另行评估。
- ACL、继承权限和非本地文件系统需 macOS 实测；只显示 POSIX mode 不足以宣称跨用户访问已被阻断。
- 边界是 OS 用户与明确授权目标，不承诺抵挡 root 或同用户恶意代码。按目标拆分凭证便于撤销/误用隔离，**不是同 uid 下不同 pi profile 的强隔离**。

### 4. 凭证存储比较：不预选赢家
**Claim:** `safeStorage` 是 Electron Main API；macOS 密钥存于该 app 的 Keychain，其他 app 取用通常需要用户 override。它没有在所查文档中提供外部 pi Node 直接解密的共享契约。**Sources:** [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[Apple ACL 文档原始 JSON](https://developer.apple.com/tutorials/data/documentation/security/access-control-lists.json)。**Support:** direct evidence（Main/Keychain）＋ interpretation（外部 Node 限制）。**Confidence:** high。

| 维度 | 私有权限 token/PSK 文件 | Keychain + 窄 helper |
| --- | --- | --- |
| 外部 Node 消费 | 标准 fs 可读取；不要求调用 Electron | 须实现可验证的 native/helper IPC 接口；不能把 safeStorage ciphertext 交给 Node 就认为能解密 |
| 静态保护 | 明文，依赖用户目录权限；备份/误打包会暴露 | OS 密钥库保护和访问策略；锁定、拒绝、提示是正常失败路径 |
| 同用户边界 | 同用户恶意进程通常可读，不提供 app 级隔离 | 只保护正确的 Keychain 访问边界；若 helper 给任何同 uid 调用者吐 token，就把隔离重新降低 |
| 部署成本 | 无新增 native 组件，但路径/权限/race 安全责任重 | helper 的签名、公证、更新兼容、调用者识别与清理均新增工作 |
| 运行期暴露 | Node 内存持有 secret | 若 helper 返回 secret，Node 内存仍持有；若 helper 代做认证，接口与协议复杂度更高 |
| 撤销 | 删除文件不够，须撤销授权并踢连接 | 删除 Keychain item 同样不会关闭已认证连接或清除调用者缓存 |

Apple ACL 直接说明：没有对应操作条目则拒绝；操作存在但应用不在 trusted apps 中会提示 Deny/Allow/Always Allow。**不能简单概括为所有非白名单应用一律无提示拒绝。** 文档中多项旧 ACL API 标记 deprecated，现代 helper 应用的具体 Keychain API/access-group/签名要求需再选择，不能直接照搬旧 API。

**待决策：** 若首版接受“OS 用户边界 + 明文 at rest”，私有文件是候选；若要求应用级 at-rest 隔离，则 helper 路线需先证明外部 Node 的窄授权方案。不能信任可运行任意 JS 的通用 Node 可执行文件等于信任唯一扩展；不得用宽泛 Keychain 放行、命令行/日志输出 secret 或静默降级解决提示问题。Electron 文档要求稳定代码签名以避免更新后 Keychain 重复提示；latest 文档新增 async API 不代表当前锁定版本已有。

### 5. 随机凭证、双向认证与撤销
**Claim:** Node `crypto.randomBytes` 提供密码学强随机数据；TLS 提供证书及 PSK 机制，不应自行设计 challenge-response 密码协议。**Sources:** [Node crypto](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)、[Node TLS](https://nodejs.org/api/tls.html#pre-shared-keys)。**Support:** direct evidence（API）＋ interpretation（选择）。**Confidence:** high（能力）；medium（目标运行时兼容）。

候选比较，不冻结选择：
1. **TLS-PSK over Unix socket：** 每目标独立高熵 PSK；TLS 证明双方掌握密钥，不在明文 hello 发送 bearer。Node 官方要求显式启用 PSK cipher；异步 PSK callback 不支持，Keychain/helper 取钥必须在握手前完成。客户端证书身份检查在无证书 PSK 情况需按官方 PSK 语义处理，不可把“关闭所有校验”当通用方案。具体 TLS 版本/cipher、Electron 与 pi 的 OpenSSL 组合需互通测试。
2. **证书 TLS：** 固定私有 CA/正确 pin 的 server 认证 + 受 TLS 保护的按目标 bearer，或进一步 mTLS。前者已可组合成服务端与客户端双向身份校验；后者避免发送 bearer，但增加客户端密钥/证书发行、到期、信任轮换工作。Node TLS 接受 net server 选项和 socket/path；不是改成公共 TCP 服务的理由。信任锚必须由授权安装流程受保护地置入，不能每次无条件信任发现文件里的新 pin。
3. **仅 UDS 权限 + 明文 token + ack：** 不等于密码学双向身份认证；若 endpoint 被替换，客户端先发 token 会泄露凭证。不能以加一个 ack 关闭服务冒充风险。

**建议契约（researcher inference）：**
- 每个用户授权目标独立随机 secret，建议 32 随机 bytes（设计建议，不是官方强制数值）；target ID、epoch 与权限表关联。secret 不写 renderer、argv/env、日志、诊断或随包资源。生成只发生在未来授权安装，本轮未生成。
- 认证后 hello/ack 绑定协议版本、目标、服务实例、epoch 和能力；ack 成功才显示在线。设置认证超时、最大并发/每目标连接、消息与速率上限、不兼容明确拒绝；transport secure 不等于业务协议兼容。
- 断开：先持久化撤销/关闭准入，再关闭该目标所有现存连接并拒绝排队消息，然后删除自己的凭证/扩展；清理失败仍保持撤销。按目标撤销不能误杀其它目标。
- 轮换要关闭旧 epoch 连接并使旧凭证失效；如允许兼容窗口必须有限且明确。TLS session resumption/tickets 可能绕过重新查询凭证，需禁用或把恢复会话与授权 epoch 重新绑定并测试；不把“新握手拒绝”当完整撤销。
- PSK 双方都能冒充另一端：它证明密钥持有，不证明 Apple 签名的 Pet 二进制。若需要后者，是额外 code identity/helper 威胁模型，尚未解决。

### 6. 单实例、应用资源与受管理扩展
**Claim:** Electron 提供单实例锁、userData、app path/resourcesPath；ASAR 是 Electron 特殊 fs 支持的只读虚拟目录。**Sources:** [Electron app](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata)、[process](https://www.electronjs.org/docs/latest/api/process#processresourcespath-readonly)、[ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)。**Support:** direct evidence。**Confidence:** high。

**设计解释 / researcher inference：**
- 在监听/发布发现之前取单实例锁；失败实例退出，`second-instance` 聚焦管理窗口，macOS `activate` 处理重新打开。锁不等于网络认证，也不保证不同 bundle ID/userData 的开发版/预览版不会冲突；须冻结 channel namespace，参数不携带 secret。
- 扩展 payload 随签名应用带入：可在 ASAR 内由 Electron fs 读取并写出普通受管理文件，或明确放 Resources 内真实文件。不得要求外部 pi Node 把 `app.asar/...` 当普通路径解析，不给用户扩展留下依赖应用安装绝对路径的 symlink。
- 复制产物记录版本、摘要、目标和所有权；更新只能替换仍匹配自有摘要的文件。ASAR 不是加密，也不能仅凭 ASAR 文件存在声称完整性；源资源与最终签名包布局需验收。
- 不在运行时修改签名 app bundle；数据写 userData/授权目标。应用移动、挂载 DMG、升级替换后，已复制扩展应仍可安全等待而非引用旧 bundle。pi 的自动加载位置/自定义目录契约不由 Electron 文档证明，本报告不冻结。

### 7. macOS preview 发布条件
**Claim:** Apple notarization 要求合适的 Developer ID 签名、Hardened Runtime、secure timestamp 等；公证是自动扫描，不是 App Review 或产品安全证明。**Sources:** [Apple notarization 原始 JSON](https://developer.apple.com/tutorials/data/documentation/security/notarizing-macos-software-before-distribution.json)、[Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)。**Support:** direct evidence。**Confidence:** high。

设计选择待确认：首版可考虑站外 Developer ID 签名、公证并 staple 的 DMG、用户拖入 Applications；这是候选分发路径，不是用户已选包装工具。需要授权的 Apple 开发者账户/证书与构建凭证管理；不访问现有 Keychain 推断其已配置。Apple 明确不能用 ad hoc/local development certificate 替代 notarization 所需证书；所有分发 executable（含 helper）要纳入签名与合适 entitlements。使用 notarytool/stapler 流程，不把本地 electron-vite build 当发布包。

**发布 gate（researcher inference）：** 冻结最低 macOS、arm64/x64 支持、bundle ID/channel、打包工具/资源白名单、Entitlements 最小集合及手动升级方式；从最终下载的隔离属性真实包验收 Gatekeeper、staple 离线行为、首次授权、升级、资源复制和多用户权限。app 自带 Electron runtime，不依赖用户 Node/pnpm；这不等于捆绑或静默安装 pi，pi 是已有外部运行环境。预览版不得要求终端绕过 Gatekeeper。

### 8. 直接拖删不能承诺自动撤销清理
**Claim:** Apple 区分应用自带卸载功能和拖入 Trash，并指出卸载器用于清理存放在其他位置的 login items、extensions、数据。**Sources:** [Apple Delete or uninstall apps on Mac](https://support.apple.com/en-us/102610)。**Support:** direct evidence；“不可依赖删除回调”为 interpretation。**Confidence:** high。

- 产品提供“断开并移除接入”：先撤销，再选择性移除自有文件/凭证/登录设置；保留被用户改动的文件并解释。
- 直接删除 .app 不能等同于执行该操作，也不能承诺清除 Keychain 或用户目录残留。残留扩展必须无 UI 刷屏、重试有退避/限制且 unref、不保活 pi、不在连接失败时阻塞 Agent；缺失发现文件为正常离线。
- 文档提供 GUI 清理路径和重装后的残留识别；重装不得自动重新授权旧 target。没有后台服务的首版，不应为“自动卸载监控”额外引入 daemon。

## Contradictions
没有发现官方材料互相冲突。发现三类易混淆点：
1. safeStorage 的 macOS app 级保护与“任何同用户 Node 都可无交互读取”不兼容，后者未有依据；原始搜索摘要对 ACL 的概括过强，实际 Apple 文档包含用户提示分支。
2. Node 给的是 socket 路径“典型 103 bytes”，不是所有 macOS/Electron 构建经实测统一保证；latest API 页面也不能当当前项目运行时版本证明。
3. Apple TN2206 是历史归档，仅用于签名/资源封装背景；现代 notarization 要求以成功取得的当前 Apple 文档 JSON 为准。

## Missing evidence / 待决定与验证
- **D1 威胁与凭证：** 接受用户私有明文，还是要求 Keychain app 隔离？helper 如何识别通用外部 Node 调用者？没有偏好已获批准。
- **D2 认证：** TLS-PSK、server TLS + bearer 或 mTLS 的互通/发行成本；准确 Electron、pi Node/OpenSSL 与最低版本尚未确认。
- **D3 路径：** 稳定 bootstrap 命名与安全短 runtime root；长 Unicode home、symlink/hardlink/并发替换、ACL、异常 FS、崩溃清理均未实测。纯 Node 是否满足所选竞态边界未证明。
- **D4 生命周期：** 原子发布/断电恢复、并发版本、立即撤销已建立及 resumed TLS 会话、secret 轮换/锁定/Keychain 拒绝后的 UX 未实现或验证。
- **D5 分发：** 最低 OS/架构、证书授权、打包配置、helper 签名、离线公证、干净机器与升级/卸载残留测试均待后续阶段。
- **D6 pi 契约：** 授权目标、自动加载/重载/custom config 范围需要 pi 专项证据，本报告没有用猜测的固定目录替代。

验证方法限制：已调用注册的 source_check 两次覆盖安全/发布关键断言，工具均返回 `unclear`（0.30），不是通过验证；因此逐项回到成功抓取的官方原文/Apple 原始文档 JSON 检查。Apple 两个 JS 页面首次抓取失败、错误 ASAR URL 404 均未作为事实证据；后续成功原始源才用于结论。没有进行运行时或安全渗透验证。

## Sources
**Kept（全部实际成功抓取并检查）：**
- [Node net](https://nodejs.org/api/net.html) — IPC 路径、长度、unlink。
- [Node fs](https://nodejs.org/api/fs.html) — 权限、O_NOFOLLOW、检查后使用竞态。
- [Node TLS](https://nodejs.org/api/tls.html) — PSK、证书验证、同步回调限制。
- [Node crypto](https://nodejs.org/api/crypto.html) — randomBytes；timingSafeEqual 也不保证周边代码 timing-safe。
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) — Main、Keychain 语义与签名。
- [Electron app](https://www.electronjs.org/docs/latest/api/app) / [process](https://www.electronjs.org/docs/latest/api/process) — 单实例、用户数据与资源定位。
- [ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives) — 只读与 Electron 特殊 fs。
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) — Electron 分发上下文。
- [Apple notarization JSON](https://developer.apple.com/tutorials/data/documentation/security/notarizing-macos-software-before-distribution.json) — 正式签名、公证与 staple。
- [Apple ACL JSON](https://developer.apple.com/tutorials/data/documentation/security/access-control-lists.json) — trusted apps/提示及旧 API 状态。
- [Apple TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html) — 归档背景，非现代发布唯一依据。
- [Apple Mac uninstall](https://support.apple.com/en-us/102610) — 拖删与扩展残留边界。

**Rejected/deprioritized：** 搜索摘要仅作发现；第三方 Apple docs 镜像不是首要证据；旧 Node v12/v16 与旧 Electron v12 文档不代表项目当前能力；误命中 iPhone uninstall 页面不适用；抓取失败的 JS 页面和旧 `/tutorial/asar` URL 不支持任何结论。

## Next steps
先冻结 D1–D3 的威胁边界与候选组合，再在不触碰真实用户配置的临时测试环境中做一个 macOS 可丢弃互通/权限验证；其后才规划打包签名与最终安装验收。Windows 保持明确未支持，不能由 POSIX 结果外推。

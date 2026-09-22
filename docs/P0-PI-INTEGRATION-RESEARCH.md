# P0：pi 接入静态研究（非实现）

## 结论与边界

用户确认的是 `docs/DESKTOP-PRODUCT-DESIGN.md` 产品方向，不是编码授权。当前 **pi 0.85.1 支持不修改共享 settings 的用户级扩展自动加载**；建议以产品独占的自包含单文件为首版安装单元。但“复制成功”不等于“实际加载”，更不等于“已连接”。存在 root entry、ignore、资源排除、`--no-extensions`、自定义 agentDir 等例外。

本报告仅静态读取指定安装包的文档、分发源码和示例；未执行 pi、未读取真实用户设置/凭证/会话、未安装依赖、未修改代码或配置。唯一写入是本报告的运行时指定 artifact 路径。未做运行测试，以下事实限定于读取到的安装内容，不构成跨版本或跨平台保证。

## 证据定位规范

以下 `P/` 精确代表：

`/Users/gan/.nvm/versions/node/v22.22.3/lib/node_modules/@earendil-works/pi-coding-agent/`

行号均指该安装包实际文件，不指在线 main 分支。完整阅读：`README.md`、`docs/extensions.md`（3023 行）、`docs/packages.md`、`docs/settings.md`、`docs/environment-variables.md`，以及相关引用 `docs/session-format.md`、`docs/quickstart.md`、`docs/security.md`；另读取相关加载/重载/身份源码和示例。未将无关 UI、provider、容器等引用扩展为本任务的实现范围。

上游入口（仅来源链接，未在线验证其当前内容）：

- npm：https://www.npmjs.com/package/@earendil-works/pi-coding-agent
- package.json 声明仓库：https://github.com/earendil-works/pi ，目录 `packages/coding-agent`。
- 随包文档仍使用：https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts 等旧仓库名称链接；不要把在线 main 当 0.85.1 的固定快照。
- 文档候选入口：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md 、同目录 `packages.md`、`settings.md`。

## A. 已核实事实

### 1. 安装包身份与运行边界

- `P/package.json:2–10`：名称 `@earendil-works/pi-coding-agent`，版本 **0.85.1**，ESM，`piConfig.configDir = ".pi"`，CLI bin 为 `dist/bundle/cli.js`。
- `P/package.json:52–70`：jiti 2.7.0、typebox 1.3.7 等依赖；`:109–116`：仓库、Node 要求 `>=22.19.0`。安装位置中的 Node 版本不是对所有用户机器的承诺。
- 精确源码证据以可读 `dist/*.js` 为主；实际 CLI 是 bundled 分发。`P/dist/bundle/chunks/chunk-JVUZSMYM.js:1066–1067,1234,1247,1363–1376` 可检索到对应 loader、resource、package、reload 实现，但这些压缩行不是易审阅的主引用。
- 扩展拥有 pi 进程的完整权限，不是沙箱。依据 `P/docs/extensions.md:112–125`、`P/docs/security.md:1–35`。

### 2. 默认与自定义配置目标

- `P/dist/config.js:399–406,420–427`（`CONFIG_DIR_NAME`、`ENV_AGENT_DIR`、`getAgentDir`）：标准构建默认 `homedir()/.pi/agent`；`PI_CODING_AGENT_DIR` 可覆盖，并作路径规范化/tilde 展开。
- `P/docs/environment-variables.md:75–99` 明确区分 `PI_CODING_AGENT_DIR`（配置）、`PI_CODING_AGENT_SESSION_DIR`（会话存储）和 `PI_PACKAGE_DIR`（pi 包目录）。**后两者不能当扩展配置目标。**
- `P/dist/core/package-manager.js:698–737`（`resolve`）：用户资源 base 为 `this.agentDir`；项目 base 为 `cwd/CONFIG_DIR_NAME`。自定义 agentDir 的扩展目标因此为 `<agentDir>/extensions`，不是固定写入默认用户路径。
- rebrand 构建可改变 APP_NAME/configDir，环境变量名称也由 APP_NAME 派生；不能宣称所有 fork/profile 通用。GUI 的环境也不能证明终端 pi 的实际 agentDir。

### 3. 自动发现：官方支持，但不是无条件扫描

- 文档位置：`P/docs/extensions.md:110–144`。用户级 `extensions/*.ts`、`extensions/*/index.ts` 自动发现；项目 `.pi/extensions` 受 project trust 控制。
- **实际 CLI 主路径**是 `DefaultResourceLoader` → `DefaultPackageManager.resolve` → `addAutoDiscoveredResources`，不是只读 `discoverAndLoadExtensions` 就足够。依据 `P/dist/core/resource-loader.js:263–320`；`P/dist/core/package-manager.js:698–737,1939–2010`。
- `P/dist/core/package-manager.js:376–456`（`resolveExtensionEntries`、`collectAutoExtensionEntries`）：支持直接 `.ts`/`.js`，子目录 manifest 或 `index.ts`/`index.js`；不会任意递归。**先检查 extensions 根目录自身的 manifest/index；若找到入口，直接返回，普通同级文件不再扫描。** 因此已有 `extensions/index.ts` 等情况会挡住 Pet 单文件自动发现。
- 同函数跳过点文件、`node_modules`，遵守 ignore 规则，跟随部分 symlink。`addIgnoreRules` 见 `P/dist/core/package-manager.js:108–127`。安装器不得照搬其 symlink 宽松行为作为安全写入策略。
- `addAutoDiscoveredResources` 在 `:1988–1991` 对项目扩展检查 trust；`:2007–2008` 对用户扩展自动发现。用户扩展在 project trust 决策前可加载：`P/dist/core/resource-loader.js:256–262`。Pet 不应注册或代替用户处理 project_trust。

### 4. settings 作用域、禁用与 -e

- `P/docs/settings.md:1–23,282–327,347–369`：用户 settings 与项目 settings；项目 override；资源路径分别相对 agentDir 和项目 `.pi`，支持绝对路径、tilde 和 `!/+/-` 规则。资源列表由 package manager 分别处理，不能把一般“项目覆盖”误写成所有资源数组简单替换。
- `P/dist/core/package-manager.js:516–535`（`isEnabledByOverrides`）：自动资源默认 enabled；`!pattern` 排除、`+path` 精确恢复、`-path` 精确排除最后优先。`:1952–1963,1980–1986` 将对应 scope 的规则用于自动发现资源。
- `P/docs/packages.md:215–228`：`pi config` 可启停资源；package identity 的去重规则是 npm 名、git 无 ref URL、local 绝对路径。它不是“同逻辑扩展任意复制都自动去重”的承诺。
- `P/dist/cli/args.js:135–140`：`-e/--extension` 可重复，`--no-extensions`（实现也接收 `-ne`）关闭 discovery。
- `P/dist/core/resource-loader.js:276–319,401–412`：`noExtensions` 时仍保留显式 CLI extensions；所以 `--no-extensions -e file` 有效，不能解释为禁止所有扩展执行。
- `-e` 是当前启动的显式加载，不是持久注册。npm/git source 可临时安装：`P/docs/packages.md:43–51`。当前 `reload` 会重新解析 additionalExtensionPaths（resource-loader `:276–279`），但官方推荐可重载扩展放自动发现位置（`P/docs/extensions.md:7`）；不据此对其他版本保证 -e 热重载行为。
- `pi install/remove` 默认改共享用户 settings，`-l` 改项目 settings；本方案无需它们。依据 `P/docs/packages.md:18–51,112–120`。不得为接入悄悄清除用户禁用规则或改 trust。

### 5. 重载与忙碌会话

- TUI `handleReloadCommand` 明确在 `isStreaming` 或 `isCompacting` 时提示等待并返回：`P/dist/modes/interactive/interactive-mode.js:4974–4982`。它不是自动排队重载；本次没有证明所有其他忙碌状态均被该入口拦截。
- `AgentSession.reload`：先发 `session_shutdown {reason:"reload"}`，invalidate 旧 runner，重新读 settings/resources，构建新 runtime，然后发 `session_start {reason:"reload"}` 与资源发现。`P/dist/core/agent-session.js:2217–2239`。
- `DefaultResourceLoader.reload` 在已加载时清扩展 factory cache：`P/dist/core/resource-loader.js:263–267`；`P/dist/core/extensions/loader.js:114–129`。
- `AgentSession.reload` 自身未显示与 TUI 相同的 busy guard，不能将 TUI 行为泛化为任意 SDK/API 调用安全契约。
- 老 command frame 在 reload 后仍会继续，但旧 ctx/runtime 已失效；`P/docs/extensions.md:1303–1331`（ctx.reload 节），`P/dist/core/extensions/loader.js:163–175`（invalidate）。
- 产品只能提示“请在空闲时自行 /reload 或重新打开”。不启动、不重启、不发命令、不排队控制用户 pi。

### 6. 自包含扩展加载与依赖

- 默认导出 factory（可 async）；jiti 支持 TS 不预编译。`P/docs/extensions.md:158–181`。
- `loadExtensionModule` 使用 `createJiti`，`moduleCache:false`；bundled Node/Bun/SEA 使用 virtualModules，unbundled Node 使用别名；`P/dist/core/extensions/loader.js:400–430`。`initializeExtension` await factory，异常收集为 load error：`:455–488`。
- 核心模块虚拟表/别名包括新 `@earendil-works/*` 及旧 `@mariozechner/*` 名称（`:30–112`）。这是 **0.85.1 的兼容实现**，不是旧包名永久保证。
- `P/docs/extensions.md:146–156`：可用 Node builtins；第三方 npm 依赖要有实际 `node_modules`。`P/docs/packages.md:164–189` 要求 runtime dependencies 与 core peerDependencies 分开，core 包不要 bundle；不能把 peer 的 `"*"` 建议当语义兼容认证。
- 适合首版的约束：只有 Node builtins 和擦除的 `import type`，无 Electron import、无 npm install、无 native addon、无动态网络代码下载。自包含 TS 或单 JS 是可行候选，尚未运行验证。
- factory 可能在无 session 的调用中执行，且 async factory 阻塞启动。官方要求长生命周期资源从 session_start 启动、session_shutdown 幂等释放：`P/docs/extensions.md:220–224`。连接尝试不应 await 无限网络等待或在 factory 开 socket/timer。
- 复制到 agentDir 的独立文件不依赖 Electron ASAR 被外部 Node 识别，不依赖 app 安装目录长期不变。稳定 loader + 多 payload 的更新/缓存策略本次未证明；最小单文件原子替换更易限定验收。

### 7. 身份、reload 与状态

- `SessionManager.getSessionId()` 返回当前 sessionId（`P/dist/core/session-manager.js:733–735`）；新会话产生 ID（`:644–668`），加载已有会话取 header.id（`:670–683`）。`getSessionFile` 对 in-memory 可无路径，见 `P/docs/session-format.md:397–438`。
- `AgentSession.reload` 不替换 SessionManager/不生成新 sessionId（上述 `:2217–2239`）；因此 **逻辑 session UUID 在同会话 reload 内保持**，但扩展 factory、内存状态、socket 和 ctx 不可依赖保持。
- `/new`、resume、fork 会发生旧 shutdown 与新 start：`P/docs/extensions.md:393–450,516–525`。应在每次 start 重新读取 ID/name/cwd，而非从旧闭包延用。
- session UUID 不是活动进程 ID：同一已保存会话可能由不同运行实例打开；本次不证明并发打开时有排他约束。协议须另行区分连接/运行实例与逻辑 session。
- `agent_end` 只是低层 run 结束，可能继续 retry/compact/follow-up；当前版提供 `agent_settled` 与更完整 `ctx.isIdle()`。`P/docs/extensions.md:567–581,1044–1046`；`P/examples/extensions/notify.ts:52–58` 用 settled 通知。不能直接把 end 映射“最终完成”，也不能据此承诺旧版本有 settled。
- 名称可用 `pi.getSessionName()`，rename 有 `session_info_changed`（`P/docs/extensions.md:404–413,1486–1504`）。不需读 JSONL、getEntries、message body 或扫描 session 文件；不得用第一条 prompt 补名。

## B. 提议契约（尚未实现/验收）

### 最小安装、更新、回滚

1. 首版明确只覆盖经验证的标准发行版/版本；自动发现二进制/安装包身份与选择配置目标分开。默认 `<home>/.pi/agent` 是候选，不自动推断用户 shell profile。
2. 用户选择目标并授权后，安装产品唯一命名 `<agentDir>/extensions/agent-pet.ts`。无注册命令，无共享 settings、shell rc、trust、npm/git 修改。已有同名未知所有者内容则冲突终止。
3. 前置检查目录所有权、权限、symlink、root entry、ignore 等；root entry 或用户禁用场景明确不支持自动修复，不能编辑共享 loader/index 来绕过。实际 settings 检查须在后续获授权后最小读取，本研究未读取。
4. 同目录非 `.ts/.js` 临时文件暂存、校验产品签名/摘要、并发条件再检查、原子替换。备份和所有权记录留在 Pet 私有目录或非发现路径，**不可在 extensions 根目录留下 `agent-pet-old.ts`** 导致双加载。
5. 记录授权 target ID、规范化目标、版本、安装前后摘要/文件标识。写成功仅显示“已配置，等待加载”；验证 hello/ack 后才“已连接”。用户禁用/错目标/加载失败不能伪装成功。
6. 更新只替换确认属于产品且未被外部改动的文件；旧已加载代码仍运行至用户安全重载。磁盘回滚不能等同运行时回滚。兼容窗口由 Pet 协议定义并测试，不借用 pi SemVer 作保证。
7. 断开先撤销服务端目标授权并关闭现有连接；再仅删除摘要/所有权仍匹配的自有文件。修改过的文件保留并说明，不恢复整份 settings，不删除 agentDir。
8. 直接删除 Pet app 后扩展残留需静默、有限资源、退避重连且不保活 pi；重装识别自有残留。pi 官方卸载也保留用户目录（`P/docs/quickstart.md:15–35`），不能依赖 OS 或 pi 卸载替产品清理。

### 会话与连接

- 在 session_start 读取当前逻辑 ID、显式名称和 cwd 的受限显示信息，恢复 working/idle 基线；断线重连不重放历史完成。
- 独立区分：installation target、逻辑 session UUID、运行实例/连接 generation、Pet 服务 instance。reload 的 shutdown 是 runtime 换代，不必表示逻辑 session 结束。
- 在 shutdown 幂等关闭 socket/timer；新 runtime 完整重建。禁用所有发送消息、审批、abort、reload、exec 等控制 API。
- 完成语义优先研究当前版 agent_settled；是否迁移既有适配器及最低版本需单独批准与回归测试。

## C. 未知、阻塞与后续验证

**P0 静态可行性通过，P2 实装/发布仍有门槛：**

- 版本支持矩阵未建立：仅 0.85.1 静态核实。旧命名空间、旧事件 API、不同 runtime/SDK ResourceLoader、fork/rebrand 均不可默认兼容。
- 未运行新会话/reload/断开/双实例/重装验收；未验证 ASAR 打包产物、签名、公证、Windows ACL。不得标为发布完成。
- 纯 GUI 无执行方式无法总是确定终端真实 agentDir、wrapper 参数或 `--no-extensions`；手选目标仍要由握手佐证。多个 pi 安装可能共享同一 agentDir；一个安装也可能用多个 agentDir。
- root entry/ignore/exclusion 是无共享配置修改方案的明确阻塞分支。默认用户级自动加载的“零共享配置”路径可用，但不能承诺所有现有目录布局一键成功。
- 文件防并发/原子更新/所有权/撤销策略是产品自己的安全责任，不是 pi 提供的事务安装 API。
- socket/pipe、rendezvous、密钥访问、双向认证、target 隔离及 hello/ack 协议不是本次 pi loader 证据能证明的能力；仍由安全/协议 P0 定案。
- `ctx.isIdle`/agent_settled 的状态边缘（失败、用户中断、自动压缩重试、queued continuation）须后续有界测试；当前研究不把握手成功当生命周期语义验收。

本次没有需要用户马上作出的实现决策；已向主会话报告 root-entry 抑制自动发现这一会改变安装计划的重要发现。后续任何实现、真实用户配置检查、安装或运行验证应另获授权。

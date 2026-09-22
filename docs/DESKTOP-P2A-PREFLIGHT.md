# P2a：pi 安装检测与只读预检

状态：**实现、独立审查及审查问题修复完成；未做原生选择器或真实用户目标验收。** 基线 `ad2c6a6`。仅实施 [P2a](DESKTOP-P2-IMPLEMENTATION.md)，不包含 P2b/c/d。本地阶段提交，不推送，无新增依赖。

## 交付与使用

管理窗口的 Agent 连接页提供：

1. **检测 / 重新扫描**：用户主动发起有限的 GUI PATH / 明确位置检测。
2. **选择安装包目录**：Main 打开图形目录选择器；选择包含 package.json 的 pi 包目录，不是配置目录。
3. **安装候选单选**：使用 Main 本次结果中的不透明 ID，不接收 Renderer 路径。
4. **选择配置目录 / 使用默认候选**：默认 `<home>/.pi/agent` 只是候选。选择本身不读取配置；不会依据安装位置推断活跃 agentDir，也不读取 shell profile 或扫描 sessions。
5. **检查所选目标（只读）**：仅显式点击后检查 Main 持有的目标。展示有限检查的冲突或未知项，而不是安装、加载、在线状态。

安装身份与配置目标分别保存于 Main 内存，不持久化，不创建 agentDir。安装选择不更改配置目标，目标选择不决定发行版兼容性。没有安装、修复、连接服务、授权凭证、Agent 控制或假 Session 数。既有开发 pi bridge、pet、Dock 恢复、退出延迟重试、管理尺寸合并写入均保持原实现；P1 顶部托盘问题未被关闭。

## 检测预算与身份

- 最多取 GUI PATH 的前 32 项（输入最多处理 32 KiB 字符），忽略空值和相对路径；额外三个固定位置为 `/opt/homebrew/bin/pi`、`/usr/local/bin/pi`、`<home>/.local/bin/pi`。去重后最多 35 个候选。PATH 超预算显示不完整。
- 只探测精确 `pi` 文件，不列目录、不递归、不扫描进程、磁盘、NVM 历史版本或用户会话。alias、wrapper 参数和终端 PATH 均未知。不执行任何检测对象，不导入 pi 模块，不调用可能安装 npm/git 的 package-manager.resolve。
- 可执行入口只允许最多 8 次叶子 symlink 解析，且只在规范 `dist/bundle/cli.js` 布局下读取包元数据；普通 wrapper/不明入口保持未验证。配置路径及安装包父目录的 symlink 不被跟随来读取配置/元数据。
- 核实 `name=@earendil-works/pi-coding-agent`、`bin.pi=dist/bundle/cli.js`、`piConfig.configDir=.pi` 及常规 CLI 文件。**仅版本 0.85.1 显示标准包元数据已核实**；其他版本、旧命名空间、fork、不完整/不安全元数据均未验证。显示的版本限定为短版本格式，不透传任意 package 字符串。
- 这不是包签名/代码哈希认证，不证明正在运行的 pi 身份或实际终端配置；可伪造的包元数据不能作为安装授权证明。
- 单路径最多 4096 UTF-8 bytes、32 个分隔片段；每次读操作预算最多 4096 个检查点、3 秒响应截止；JSON 最多读取 64 KiB + 1 个用于超限判断的字节。所有文件读均有容量限制，CLI 和扩展源码不读取。
- 最多一个文件检查任务、一个原生选择器在途。超时返回不完整结果并中止后续步骤；无法强制终止已经进入 OS 的文件系统调用，因此在它返回之前保持 reader 占用，后续读请求明确 busy，不无限并发堆积。网络挂载/设备挂起的内核调用终止能力不在本阶段保证内。
- Windows 明确不执行文件检测，保持未支持；未将 POSIX/macOS 结果外推到 Windows。

## 配置读取与保守结果

显式检查仅涉及所选目标及固定子路径的元数据、`settings.json` 与 `extensions/package.json` 的有界 JSON。不读取 auth、会话、模型/provider 文件、项目目录、shell 环境文件或扩展源码；不解析设置引用的 npm/git/local 包。

Renderer 只获得路径候选、兼容性枚举、短版本、不透明候选 ID、固定 finding code 和状态。settings 的其他键/值、manifest 入口内容、异常对象、错误堆栈均不返回、不记录日志。

| 情况 | 结果 |
| --- | --- |
| `extensions/index.ts` / `index.js` | 根入口冲突；不读取或更改源码 |
| `extensions/package.json` 中非空 `pi.extensions` | 根 manifest 入口冲突 |
| 其他根 manifest 情况 | 语义无法确认；不据空/异常结构假装通过 |
| 已有 `extensions/agent-pet.ts` | 同名冲突，所有权未知；不能称已安装，不覆盖 |
| 目标或 extensions 中 `.gitignore` / `.ignore` / `.fdignore` 存在 | ignore 语义未知（即使空文件），不读取规则内容，不自行近似 glob |
| settings 非对象；extensions/packages 非空或类型不支持 | settings 语义未知；包含精确排除、glob、恢复、包引用均不假装完整复刻 pi |
| 缺失目标 | 提示不存在，不创建 |
| 非常规文件、FIFO、symlink、hardlink、宽写权限、过大或无效 JSON、无法读取 | 停止/报告不安全或无法确认，不透传原始错误 |
| 没有上述发现 | “有限检查未发现上述冲突”，**不是绿色安装保证** |

ignore 的“不发现”与 settings 的“可能发现但禁用”保持不同 finding；本阶段没有引入成熟规则解析依赖，因此两者均诚实标未知，而不是手写匹配器给出错误通过。不会清除用户禁用意图或更改 trust。

路径逐层 metadata 检查、叶子 `O_NOFOLLOW | O_NONBLOCK`、fd regular/type/size/link/identity 检查和读取前后身份/时间验证形成分层保护。目标和 extensions 要求当前 uid、owner rwx；拒绝组/其他用户可写路径（root-owned sticky 临时祖先仅为受限例外，目标自身不可如此）。文件拒绝 group/other write、非当前 uid/非 root owner。只读检查不 chmod 或修复真实目录。

**边界：** POSIX mode 不是 ACL 验收；不声称能抵挡恶意同 uid/root 的父目录替换或提供纯 Node dirfd/openat 保证。网络文件系统、ACL、运行时 `--no-extensions/-e`、项目规则、当前实际 agentDir 均不能确认，UI 明示。任何未来写入仍必须在 P2c 重新预检、授权并使用独立安全发布原语。

## IPC 与异步结果

独立管理 preload 增加七个固定 pi capabilities：getState、detect、chooseInstallation、selectInstallation、chooseTarget、useDefaultTarget、inspect。没有任意 channel、路径读写或 shell API。pet preload 不变。

Main 每条 IPC 使用现有管理 webContents + mainFrame + 精确入口 URL 校验。零参数能力拒绝额外 payload；单选仅接受 Main 当前候选集合的 ID。所有选择器由 Main 绑定管理 BrowserWindow，使用 `openDirectory/dontAddToRecent`。

Main 操作代数、AbortSignal 与 Renderer 请求序号共同避免旧检测/检查/选择器/初始快照覆盖新选择。取消选择器保持原目标；它同时让更早检查失效。重复选择器不创建第二个对话框；退出使未完成选择失效。Renderer 卸载不消费迟到回复。独立审查发现切页卸载会丢失在途结果：当前连接面板在页面间切换时保持挂载，仅隐藏呈现，因此返回页面仍可得到检测/检查的完成状态；真正退出/卸载时仍丢弃迟到回复。

## 自动化验证（本次实际执行）

命令均在仓库根目录运行；测试只使用合成临时目录或明确的异步故障注入，不运行产品 GUI/用户 pi，不读取用户 Agent 设置、秘密、会话、端点或登录项。

- `pnpm exec vitest run apps/desktop/src/main/pi-preflight-files.test.ts apps/desktop/src/main/pi-preflight.test.ts apps/desktop/src/main/index.test.ts apps/desktop/src/preload/management.test.ts apps/desktop/src/renderer/management`：初轮 6 文件 / 70 项通过。
- `pnpm typecheck`：初轮通过。
- `pnpm test`：开发阶段 **30 文件 / 204 项通过**；审查修复后主会话独立复跑 **30 文件 / 206 项全部通过**（含原 162 项回归）。既有 WebGL 用例仍输出 Three.js 重复导入警告，无新增失败。
- `pnpm typecheck`：最终通过。
- `pnpm --filter @agent-pet/desktop build`：通过，两个 HTML、两个 CJS preload 和 Main 构建完成。不是安装包/原生验收。
- `git diff --check`：通过。

新增/更新证据：

- `main/pi-preflight-files.test.ts`：29 项，实际临时 FS 验证包身份/版本/入口、有限扫描/路径深度/超时预算、symlink loop、缺失 CLI、元数据权限/大小、默认和手选目标、根入口/manifest/同名冲突、ignore/settings 未知、JSON 脱敏、目录只读权限、symlink/父路径/hardlink/目录/FIFO、检查→open 之间叶子替换；快照对比内容、mode、mtime 和目录条目无变更。FIFO 仅由测试工具 `mkfifo` 在合成目录创建；产品检测无子进程。
- `main/pi-preflight.test.ts`：9 项，真实服务和 FS 的显式读取、安装/配置分离；deferred module-boundary 故障注入验证旧扫描/检查/选择器、取消、退出、超时后的单 reader 占用，错误固定投影。
- `main/index.test.ts`：新增所有七个 IPC 的 pet 窗口/子 frame/失效 URL 拒绝、任意路径 payload 拒绝、Main 所属原生 picker 请求与取消。Electron 替身不是原生选择器证明。
- `preload/management.test.ts`：验证固定能力和精确 channel/参数，不暴露自由 invoke。
- `renderer/management/PiPreflightPanel.test.tsx`：3 项真实 React DOM controls，检测、radio、两个选择器入口、默认目标、显式检查、冲突/未验证/取消/脱敏反馈、初始快照/检查乱序与卸载。
- `ManagementApp.test.tsx`：更新 P2a 首页真实性，保留尺寸 slider 合并/延迟/失败/推送回归。主会话新增 detect/inspect 延迟请求→切页→返回→完成两例，修复前失败，保持面板挂载后通过。新增测试初轮 typecheck 曾因多余的 ByRoleOptions.exact 失败，已移除后全量 test/typecheck/build/diff-check 复跑通过。

## 尚未关闭的原生/发布门槛

本轮没有启动任何用户应用或隔离 Electron GUI；没有执行 pi、shell profile、安装、真实配置修改、登录项 API 或用户端点连接。选择器实际交互、取消手感、窗口焦点、辅助功能/键盘和真实文件系统挂载行为需要后续独立授权环境验收。没有凭 mock 宣称这些已通过。

P1 Dock 恢复与延迟退出修复代码保持不变；原生顶部菜单栏问题仍见 [P1 报告](DESKTOP-P1-FOUNDATION.md)。跨用户 ACL、并发父目录替换、安装事务/撤销、打包签名、公证、真实 pi 端到端均未完成，不进入 P2b/c。

独立只读审查确认 IPC、读取预算、保守结果、授权边界及可检索性；提出切页在途结果丢失问题，已按上述回归修复。审查时快照 `/tmp/agent-pet-p2a-review.patch` 包含当时 tracked diff/status 及新文件 diff，不包含主会话后续两例测试与修复，应以当前代码为准。最终阶段提交仅包含本阶段文件。

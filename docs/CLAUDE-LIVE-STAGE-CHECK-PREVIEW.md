# Claude 已启动但未连接：临时阶段检查预览

状态：2026-10-16 用户明确同意本预览。临时检查已完成并按摘要撤回，原dev已恢复。检查版及恢复后的原版均已通过真实启动、连接和首页陪伴验证。未找出先前等待的确定原因，不能宣称修复了连接缺陷。

## 执行进度

- 原dev通过本产品菜单正常退出，9477监听随后消失；没有操作Claude/pi。Renderer5476保持运行。
- 安装脚本验证通过，自有hook/Claude设置不变，替换时保留activation；备份和编译入口均独占新建。检查版以同一profile启动后，自有Store和hook再次通过校验，连接未暂停。
- 检查版初次就绪、尚未收到用户新开会话时，实际 `stages.log` 仅含 `APC1 main-started`，首页为空态；此时没有把旧Claude进程认领为在线。
- 用户新开普通Claude后，实际阶段为 `main-started → hook-started → activation-ready → receiver-seen → body-valid → anchor-accepted → http-204`，没有失败阶段；同一已知产品管理Renderer的类型化bridge只读结果为 `observing / observedRuns:1 / notice:none`。
- CUA旧绑定曾在上述结果之后返回空态旧图，重新绑定即看到连接页「已连接」。不能用该旧图证明同步故障或先前回调失败。用户确认首页宠物出现，Main重新绑定窗口后也核对了Claude配置的聚焦入口和真实GLB画面；截图在本次会话工具记录中，未以原型截图替代。
- 已正常退出检查版、通过脚本 `restore` 恢复原observer并只更新当前receipt中的该摘要，期间轮换的activation保留；重新启动原正式dev。复核 `observerRestored:true / originalMainUnchanged:true / observationEnabled:true`；首次类型化bridge为 `waiting / observedRuns:0 / notice:none`，符合重启不认领旧进程的约定。临时日志不再由当前Main/observer写入。
- 用户再次新开普通Claude后，**恢复后的原版**只读状态为 `observing / observedRuns:1 / notice:none / configured:true`。Main通过原生菜单打开管理窗口，实际首页存在对应Claude配置的聚焦入口和GLB宠物，实际截图留在会话工具记录中。最后复核原observer/原Main摘要和精确自有hook均通过，继续保持原dev与用户会话运行。
- 最后偏好摘要与初次设置时不同：在内存中用当前其他字段仅将petSize由80换为160，即匹配最初摘要，说明仅该字段变化；没有据此归因，也没有覆盖、恢复或回写偏好。配置时的「摘要相同」只属于当时检查结果，不能推广为整个实测期间始终相同。

## 检查前已知结果（历史）

- 用户以原程序完整路径启动，已进入 Claude 可输入主界面；`/hooks` 确认加载的 SessionStart 正是 Agent Pet 的自有 observer/activation 命令。
- 正式 dev 仍显示「等待启动」。私有 Store、精确自有 hook、启用状态及本机接收端 TCP 可达均通过。因此不能把 hook 已加载或端口可达当作已连接。
- 原回调/身份校验20项隔离测试通过；同一 Electron 程序运行原 observer、向自有隔离 HTTP 接收器发送虚构启动输入也通过，没有执行真实 Claude 或向日常接收器伪造事件。
- 当前无失败阶段证据，不猜测修复、不放宽身份校验、超时或权限保护。

## 准备好的材料与验证

独占0700目录：`/private/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-claude-stage-check-FbeUmB`。

现有0600文件：`observer-candidate.cjs`、`main-candidate.cjs`、`manifest.json`、`bootstrap.cjs`、空的 `stages.log`；`fixture/` 只用于自有输入/自有接收器验证，不是真实 Claude。原始程序/源代码不变。操作脚本：`.agent-work/claude-normal-start/stage-check/check.mjs`，通过 Node 的 transform-types 直接复用正式 Store/自有hook检查器。

- 候选 observer 的成功、403拒绝、坏JSON及子Agent四种输入均静默退出0，只记录固定阶段，未记录输入内容。
- 从候选Main提取原生接收器进行五项自有metadata验证：正确身份204、错误程序/查询失败/启动身份变化403、错误凭据401。原接受/拒绝规则保持。
- 安装/撤回脚本在独立profile闭环通过：原observer恢复、期间轮换的activation及共享settings保持；未将测试policy或进程绑定用于日常目标。
- 两份候选通过语法检查。准备脚本首次导入层级错误后修正；随后保护校验拒绝了同时匹配旧/新两种接收器的插入点，收窄到原生接收器唯一上下文后通过，没有删掉保护或用错误候选重试真实目标。

## 授权后精确操作

1. 仅正常退出当前 Agent Pet dev，保留用户已经运行的 Claude/pi，不发送任务、重载、关闭或控制它们。状态接收会暂时中断；不自动恢复 pi。
2. 核对以下私有目录仍完全匹配当前自有材料，且自有 hook 未被修改：
   `/Users/gan/Library/Application Support/@agent-pet/desktop/claude-normal-96b61d46-b8b4-4c45-bb1e-7415b4f6f312`。
   只读取该目录的既有五份文件、其祖先metadata、已授权的 `/Users/gan/.claude/settings.json`（至多64KiB），以及已知本产品编译文件。不枚举其他 Agent 文件，不读 auth、对话、会话或环境，不输出其他 hooks 或设置值。
3. 在上述独占临时目录新增0600 `observer-before.cjs`、`receipt-before.json`，保存精确自有材料的备份。**不备份凭据或复制用户设置，不自动恢复整份receipt。**
4. 仅把私有 `observer.cjs` 换成候选阶段检查版，更新 `receipt.json` 中该文件的摘要，保留其他摘要、程序、暂停状态及配置身份。原子替换先独占创建 `observer.install.pending.cjs`、`receipt.install.pending.json`（0600）再核对/rename；出现旧pending/改动/不确定结果就保留并停止。
5. 独占新增本产品编译入口 `/Users/gan/Desktop/🥷/agent-pet/apps/desktop/out/main/claude-stage-check.cjs`（0600），保持原 `out/main/index.cjs` 不变。以临时目录里的bootstrap启动同一Electron和同一日常profile，继续使用 Renderer5476；只在原生Claude接收器插入固定阶段记录，不改配置/会话/UI业务或接收规则。正常恢复会轮换该Claude自有 `activation.json` 与相应receipt摘要；不写Claude settings或任何pi材料。
6. 只向上述 `stages.log` 写固定白名单词，如 `hook-started`、`stdin-rejected`、`activation-ready`、`http-403`、`probe-failed`、`identity-changed`、`anchor-accepted`。读取记录上限16KiB；写入超过8KiB停止，多个自有进程同时写时最多额外保留有限个固定词。文件身份/权限改变就静默停止记录。**不记录时间、PID、路径、事件内容、session ID、工具/对话、请求头、凭据、原始错误或完整环境。**不把日志交给Claude、不联网。
7. 仍由用户自己在可信目录新开一个普通Claude会话（当前terminal暂用原程序完整路径），不要求关闭旧会话或发模型请求。只观察本产品hookPID→最多15级祖先以及核实后的确切ClaudePID的既有metadata；不扫描进程表、不读参数/环境/cwd。此次只做一次有界复现；仍不明时保留证据停下，不换协议或降级猜在线。

## 撤回临时检查

核对候选摘要未变，正常退出检查版dev。仅恢复备份中原 `observer.cjs`，在**当前**receipt中更新该摘要，保留期间轮换的activation/凭据、其他摘要和暂停状态；使用独占 `observer.restore.pending.cjs`、`receipt.restore.pending.json`。重新启动原正式 `out/main/index.cjs` 的同一profile dev。已修改/未知文件和失败现场保留，不自动修复或覆盖。

私有备份、临时日志及编译检查入口保留在本机，原settings/hook、用户Claude/pi配置和程序均不更改，没有依赖安装、模型费用、打包或推送。检查不代表接入修复，也不代表任务动作、桌面宿主或发布验收通过。

## 需要另行确认的原因

先前授权只包含一次配置时的五文件新建，未包含替换已安装 observer 或在真实会话路径增加临时记录。AGENTS/MVP要求这一步精确范围授权；[diagnosing-bugs](/Users/gan/.agents/skills/diagnosing-bugs/SKILL.md)在无法从现有隔离回路复现时要求取得“permission to add temporary production instrumentation”。

官方依据：[只读 /hooks 菜单与 hook 输入说明](https://code.claude.com/docs/en/hooks#the-hooks-menu)。官方文档仅解释能力，不代替当前真实回调证据。

# Claude CLI：先交付连接与陪伴

状态：连接与陪伴切片已接入正式 Main/连接页/首页，并在隔离 dev 验证；真实日常 Claude 前台接入仍待精确授权实测；用户要求的任务动作与提醒仍在后续范围，本切片不宣称全部Claude接入完成。执行入口与实际通过证据仍在[MVP计划](MVP-EXECUTION-PLAN.md)和[Claude验收](CLAUDE-CLI-ACCEPTANCE.md)。

## 可见行为

用户自己在终端运行接入入口，入口直接持有新Claude子进程，原样继承终端与用户参数。Main/UI只准备接入材料和显示命令，不能启动或控制Claude。保留正常HOME、用户hooks和配置，增加独立--plugin-dir；隔离验收的空HOME/setting-sources参数不能带入日常入口。已有Claude进程不被接管或重载。

确认直接子进程仍有效、且收到它的有效根SessionStart后，连接页显示“观察已连接”，首页显示中性宠物。进程退出或观察通道断开时离场。观察断开不证明Claude退出，不停止Claude；短命hook退出/SessionEnd不冒充整个进程退出。

本切片明确提示“当前支持CLI连接与退出，任务动作和完成提醒尚未启用”。不发布SessionObservation，不改Domain/Application，不用idle冒充未知。现有首页按配置投影，即使Session为空也能显示中性宠物。任务事实后续在验证运行/工作/子任务关联和终态后接入，所有动作仍可选。

## 实现边界

1. `integrations/claude-hooks/launcher.ts`：仅供用户终端入口调用；私有直接ChildProcess、每次新UUID/token、现有本机hook receiver。正式调用继承stdio；环境保留用户设置，但剔除所有继承的AGENT_PET_*，只向Claude添加三项hook环境，不泄露控制凭据。停止观察只销毁观察资源，不能发送进程信号。
2. `presence-channel.ts`：launcher→Main独立持久认证通道：每个配置绑定私有控制凭据；只接受child-started/hook-observed/child-ended枚举和runUUID。hook凭据不能登记运行、断言存活或开启配置。Main按有效控制通道+真实子进程开始+根hook已观察三者统计；多个运行部分退出不使其他运行离场。
3. `claude-presence.ts` / `claude-presence-store.ts`：Main Claude controller及配置接线：自有私有目录的材料预览/确认/监听/停用/选择性移除，保留PiConnection原入口/guard/撤回测试。共享配置增加Claude专用观察状态，不复用PiDeploymentPreview或伪造pi字段。
4. Renderer：独立Claude控件、无秘密的启动命令和范围说明；首页把有效Claude观察配置纳入中性投影。Renderer拿不到控制token/接收token或执行进程能力。

本机能力凭据模型不能宣称同UID进程隔离或完整跨用户安全通过。控制通道断开/桌面退出时，用户入口继续等待自己的Claude，不把桌面关闭变成Agent终止。重启需显式恢复，新接收器不能被旧运行/凭据自动认领。

## 文件与授权

接入材料限Agent Pet自有私有目录：manifest、runtime、用户入口和私有连接信息；真实创建前提供准确路径/权限/保存内容/激活与撤回预览，按AGENTS/MVP取得授权。不得修改Claude settings、shell profile或日常trust。活动入口仍可能调用插件，不能删除其runtime后留下坏hook；停用只撤销观察；移除本产品配置记录时保留运行文件，避免仍在运行的 Claude 调用失效 hook。本切片不自动清理运行文件；未知/修改文件阻止移除并保留重试记录。

## 验证重点

先用自有Node子进程和loopback验证启动失败、未收到根hook不出现、多个运行独立身份、部分退出、SessionEnd/Stop不冒充进程退出、控制凭据不继承、报告失败不终止Agent、退出清理和旧事件拒绝。然后分别验证控制通道、Main/连接/首页、停用/重启/移除，最后按精确范围验收真实前台Claude。初始化回调通过不能替代后续交互和任务状态验证。

## 当前程序兼容范围与入口

Main 只在用户选择程序后读取有界链接/metadata与 package.json，不执行程序、不扫描 Claude 配置。目前支持已原生验证的 npm Claude Code 2.1.301、`bin/claude.exe` 布局；其他版本/安装方式明确提示不支持。添加时选择的位置用于区别配置，不改变 Claude 的 HOME 或项目设置；实际工作目录和参数由用户终端决定。

`launcher-entry.ts` 是独立 CJS 入口，认证 Main 后才创建直接子进程。Electron 作为 Node 运行时，启动命令与插件 hook 显式设置 `ELECTRON_RUN_AS_NODE=1`；实际 Claude 环境移除此项。原生退出码/信号只返回终端，不推断任务成功。前台进程组原有 Ctrl-C 交给子进程，入口不重复转发。独立 PTY 测试覆盖此行为；分离/重新执行派生进程与后台模式不属于本切片支持范围。

每配置自有目录 `userData/claude-<UUID>`，目录0700、文件0600：`plugin/.claude-plugin/plugin.json`、`plugin/hooks/hooks.json`、`plugin/runtime/hook.cjs`、`launcher.cjs`、`activation.json`、`receipt.json`。激活文件含私有控制凭据，不能复制到诊断或Renderer；公开启动命令只含文件路径。重启不自动监听，显式恢复会轮换凭据，旧运行不能自动认领。校验/保存不确定时保留全部文件，不覆盖、清理或重试修复。

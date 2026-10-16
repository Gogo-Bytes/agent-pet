# Claude CLI：先交付连接与陪伴

状态：已确定的下一工程切片，进程绑定库已隔离实现，完整切片仍未完成；用户要求的任务动作与提醒仍在后续范围，本切片不宣称全部Claude接入完成。执行入口与实际通过证据仍在[MVP计划](MVP-EXECUTION-PLAN.md)和[Claude验收](CLAUDE-CLI-ACCEPTANCE.md)。

## 可见行为

用户自己在终端运行接入入口，入口直接持有新Claude子进程，原样继承终端与用户参数。Main/UI只准备接入材料和显示命令，不能启动或控制Claude。保留正常HOME、用户hooks和配置，增加独立--plugin-dir；隔离验收的空HOME/setting-sources参数不能带入日常入口。已有Claude进程不被接管或重载。

确认直接子进程仍有效、且收到它的有效根SessionStart后，未来连接页显示“观察已连接”，首页显示中性宠物。进程退出或观察通道断开时离场。观察断开不证明Claude退出，不停止Claude；短命hook退出/SessionEnd不冒充整个进程退出。

本切片明确提示“当前支持CLI连接与退出，任务动作和完成提醒尚未启用”。不发布SessionObservation，不改Domain/Application，不用idle冒充未知。现有首页按配置投影，即使Session为空也能显示中性宠物。任务事实后续在验证运行/工作/子任务关联和终态后接入，所有动作仍可选。

## 实现边界

1. `integrations/claude-hooks/launcher.ts`：仅供未来用户终端入口调用；私有直接ChildProcess、每次新UUID/token、现有本机hook receiver。正式调用继承stdio；环境保留用户设置，但剔除所有继承的AGENT_PET_*，只向Claude添加三项hook环境，不泄露控制凭据。停止观察只销毁观察资源，不能发送进程信号。
2. launcher→Main独立持久认证通道（尚未实现）：每个配置绑定私有控制凭据；只接受child-started/hook-observed/child-ended枚举和runUUID。hook凭据不能登记运行、断言存活或开启配置。Main按有效控制通道+真实子进程开始+根hook已观察三者统计；多个运行部分退出不使其他运行离场。
3. Main Claude controller及配置接线（尚未实现）：自有私有目录的材料预览/确认/监听/停用/选择性移除，保留PiConnection原入口/guard/撤回测试。共享配置增加Claude专用观察状态，不复用PiDeploymentPreview或伪造pi字段。
4. Renderer（尚未实现）：独立Claude控件、无秘密的启动命令和范围说明；首页把有效Claude观察配置纳入中性投影。Renderer拿不到控制token/接收token或执行进程能力。

本机能力凭据模型不能宣称同UID进程隔离或完整跨用户安全通过。控制通道断开/桌面退出时，用户入口继续等待自己的Claude，不把桌面关闭变成Agent终止。重启需显式恢复，新接收器不能被旧运行/凭据自动认领。

## 文件与授权

接入材料限Agent Pet自有私有目录：manifest、runtime、用户入口和私有连接信息；真实创建前提供准确路径/权限/保存内容/激活与撤回预览，按AGENTS/MVP取得授权。不得修改Claude settings、shell profile或日常trust。活动入口仍可能调用插件，不能删除其runtime后留下坏hook；停用只撤销观察，用户正常退出后再校验选择性移除。未知/修改文件保留。

## 验证重点

先用自有Node子进程和loopback验证启动失败、未收到根hook不出现、多个运行独立身份、部分退出、SessionEnd/Stop不冒充进程退出、控制凭据不继承、报告失败不终止Agent、退出清理和旧事件拒绝。然后分别验证控制通道、Main/连接/首页、停用/重启/移除，最后按精确范围验收真实前台Claude。初始化回调通过不能替代后续交互和任务状态验证。

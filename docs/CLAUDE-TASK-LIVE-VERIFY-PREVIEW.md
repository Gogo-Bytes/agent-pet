# Claude 任务反馈实测：dev 状态记录预览

2026-10-19。此前已授权的12组任务hooks升级完成，新会话在线已由用户确认。此次仅继续验证任务动作，不重新安装hooks。

- 正常退出并重开同一userData的Agent Pet dev，启用已有的 `AGENT_PET_DEV_EVIDENCE_DIR`。会短暂断开观察、清空当前气泡；不操作Claude/pi，pi保持手动恢复规则。Claude需要用户新开会话以重新产生启动事件。
- 独占新建 `/Users/gan/Desktop/🥷/agent-pet/.agent-work/claude-task-live-20261019`（0700），仅生成 `states.ndjson`（0600，最多128KiB）。只记录时间、每次运行重新生成的匿名编号、在线/状态/动作类别和能力标志。不记录名称、原生session/prompt/tool编号、工作路径、对话、工具内容、token或服务地址。它观察应用状态，若另有已接入会话则同样只记录这些白名单字段。
- 现有 `dev-observation-evidence.ts` 直接投影字段白名单，不新增生产日志、不替换observer、不改settings/hooks。不扩大Agent进程核对范围，不读取会话/对话文件。
- 原已授权测试目录 `/tmp/agent-pet-claude-task-20261018-a83c9f` 在系统重启后消失，已按原精确范围排他重建目录及source.txt。随后由用户自己在Claude发送限定读写/查找/命令任务，是否允许工具权限与模型费用由用户决定；Agent Pet仅观察。
- 完成后正常退出记录版dev，重新以未启用记录的相同dev启动；记录仅保留本机，不进Git，不自动清理用户文件。保留现有token、hooks和连接配置，不打包、不安装、不自动发任务。

AGENTS/MVP要求新增真实记录范围另行授权；原升级预览包含任务目录和hooks，但不包含这个状态记录文件。

## 执行结果

用户明确授权“允许记录并继续验证”，任务由用户操作。已收到读取、写入/修改、Bash执行和模型出错反馈；Glob/Grep在当前会话不可用，未验证。详细结果见 [任务记录](CLAUDE-TASK-OBSERVATION.md)。完成后正常退出记录版、切回未启用记录的同一dev，记录停止增长。没有修改token、hooks或连接配置，没有打包；原始匿名记录仅保留本机。

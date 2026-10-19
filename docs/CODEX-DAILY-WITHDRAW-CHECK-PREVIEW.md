# 日常 Codex 接入撤回对照预览

2026-10-19，用户已按本页精确范围授权，正在执行。目的：用户怀疑本次写入导致Codex被终止，用撤回自有hooks的对照区分；不预先断言与接入无关。写入前未运行日常CLI启动基线，之前隔离--version的SIGKILL不能替代此前基线。

已只读核对Main私有receipt/state与当前hooks：原hooks文件不存在，当前hooks.json仅有本次10个事件/10组且命令全部精确匹配本产品。原pi/Claude配置记录保留；日常任务验证尚未完成。

## 一次撤回范围

- 正常运行的同配置dev中暂停Codex接收，或调用同一Main CodexConnection.disable入口（不启动/退出任何Agent）。仅更新原codex-registration-<已保存Codex UUID>/state.json/receipt.json及既定pending/next保存材料，保留其他配置、归属与原备份。
- 只读核对 /Users/gan/.codex/hooks.json（最多64KiB）、祖先metadata与本产品ownership；使用现有Main withdrawCodexUserHook选择性撤回精确匹配的10组通知。其他字段/组/用户改动保留；与刚才核对不一致则停止。原createdHooks/createdEvents只用于撤回本次新增结构，文件会保留为有效JSON（若无其他字段则为{}），不删除用户文件，不整份恢复旧备份。
- 通过原模块独占hooks.agent-pet.pending.json、原字节/身份再核对、fsync后保存，保持原权限；不改 /Users/gan/.codex/config.toml、不读写auth/token/会话/其他hooks来源、shell或程序，不重签名、不清除安全属性、不重装、不打包。
- 应用Codex配置条目、原始hooks备份、observer/activation/hook/receipt和ownership均保留，不调用配置列表remove、不删除私有目录。此次暂停后重启不自动恢复接收。撤回后不能直接点击“继续连接”恢复已撤回的hooks；若需恢复，另用原已核对命令/保存材料制定明确预览，不静默重建。
- 由用户在同一个终端运行codex一次，告诉我是否仍然显示killed；不要求登录、信任或发送模型任务。我不自动执行日常CLI。若仍失败，不把它归因于hooks，也不自行扩大修复范围。

这是日常写入的逆向操作，原“保留连接配置”不等于授权撤回hooks；依据AGENTS.md“真实目标操作仍需精确范围、预览与授权”单独确认。现有程序/配置未被此次核对修改。


当前停点：正式管理窗口可读，AX点击Codex行仅改变原生控件选择标志而页面仍显示pi；Raise后截图确认仍为pi详情，改用该截图坐标点击返回windowNotFoundAtPosition。按有界恢复规则停止自动点击，已请用户在Codex详情的更多操作中手动“暂停连接”，未点移除。尚未调用withdraw，待确认暂停持久化后才执行原Main选择性撤回。未执行CLI或修改hooks。


撤回对照已完成：用户手动暂停后Main receipt/state确认disabled=true/removed=false，使用原withdrawCodexUserHook撤回成功。hooks.json保留空对象、配置列表摘要不变、pi/Claude与私有恢复材料保留。用户在同一终端仍遇到killed，未能确认根因。之后用户明确要求“重新恢复，我再换个终端试试”，授权恢复刚撤回的原10组通知与接收，取消尚未执行的程序副本诊断。

恢复精确范围：从原codex-registration的有效receipt/state读取既有ownership.command，要求原目标 /Users/gan/.codex、原记录disabled且未removed、原original=null；当前hooks.json必须为刚才空对象（或已精确恢复），存在用户新内容即停。使用原prepareCodexUserHook/applyCodexUserHook追加同样10事件、同样命令和2秒超时，通过原pending/身份校验写入；不用新ownership覆盖保存的原始备份。恢复后用原inspect核对旧ownership有效，并在当前dev调用正式“继续连接”恢复接收，私有activation/receipt按原规则轮换。配置列表和其他Agent/hooks保持；不执行Codex、不改config.toml/登录/shell/程序，不重装/重签名/打包。此操作属于用户明确要求恢复的已知同一范围，不重复请求添加授权。


恢复执行结果：原Main guard核对paused/未removed/original=null、空hooks后，prepare/apply恢复原10事件/原命令，旧ownership再次inspect通过；配置列表摘要不变、原备份保留，私有记录仍paused。原生AX仅提供窗口/菜单，无页面按钮；Raise后重读仍无页面节点，dev会话71349仍运行，停止自动恢复按钮路径。已请用户手动“继续连接”后在全新终端标签运行codex，暂不发任务；不能把hooks已恢复表述为接收已恢复，待用户操作核验。


用户随后确认“已恢复接收，Codex能正常启动”（换全新终端标签）。有界核对确认原registration receipt有效、disabled=false/removed=false、原备份保留，10事件命令匹配，pi/Claude/Codex三条记录仍在。恢复hooks后新终端能启动，不能据此认定旧标签的具体故障原因，尤其此前隔离--version也收到SIGKILL；不追加未经验证的因果结论。已请用户在新Codex中审核自有通知并发送原授权的一次无工具测试，真实在线与首页宠物待核验。

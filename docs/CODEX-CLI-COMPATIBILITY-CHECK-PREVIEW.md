# Codex CLI 本机兼容性检查预览

2026-10-19，用户已精确授权，隔离版本/帮助检查完成。

## 此次做什么

只对 `/Users/gan/.local/bin/codex` 执行一次 `--version`，成功识别版本后执行一次 `--help`。每条最长3秒，合计输出最多64KiB/条；stdin关闭，不传任务，不加载自有hook，也不启动交互会话。参数不支持、超时或失败就停止，不改用其他模式。

执行前逐层检查入口及祖先metadata、最多8层链接；链接目标只能落入原入口或 `/Users/gan/.codex/packages/standalone` 安装范围。每次解析最多128次metadata操作，最多三次解析；不枚举目录、不读安装目录之外的文件正文。再次执行前核对文件身份未变化。此次不读取 `.codex/config.toml`、hooks、auth、数据库、会话或对话，也不读取其他Agent配置。

独占创建 `/tmp/agent-pet-codex-check-20261019-e724a1`（0700），内含home/config/cache/tmp/work。HOME、CODEX_HOME、XDG_CONFIG_HOME、XDG_CACHE_HOME、TMPDIR均指定到该目录，PATH固定为系统目录；不继承凭据、代理、模型或其他应用环境。CLI可在隔离目录产生自己的初始化文件，不复制到日常目录。

脚本只保存可识别版本、固定选项是否出现、是否提及hook、退出/超时类别与输出字节数，写入独占的result.json（0600）。不保存任意输出全文或错误内容。超时/输出超限只停止本次创建的进程组。目录已存在就停止，不覆盖或清理。

执行命令：

```sh
node integrations/codex-hooks/test-support/cli-check.mjs --run-authorized-check
```

[可审查脚本](../integrations/codex-hooks/test-support/cli-check.mjs)已通过7项隔离测试，仅启动自有Node fixture，无Codex执行。

## 结果边界

版本/帮助只能确定下一步可用入口，不能证明hook已加载、信任通过或任务状态有效。后续实际加载将另列具体参数及精确范围；不会使用绕过hook信任的参数。此次不登录、不发模型请求、不更新安装、不改日常配置、不操作现有Agent/dev、不打包。

AGENTS.md要求“真实目标操作仍需精确范围、预览与授权”。此前版本帮助和升级授权已按各自预览执行结束，不包含本次新目录和再次执行。

## 实际结果

用户确认“允许此次隔离检查”后按固定脚本执行。版本命令退出0，18字节，识别0.163.0；帮助命令退出0，5849字节，包含--config、--no-alt-screen、--version、--help且提及hooks。未保留原始输出；result.json仅含上述白名单摘要。独占目录0700、结果0600。没有超时或重试，没有启动交互会话、加载hook、读写日常配置或重启dev。

这只能证明本机入口和帮助可用，不能确定事件字段、信任状态、在线或任务反馈。后续先准备可审查的隔离hook加载方案，再对新增的真实操作单独确认。

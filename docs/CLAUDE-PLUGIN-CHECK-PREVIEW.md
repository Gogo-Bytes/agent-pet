# Claude 原生插件语法检查预览 · 2026-10-16

状态：用户已精确授权，本次原生校验完成。此步骤不部署、启用或启动Agent会话。

## 可审查产物

本地实现提交`8a2d86b`。修复版插件已编译在`/tmp/agent-pet-cli-update-20261016-f42c8a/claude-plugin-check/plugin`：

- `.claude-plugin/plugin.json`：仅名称、版本、介绍和作者。
- `hooks/hooks.json`：12个被动事件的command hook，不输出许可/上下文/继续执行指令，不含凭据或运行身份。
- `runtime/hook.cjs`：受限stdin的独立Node脚本，无文件读取或落盘。

三文件SHA256已写在相邻`artifact-digests.json`，运行前核对。此处使用新修复产物，不使用上一轮带STOPPED标记的旧插件。

## 唯一允许命令及隔离范围

固定已更新入口：`/Users/gan/.nvm/versions/node/v22.18.0/bin/claude`，实际版本2.1.301。最多一次执行参数数组：

```text
plugin validate /tmp/agent-pet-cli-update-20261016-f42c8a/claude-plugin-check/plugin
```

最长5秒、输出最多64KiB、stdin关闭。只核对固定入口/必要祖先与当前程序metadata、上述自有三个文件摘要；不扫描其他安装。HOME、CLAUDE_CONFIG_DIR、XDG_CONFIG_HOME、XDG_CACHE_HOME、TMPDIR和cwd均在`claude-plugin-check`对应已创建的home/config/cache/tmp/work目录；明确最小PATH、LANG=C、NO_COLOR=1、DISABLE_AUTOUPDATER=1、CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1。无继承凭据、API key、接收token或运行ID。校验结果仅保存在该自有目录，0600；输出保留校验错误/警告所需内容，不输出环境或凭据。

不读写日常`~/.claude`、`~/.codex`、`~/.gemini`、pi或项目Agent配置；不加载插件到会话，不运行hook、不启用/安装插件，不登录、不发模型请求、不更改信任，不重启dev/现有Agent、不打包。若要求初始化/登录/额外读取则停止，不换命令绕过。

成功仅说明当前CLI接受插件文件格式；运行身份、原生字段、在线、动作和真实任务仍需后续分别验证。

AGENTS.md引用的MVP计划要求真实目标操作具备精确范围/预览/授权；之前版本/帮助授权与本轮程序更新不包含原生插件校验，故单独确认此命令。

## 实际结果

固定2.1.301入口在隔离环境执行一次，退出0、147字节输出，结果为`Validation passed`，没有警告。结果保存于`claude-plugin-check/validation-result.json`（0600）。原生输出只宣告manifest校验通过；不据此声称hooks实际执行、12个事件均兼容或Agent Pet在线。没有启动会话、运行hook或更改日常配置。

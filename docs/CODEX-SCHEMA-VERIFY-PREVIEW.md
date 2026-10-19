# Codex 本机接口格式与空会话复验

2026-10-19，待本次精确授权。此前r1初始化成功，但空会话RPC被拒绝，未收到hook。错误全文未保留，暂不能判断是参数、登录或信任问题。现有代码已补固定错误分类及本机schema选择，避免猜参数。

## 唯一执行入口

```sh
node integrations/codex-hooks/test-support/native-start-check.mjs --run-authorized-check
```

[脚本](../integrations/codex-hooks/test-support/native-start-check.mjs)本次独占创建 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2`（0700），不认领已有目录，不覆盖原首轮/r1结果。home/config/cache/tmp/work/runtime及schema全部在此目录。产品编译文件、hooks.json、仅ephemeral凭据和禁启动更新的config.toml仍0600；不改日常文件。

读取安装范围仍仅 `/Users/gan/.local/bin/codex` 到 `/Users/gan/.codex/packages/standalone` 的程序链接及必要祖先metadata；最多三次解析，每次128次metadata/8次链接，前后核对同一文件身份。不枚举或读取日常config/hooks/auth/会话/对话。

隔离HOME/CODEX_HOME/XDG/TMPDIR和最小环境保持，不继承凭据/代理/模型配置；使用已实测的sandbox-exec规则，仅允许IPv4回环，外部网络被拒绝。禁止绕过信任、登录、安装、更新或操作原Agent/dev。

## 最多两次本机程序调用

1. 在系统网络沙箱内执行固定程序的 `app-server generate-json-schema --out <r2>/schema`，最多10秒、合并输出64KiB；只导出该版本的公开协议定义，不启动会话或任务。失败就停止，不换命令。Codex自身生成的schema文件仅保留在隔离目录。
2. 有界读取本次生成的固定候选 `v2/ThreadStartParams.json`、`ThreadStartParams.json`、`SandboxMode.json`、`v2/SandboxMode.json`、`codex_app_server_protocol.schemas.json`，每份最多16MiB，拒绝文件/目录链接；不跟随schema中的任意外部路径。仅当协议明确包含read-only或readOnly只读枚举时，才在相同网络沙箱下执行 `app-server` 创建一个空会话。只发送initialize、initialized、thread/start，参数仍本次work、never审批和本机schema确认的只读模式。最多10秒、合并输出128KiB。没有turn/start、提示词、工具任务、旧会话访问或模型请求。未知schema直接停止，不替换为可写模式。

两次调用均只管理自身创建的进程组；超时只终止该组，不碰原Codex/Claude/pi或dev。检查器只启动一次临时127.0.0.1接收器，凭据与运行编号仅在内存；退出关闭。启动成功但没有hook仍未通过。遇到权限、信任、登录或版本阻碍，停止并报告，不自动批准或换模式。

## 输出与依据

result.json独占0600。除原有白名单字段外，只增加固定RPC错误类别、有界整数错误码与所用只读枚举；不保存任意错误消息、stdout/stderr、路径、原生编号、对话或凭据。生成的公开协议schema只用于本机兼容检查，不提交用户材料。

代码及自有进程测试已准备，不打包、不重启dev、不读写日常设置。协议导出入口见 [官方App Server文档](https://learn.chatgpt.com/docs/app-server#message-schema)。schema是本机版本依据，当前网页示例不直接作为该版本参数保证。

AGENTS.md要求真实目标操作有精确范围、预览与授权；之前r1只含一次空会话检查，本次新增协议导出、固定schema读取和r2目录，因此确认本次范围。无需你登录或发送任务。

本次准备代码验证：20项检查程序测试、pnpm typecheck、desktop源码build通过；未执行r2、未打包。

# Codex 原生事件加载：隔离检查预览

2026-10-19。首轮已按精确授权执行，因沙箱规则语法错误在初始化前退出；本页的r1目录复验待授权，尚未启动本机Codex会话。

## 目的

核对已安装0.163.0是否实际识别自有hook文档、是否需要信任，以及启动事件的字段。使用新建的隔离app-server测试它自己的空会话；不把这个进程当成对现有CLI/桌面会话的旁路订阅，也不据此启用正式连接。

## 执行范围

运行已准备的 [脚本](../integrations/codex-hooks/test-support/native-start-check.mjs)：

```sh
node integrations/codex-hooks/test-support/native-start-check.mjs --run-authorized-check
```

- 核对 `/Users/gan/.local/bin/codex` 和 `/Users/gan/.codex/packages/standalone` 内程序链接及必要祖先metadata，每次最多128次metadata/8次链接，前后两次解析；不枚举日常配置、不读其config/hooks/auth/会话或对话。
- 独占创建 `/tmp/agent-pet-codex-start-20261019-5f92c8-r1`（0700）。home/config/cache/tmp/work/runtime都在此处。现有Vite将本产品observer、文档生成器、检查器编译到runtime（0600），独占写入config/hooks.json（0600）及config.toml（0600，仅将凭据存储设为ephemeral、启动更新检查设为false）。不安装依赖、不修改原安装和日常配置。
- 使用明确的隔离HOME/CODEX_HOME/XDG/TMPDIR、系统PATH，不继承token、代理或模型配置；隔离配置使用内存凭据模式，不加载钥匙串登录。仅新建一个内存随机凭据的127.0.0.1接收器，凭据和运行编号不落盘。
- 仅通过 `/usr/bin/sandbox-exec` 启动上述Codex，参数为 `app-server`。网络沙箱禁止外部网络，只允许127.0.0.1供本产品hook回调；沙箱不可用就停止，不去掉沙箱重试。
- 标准输入只发送initialize、initialized、thread/start。thread/start指定本次work、never审批和readOnly沙箱，仅创建空会话；不发送turn/start、提示词或工具任务。不登录、不复制凭据、不查询/恢复旧会话，不绕过hook信任、不代为响应审批。
- 最长10秒，合计输出最多128KiB。收到thread/start结果、RPC错误或服务端请求就停止，只向本次新建进程组发送SIGTERM；1秒未退出才SIGKILL。原Claude/pi/Codex和当前dev不操作。

凭据隔离依据 [官方身份验证说明](https://learn.chatgpt.com/docs/auth) 的ephemeral模式；线程初始化与开始任务的区别见 [App Server文档](https://learn.chatgpt.com/docs/app-server)。

## 记录与结果判断

result.json独占0600，仅保存初始化/空会话是否成功、RPC错误/服务端请求是否出现、固定退出类别、输出字节数，以及最多32条归一化事件种类/source和身份字段是否存在。不保存stdout/stderr全文、原生编号、路径、对话或凭据；不读transcript。

启动成功但hook未回调仍记未通过。若hook需要信任、要求登录、拒绝沙箱或有版本差异，就保留隔离目录和结果，停在具体问题；不会换模式或发模型请求绕过。空会话文件可能由Codex保存在隔离目录，保留不复制。继续dev，不打包。

AGENTS.md要求“真实目标操作仍需精确范围、预览与授权”。此前仅授权版本/帮助，本次新增真实加载自有hook与创建隔离空会话，因此需要此范围确认。代码实现和自有Node测试已经完成，不需要你参与；只有本次原生执行等待授权。

## 隔离验证与审查

自有Node进程验证初始化/空会话请求、RPC错误、服务端请求、超时及同组后代清理。独立审查初审复现了组长close提前取消SIGKILL与publish抛异常打断会话清理两项P2；均已修复并补回归，独立17项复验通过。随后一次Codex聚焦测试因“SIGKILL返回后PID必须立即消失”的断言失败；终止与进程回收是异步的，改为自有后代心跳停止的行为断言，原始丢失SIGKILL仍会持续写入而失败，17项复验通过。没有删掉失败场景或放宽生产超时。以上当时未执行安装Codex或验证系统沙箱；本次新增的系统沙箱结果见下方。

最终全量1226 passed /1 skipped /102 files；pnpm typecheck、desktop源码build通过，未打包。上述两个清理问题修复后再次全量通过；仍未执行本机原生加载。

## 首轮真实尝试与r1修复

用户已确认首次预览。原独占目录 `/tmp/agent-pet-codex-start-20261019-5f92c8` 的result.json保留：initialized=false、threadStarted=false、rpcError=false、serverRequest=false、outcome=closed、stdoutBytes=0、stderrBytes=123、events=[]。未收到事件，不标为加载通过。

只用系统 `/usr/bin/true` 做一次有界最小复现，原规则被sandbox-exec拒绝：network address的host必须使用*或localhost，原127.0.0.1字面量非法。唯一假设修复为ip规则使用localhost（仍为IPv4本机回环）；相同true复验退出0。自有Node网络测试实际证明127.0.0.1连接成功、TEST-NET-1保留地址192.0.2.1:443被EPERM拒绝；已加入真实macOS回归。没有去掉沙箱、扩大网络或重试Codex。

13项检查程序测试、pnpm typecheck、desktop源码build通过，未打包。原目录和失败结果不覆盖，脚本改用上文r1新目录，其他原生执行范围不变；新增目录及再次尝试在此请求精确确认。

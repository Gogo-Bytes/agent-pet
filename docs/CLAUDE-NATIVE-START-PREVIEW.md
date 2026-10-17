# Claude 原生启动回调隔离检查 · 2026-10-16

状态：用户已精确授权；本次隔离启动检查已完成。本轮CLI更新、manifest校验均通过；这里新增实际插件加载，单独确认。

## 目的与唯一启动命令

[官方文档](https://code.claude.com/docs/en/hooks#setup)规定`--init-only`运行Setup/SessionStart后退出，不开始对话。使用固定已核对的Claude2.1.301入口一次，参数数组：

```text
--init-only --setting-sources "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --plugin-dir /tmp/agent-pet-cli-update-20261016-f42c8a/claude-plugin-check/plugin
```

不是在终端拼接上述字符串；[检查脚本](/tmp/agent-pet-cli-update-20261016-f42c8a/claude-plugin-check/start-check.mjs)使用spawn数组。最长15秒，stdout+stderr最多64KiB、stdin关闭，超限只停止本次新建进程组，不接触当前Agent。参数若不支持、要求登录或加载失败就停止，不换模式/发提示词绕过。

## 精确目录与数据范围

独占创建`/tmp/agent-pet-claude-start-20261016-6ab73f`（0700），下含home/config/cache/tmp/work；若已存在就拒绝。HOME、CLAUDE_CONFIG_DIR、XDG_CONFIG_HOME、XDG_CACHE_HOME、TMPDIR、cwd全部在此处。仅自有插件及collector源码由已通过测试的正式模块编译，先核对三文件摘要。禁用user/project设置来源、未配置MCP、无用户提示词或额外Agent功能。

只启动一个自有127.0.0.1临时端口接收器，随机token和运行UUID仅在本次父进程及新建CLI/hook环境内，退出即退役；不保存秘密。只接受父进程明确创建且仍有效的运行，不用会话编号或hook PID猜身份。

回调仍经正式双重白名单，只保存事件类别/source、身份字段是否存在、退出码/超时类别；不保存原生会话/工作编号、路径、正文、工具内容、stdout/stderr全文或token。结果保存在新目录的result.json（0600），已有文件不覆盖。CLI可在新隔离目录产生初始化文件，保留、不复制到日常配置。

不读写日常Agent设置/凭据/对话，不读取transcript，不加载日常插件，不登录、不提交模型请求、不安装依赖、不修改信任；不部署到HOME、不重载已有Claude/pi、不重启dev、不打包。成功仅证明本次隔离启动的SessionStart回调，工作/子任务身份、日常配置、在线表达、真实任务和正式UI仍需后续验收。

AGENTS/MVP要求真实加载有精确范围与授权；此前仅授权版本更新与manifest校验，因此本次实际调用hook另行确认。

## 实际结果

一次固定参数启动退出0、stdout/stderr共0字节；收到正式脚本投递的真实`session-started`（source=startup）和`session-ended`。两事件都有原生会话编号，本次未提交prompt，因此没有prompt_id/agent_id不能据此判定相应能力不支持。接收绑定仅在父进程实际创建的child仍有效时接受，退出立即退役，没有靠native会话编号或hook子进程PID猜运行。

结果位于`/tmp/agent-pet-claude-start-20261016-6ab73f/result.json`（0600），仅事件枚举/source和身份存在布尔值。临时端口已关闭，token/UUID未落盘，没有模型任务、日常配置修改、Agent Pet/dev或原Claude/pi重启。CLI自身产生的隔离初始化文件保留。

本结果证明修复版被本次隔离Claude实际加载且发送启动/结束回调，不证明正常交互任务、原生工作/子任务编号、成功/失败/取消/等待、日常配置部署、正式在线状态或UI通过。不能用此次短命初始化运行创建长期在线宠物。

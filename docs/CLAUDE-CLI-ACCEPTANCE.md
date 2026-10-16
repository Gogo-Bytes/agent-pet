# Claude Code CLI 实施与验收 · 2026-10-16

状态：**输入白名单与本机回调传输已实现并隔离验证；尚未接通真实Claude，不注册Main/连接页面，不部署hook。** 仍使用dev，不打包；日常配置、pi和既有Agent进程保持原状。

## 当前范围与实施顺序

用户最新要求：Claude Code CLI → Codex CLI → Antigravity CLI；全部CLI先做，Codex桌面端与Antigravity桌面端最后分别验证。不从一种宿主的通过推断另一种通过。未实施的新Provider继续如实显示不支持，不把新增类型/安装metadata当作在线连接。

## 已实施与隔离证据

- 第一阶段6f03314已实现Claude安全输入白名单；当前补充保留原生prompt_id和子任务agent_id，缺失时不补造，agent_type不当作子任务身份。原生会话编号不是进程运行编号。
- transport.ts的发送端先丢弃原始内容再传输，接收端再严格校验，只接受安全事实。固定127.0.0.1、临时端口、独立凭据和运行身份许可，禁止浏览器来源、任意URL/重定向/额外字段；没有落盘凭据或安装器。pi原传输及managed guard完全未改。
- 外部可信运行绑定是必需依赖，消息本身不能认领一个运行。退役运行先拒绝，再处理近期去重。接收先后不冒充原生因果顺序；短命hook连接断开不发Agent离线，Stop/工具错误/工具中止不冒充整轮成功或取消。
- 独立Architecture指出工作编号/子任务/Stop终态限制，已按保守语义保留，缺可靠信号不接到SessionObservation。独立Review复现了async回调被提前成功确认、关闭重入后仍回调两处问题；Main先用真实loopback红测试复现，再约束同步提交和停止后拒绝处理，并覆盖JS错误调用的拒绝Promise清理。

当前相关41项测试通过；全量`pnpm test --maxWorkers=2`为805 passed / 1 skipped / 80 files，`pnpm typecheck`和`pnpm --filter @agent-pet/desktop build`通过。独立Review另复验41项通过，文档可恢复性审查通过。build仅编译，没有打包。测试均为合成官方形状及自有loopback服务，无真实Agent、HOME、凭据、会话或模型任务。

实现和可恢复契约以 [模块README](../integrations/claude-hooks/README.md)、[输入代码](../integrations/claude-hooks/normalize.ts)、[传输代码](../integrations/claude-hooks/transport.ts) 及行为测试为准。此处不复制协议阈值或数据schema。

## 尚缺的正式接入条件

1. 核对本机CLI能力及实际加载的版本：用户已按[精确预览](CLI-VERSION-HELP-CHECK-PREVIEW.md)授权执行版本/帮助；Claude实际返回2.1.143并支持`--plugin-dir`。检查脚本重复核对路径耗尽96次metadata预算，Codex/agy已跳过、未执行；版本仍未确认。没有借此加载插件或启动会话。
2. 证明原生producer的运行身份与工作/子任务关联；运行身份不可来自hook子进程PID，缺失prompt_id不能归到“最近一轮”。本机2.1.143是否提供这些字段尚未验证。
3. 在允许的原生接口上建立诚实的生命周期与在线表达：没有后置结束证据时，Stop不是completed-unread；等待提示、实际工作、整个任务失败和取消分别验证，不用定时器补造。
4. 再接Main的Provider controller、Configurations和正式UI，明确预览/授权、激活与重启恢复、选择性撤回和现有设置保留；部署代码与隔离验证必须先完成，再申请真实目标变更。
5. 真实CLI验证通过后再依次做Codex CLI、Antigravity CLI。桌面端保留在最后；不自动启动已有Agent、发送模型请求或替用户操作任务。

当前没有可供用户安装的hook命令，也没有新的成功连接操作。真实Claude支持、其他CLI支持、桌面端支持与发布验收全部保持未通过。

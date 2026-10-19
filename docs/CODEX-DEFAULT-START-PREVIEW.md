# Codex 默认后台模式：隔离实测预览

2026-10-19。正式连接页/Home代码与隔离测试已准备；本页所列真实默认模式**尚未执行**。日常 Codex 配置、hooks、登录和当前会话不在本次范围内。

## 为什么这次需要不同的运行范围

前两轮已通过的是`--no-daemon`前台模式。默认模式由官方后台进程调用通知，不能用前台结论代替。相同版本[后台路径解析](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server-daemon/src/lib.rs#L325)以CODEX_HOME区分自己的状态和socket；[程序选择](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server-daemon/src/managed_install.rs#L20)可能使用独立的packages/app-server-daemon安装。Main已补固定入口的metadata核对，不按进程名称猜在线。

此前默认后台在macOS sandbox-exec内因系统ps检查报EPERM。此次准备的检查**不使用该OS沙箱**，避免再次测试同一已知权限障碍；因此不能承诺操作系统阻止全部外网。仅使用新隔离HOME、ephemeral登录存储和本机模拟Provider，不提供任何本机登录凭据或模型密钥。固定任务只送本机服务；原生初始化可能正常联网。这个变化须得到本次明确同意，不能沿用前次“外网禁止”授权。

## 固定范围

运行：`node integrations/codex-hooks/test-support/default-start-review.mjs --run-authorized-default-start`

- 只按既有有界链接/metadata规则解析`/Users/gan/.local/bin/codex`及`/Users/gan/.codex/packages/standalone`内实际程序；读取并**复制这一份程序文件**（最多512MiB），比较SHA256和复制前后身份。不是运行安装器，不复制原配置/凭据/用户内容。
- 独占新建`/private/tmp/agent-pet-codex-default-20261019-61d04a`，子目录home/config/cache/tmp/work/runtime/data（700）。所有本产品文件600、helper/复制程序700。若根目录存在直接停止，不清理或覆盖。
- runtime/configurations.cjs、native-hook.cjs、process-probe来自本仓库源码/本次源码构建；不安装依赖。
- config/packages/app-server-daemon/releases/0.163.0/bin/codex为隔离复制程序；current只链接到**此隔离release**，不链接日常安装。只执行隔离副本，避免后台安装选择或更新改动原程序。它仍须通过Main的正常程序布局/归属核验。
- config/config.toml只放ephemeral登录存储、关闭启动更新检查、固定本机模型Provider和重试上限；hooks.json只追加本产品10条通知。官方Codex可以在这份隔离CODEX_HOME内生成自己的UI/信任/运行/会话文件，内容仅为本次固定模拟任务；本产品不读取其会话/正文文件，不从日常HOME复制任何材料。
- data/configurations.json及本次新UUID对应的codex-registration目录(state.json/receipt.json，含隔离原hook备份)、codex-normal目录(observer.cjs/activation.json/hook.json/receipt.json)只由正式Main模块创建。重启按正常校验轮换私有接收记录，保留hooks。
- default-result.json仅保存阶段、计数、退出码、身份核验后的连接布尔值、接收器恢复/命令保持/清理布尔值，无token、原生会话ID、原始日志或任务正文。原生TUI仅显示此次固定任务，不操作日常终端会话。

## 操作与停止

最多2个隔离交互TUI，不传`--no-daemon`、连接环境变量、登录或模型凭据。第一轮120秒内Main核对并审核仅这10条自有通知；若出现其他来源的通知、登录或异常初始化要求则停止，不批量信任其他条目。每轮只发送一次`Reply OK only. Do not use tools.`到本机固定Responses服务，最多2任务+2标题响应；无真实模型消费。正常/quit后重建Main的正式配置集合和接收器，再启动第二个默认TUI（45秒）重复一次，验证同一后台与hooks可使用新接收地址。

结束时只对这个隔离CODEX_HOME调用一次`app-server daemon stop`（5秒，另有1秒强制结束助手的期限）；不停止日常Codex。Main接收器和本机模拟服务关闭。默认后台停止未确认则结果不通过，保留目录、结果和安全停点，不自行强杀未知进程、不扩大访问范围或无限重试。

本次不重启当前dev/Claude/pi，不更新程序或依赖、不打包、不推送。即使通过，日常安装仍须另给精确写入预览。空CLI没有首条任务时不算会话在线，关闭一个终端也不等于后台会话结束；这些产品语义在正式连接页已明确说明。

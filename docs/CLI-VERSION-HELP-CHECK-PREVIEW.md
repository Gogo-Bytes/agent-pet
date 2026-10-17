# CLI 版本与帮助检查预览 · 2026-10-16

状态：用户已精确授权；已按下述范围完成Claude版本/帮助检查，Codex与agy因metadata预算用尽跳过，未执行。此前安装检查明确不执行程序；本次新增的是下面固定帮助/版本命令，不授权加载插件、启动会话或修改日常配置。

## 精确范围

仅使用以下三个入口，各最多一次--version；成功且得到版本信息后，各最多一次--help。每条命令最长3秒、输出最多64KiB、stdin关闭，不传提示词、不使用shell拼接。工作目录和HOME均为下述新隔离目录；不启动或操作当前运行的Agent/桌面应用。

| 入口 | 允许参数 |
| --- | --- |
| /Users/gan/.nvm/versions/node/v22.18.0/bin/claude | --version、--help |
| /Users/gan/.local/bin/codex | --version、--help |
| /Users/gan/.local/bin/agy | --version、--help |

命令执行前仅核对入口、可执行文件与必要祖先metadata/链接，每个最多8层链接，总计最多96次metadata操作。Codex新增允许范围仅为/Users/gan/.codex/packages/standalone子树中的程序入口、链接和必要目录metadata；不枚举.codex其他内容，不读config.toml、hooks.json、auth、会话、数据库或对话。路径离开已识别的安装范围或文件变化就跳过，不扩大查找或自动安装。

## 隔离与输出

仅独占新建/tmp/agent-pet-cli-help-20261016-7c4e9a（0700），为三个程序分别建立work、home、config、cache、tmp目录及Claude/Codex专用配置目录，记录结果文件0600。目录存在则拒绝，不认领或清理。

使用明确的最小环境：HOME、XDG_CONFIG_HOME、XDG_CACHE_HOME、TMPDIR、CLAUDE_CONFIG_DIR、CODEX_HOME全部指向各自隔离目录；PATH只包含已知Node v22.18.0目录和/usr/bin、/bin、/usr/sbin、/sbin；LANG/LC_ALL=C、NO_COLOR=1、DISABLE_AUTOUPDATER=1、CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1。不会继承API key、token、其他Agent配置环境或接收凭据，也不复制凭据。版本/帮助命令不是模型任务；不执行登录、更新、安装、插件加载或init命令。失败、超时或要求初始化时记录失败并停止该入口，不换命令绕过。

标准输出和错误只在内存中有界收集；结果仅保存可识别的版本字符串、固定候选选项是否出现、退出/超时类别与输出字节数。不公开或保存完整环境、任意错误文本和输出全文。结果不证明Hooks实际加载、原生字段或状态已支持。保留隔离目录和脱敏结果，不删除未知文件。

本次不启动任何模型工作、不触碰日常配置、不安装依赖、不重启dev、不打包。现有pi连接与原Agent进程保持原状。

依据AGENTS.md和当前MVP计划，之前授权只覆盖安装metadata；执行这组真实安装程序需要本次精确授权。Claude真实插件/事件验证会在代码和隔离检查完成后另列具体范围。

## 实际结果

- Claude `--version`：退出0，22字节，识别2.1.143；`--help`：退出0，9932字节。确认帮助中有`--plugin-dir`、`--settings`、`--setting-sources`与`--strict-mcp-config`；没有`--init-only`。不据此推断Hooks已加载或可直接连接。
- Codex、agy：未执行。脚本重复核对全体已缓存路径，提前用完96次metadata操作预算；随后两次预算检查未再访问文件。未扩大范围或重试命令。Codex程序链接核对仅在授权的standalone范围内，没有读取其配置。
- 隔离目录已独占创建；脱敏结果保存在`/tmp/agent-pet-cli-help-20261016-7c4e9a/results.json`（0600），未保留原始帮助输出。无日常配置读取/修改、模型请求、dev重启或打包。其余两个CLI的版本与兼容性仍未验证。

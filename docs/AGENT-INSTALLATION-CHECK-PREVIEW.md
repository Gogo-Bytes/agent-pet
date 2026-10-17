# 新 Agent 安装信息只读检查预览 · 2026-10-16

状态：用户已选择“授权此次只读检查”，检查已完成。没有启动 Agent 或修改 Agent 配置；当前 pi 与 Agent Pet dev 保持原状。

## 目的

用户确认本机有 Codex CLI、Claude Code、Antigravity 桌面端和 CLI。核对可定位的安装入口与版本 metadata，决定哪些官方事件契约适用于本机；“有安装”不等于已加载连接或已验证支持事件。

官方候选依据：[Claude Code hooks](https://code.claude.com/docs/en/hooks)、[Codex hooks](https://learn.chatgpt.com/docs/hooks)、[Antigravity hooks](https://www.antigravity.google/docs/hooks)。官网当前文档不代替本机版本兼容性证据。

## 本次精确只读范围

1. 读取当前命令环境的 PATH 字符串，只输出候选位置；不输出其他环境变量。最多取前16个不同的绝对目录，仅对其中 codex、claude、agy、antigravity 四个固定名称作 lstat/readlink。加查固定 /opt/homebrew/bin、/usr/local/bin、/Users/gan/.local/bin 中同名入口；不枚举这些目录的其他内容。
2. 如上述入口不足，只枚举 /Users/gan/.nvm/versions/node 一层（最多64项、16个版本），只查各版本 bin 下这四个名称。每个候选最多跟踪8层链接；整体最多96个候选入口、256次metadata/链接操作，达到上限就报告检查不完整，不扩大扫描。
3. 仅对于已定位、可明确关联的 Node 安装，读取其固定 package.json（单个至多64KiB，总共最多16份）。包根必须来自入口路径与已解析链接；不递归找包、不读源码或运行文件，只提取 name/version/bin 的必要类型与匹配信息。未知布局保留“版本未确认”。
4. 仅检查固定 /Applications/Antigravity.app 和 /Users/gan/Applications/Antigravity.app 的必要目录metadata；读取 Contents/Info.plist（至多64KiB）与 Contents/Resources/app/package.json、product.json（各至多256KiB），只提取应用名、bundle id、版本或版本渠道。不读取应用用户数据、插件或其他应用内容。
5. 结果只记录程序名、入口/安装位置、版本metadata来源、版本是否确认与检查限制；不推断程序正在运行、支持全部回调或通信在线。没有找到不代表未安装。

## 不在本次范围内

不启动四个 Agent，不执行 --version/--help 或安装脚本，不安装/更新依赖，不扫描进程/终端内容。不得读取 ~/.codex、~/.claude、~/.gemini 中的配置、凭据、会话或对话；不读取项目的 Agent 设置、trust 或 transcript。链接进入这些配置目录则停止，不借链接扩大权限。不修改现有 hooks、plugins、settings、信任或系统设置，不部署、停止、reload Agent，不发模型请求，不重启dev、不打包。

## 后续实施边界

仓库已有 SessionObservationAdapter、统一能力和动作投影；Configurations、扫描/检查、部署与连接页仍是pi专用，需要逐步接入Provider实现，不能换个名称就宣称支持。原pi部署/恢复/选择性撤回与数据保留测试继续保留。

优先实现Claude Code，再实现Codex CLI，Antigravity桌面端与CLI分别确认兼容性。每项先完成代码和隔离验证，再提供真实配置写入的独立精确预览。回调仅观察，不返回许可决定、上下文注入、重试或继续工作指令；错误/等待/取消只依据各端可靠事实，缺失能力保持unknown，不猜成功或失败。短命回调进程的退出不能作为Agent离线；还需单独验证会话身份、事件乱序与连接新鲜度。

这份预览不授权安装、启用或信任回调，也不授权读取真实配置；相应操作需后续按实际文件列出可审查变更。按 AGENTS.md / 当前MVP计划，真实安装目标读取需要本次精确授权。

## 实际只读结果

共检查72个候选入口，132次必要metadata/链接操作，读取1份Node包manifest；未达到预算上限。没有执行Agent、读取配置或会话，也没有运行--version/--help。

| 对象 | 实际找到的位置 | 版本依据与限制 |
| --- | --- | --- |
| Claude Code | `/Users/gan/.nvm/versions/node/v22.18.0/bin/claude` → 同版本lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe | 对应package.json的name/bin匹配，version=2.1.143；未执行二进制，不证明当前会话来自此安装 |
| Antigravity桌面端 | `/Applications/Antigravity.app` | Info.plist的CFBundleIdentifier=com.google.antigravity，ShortVersion/BundleVersion均为2.22.0；未读取用户数据 |
| Antigravity CLI | `/Users/gan/.local/bin/agy`，普通文件 | 入口存在；本次允许的metadata未给出版本，不读启动脚本或猜测它与桌面端相同 |
| Codex CLI | `/Users/gan/.local/bin/codex`入口；当前PATH另有.codex内部入口 | 链接进入排除的.codex目录后停止；版本未确认，不把排除结果记成未安装 |

配置目录内的PATH候选全部跳过；固定Antigravity应用包之外未枚举其他应用，其他未找到的候选不代表机器上不存在安装。本结果只证明可定位的安装metadata，不证明hook可用、通信在线或真实行为通过。

后续第一阶段已实现Claude白名单事实转换器及隔离测试，见 [模块与边界](../integrations/claude-hooks/README.md)。接收通道、Main/连接页、部署和真实验收尚未实现，其他Agent未接通。原MVP计划中的pi专用范围由用户此次新增需求扩展到新Provider工程准备，不扩大本次真实目标授权。

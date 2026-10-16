# CLI 更新范围与结果 · 2026-10-16

用户明确要求“将cli的版本都更新一下，然后继续”，授权更新本机已定位的Claude Code、Codex、Antigravity CLI。继续dev、不打包，保留现有Agent配置。该请求不包含pi或桌面应用更新，不包含部署观察扩展或发起任务。

## 执行范围

先在独占自有目录`/tmp/agent-pet-cli-update-20261016-f42c8a`（0700）下载官方安装资料、构建独立候选并用隔离HOME/配置/缓存检查版本/帮助。所有命令使用明确最小环境，不继承凭据、API key或私有registry配置；不读取日常Agent配置/凭据/对话。候选验证后才切换程序，保留旧程序和链接，失败不切换。

- Claude：现有`/Users/gan/.nvm/versions/node/v22.18.0/bin/claude`及对应`lib/node_modules/@anthropic-ai/claude-code`。保持npm布局；官方registry当前2.1.301，先在自有暂存prefix安装并检查，备份原包和入口，再切换此包与入口，不动同prefix其他包。
- Codex：现有`/Users/gan/.local/bin/codex`指向`/Users/gan/.codex/packages/standalone/current/bin/codex`，当前实际0.161.0。先把官方standalone安装器运行在自有暂存HOME/CODEX_HOME/bin，再把已验证的新release复制到原`packages/standalone/releases`下独占新版本目录，原子切换`current`与必要程序链接。保留原release及安装选择记录；不把官方安装器直接运行在日常HOME，不扫/清stale文件，不动config/auth/sessions或后台daemon。若新版本目录已存在则核对，不覆盖未知内容。
- Antigravity CLI：`/Users/gan/.local/bin/agy`，当前实际1.1.27；官方darwin_arm64 manifest当前1.4.0。下载官方manifest指定包并核对SHA512，只提取可执行文件，先隔离验证再备份/原子替换此入口；不运行install环境配置步骤、不修改shell别名/PATH、不更新Antigravity.app。

程序备份、原链接、摘要与脱敏更新结果只保存在上述自有目录；旧程序不删除，配置不复制。现有任务/进程不停止或重载；新版本在下次启动CLI时生效。若要求登录、授权或影响现有配置就停在具体步骤。版本检查不代表Agent Pet接入或hooks实机验收。

## 官方依据

- [Claude npm升级](https://code.claude.com/docs/en/setup#install-with-npm)
- [Codex独立安装与更新](https://learn.chatgpt.com/docs/codex/cli)；官方installer已下载检查，使用其release校验，不直接运行在日常HOME。
- [Antigravity CLI安装/升级](https://antigravity.google/docs/install?tab=cli)；实际官方installer仅支持--dir，不能盲用文档中的skip参数，因此仅复用其manifest/校验/单文件候选。

## 当前结果

已完成用户授权范围内的程序更新及原入口隔离复验：

| CLI | 更新前 | 更新后 | 结果 |
| --- | --- | --- | --- |
| Claude Code | 2.1.143 | 2.1.301 | 原NVM npm位置，--version退出0 |
| Codex | 0.161.0 | 0.163.0 | 原standalone/current选择，--version退出0 |
| Antigravity CLI | 1.1.27 | 1.4.0 | 原.local/bin/agy，--version退出0 |

三个候选在隔离环境的--version/--help均退出0，随后才切换，原入口再次--version全部通过。Codex使用官方installer的release校验；agy下载55787631字节且SHA512与官方manifest一致。Claude用官方npm registry的包固定2.1.301，先禁脚本安装，核对postinstall仅做平台二进制定位/链接后在隔离prefix执行，退出0。首次临时npm因user/global共用/dev/null而失败，一次修正为两个自有空npmrc后通过；未更新npm本身。

原程序/选择备份：`/tmp/agent-pet-cli-update-20261016-f42c8a/backups/claude-code-2.1.143`、`backups/agy-1.1.27`；Codex旧release仍在原releases/0.161.0-aarch64-apple-darwin。`before.json`保留原链接/安装选择与程序摘要；`candidate-results.json`、`switch-results.json`、`installed-results.json`保存脱敏结果，均0600。Codex的auto-update-version仅在原值匹配旧选择时更新为新release名，没有改变其他安装策略或后台daemon。

未读取或修改Agent日常设置/凭据/会话，没有shell配置写入、模型请求、Agent停止/reload、dev重启或打包。Claude原位置不在当前dev shell PATH中（which为空）；本轮没有新增另一份安装或修改PATH，正式接入应使用已核对的绝对入口。

撤回方式：先核对当前程序仍为本轮版本/摘要，再把本轮程序保存在新的自有目录，恢复备份Claude包与agy文件；Codex恢复before.json的current链接及原auto-update-version内容，保留新旧release。若期间程序被其他更新器改变则停止，不能覆盖。未自动执行撤回。

程序升级不代表新Agent已接通。Claude独立调用脚本另见[实施记录](CLAUDE-CLI-ACCEPTANCE.md)，另行精确授权的原生manifest校验与[隔离启动回调](CLAUDE-NATIVE-START-PREVIEW.md)已通过；正式运行/工作绑定与产品接线仍未实施。

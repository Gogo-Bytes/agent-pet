# Codex 隔离审核与条件复验预览

2026-10-19，待用户决定。本机只读结果已确认：10条Agent Pet通知均启用但未信任，没有其他条目或配置错误。此阶段只验证隔离安装的原生通知，不接管日常Codex，也不证明正式连接已完成。

## 用户操作

准备好后，在自己的交互终端中运行：

```sh
cd '/Users/gan/Desktop/🥷/agent-pet'
node integrations/codex-hooks/test-support/trust-review.mjs --run-authorized-review
```

脚本只在交互终端中运行，最多打开180秒的隔离Codex。进入后输入 `/hooks`，只核对本产品的10条通知，再由你决定是否信任，完成后正常退出。不要发送任务；如果出现登录要求、其他条目、程序不支持审核或无法正常进入审核，请直接退出并告诉我。不要登录、复制凭据或选择跳过审核。

审核命令均为本产品独立observer.cjs及原配置，脚本会核对文件和程序身份。信任只通过Codex自己的界面保存；脚本不手写信任文件，不使用跳过审核参数。尚未验证隔离环境能否在未登录时进入 `/hooks`，遇到该阻塞就停，不重复重试。

## 精确范围

- 复用 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2` 及原home/config/cache/tmp/work/runtime。原hooks.json、config.toml、observer.cjs的权限、归属、内容和程序身份在开始及复验前核对，变化即停。
- 本机固定 `/Users/gan/.local/bin/codex` 的程序链接和安装metadata继续使用既有有界核对；执行其确切程序，最多3次：交互审核一次（180秒），只读hooks/list一次（10秒），仅审核完整通过后创建空会话一次（10秒）。每次均使用原loopback-only系统沙箱、隔离HOME/CODEX_HOME/XDG/TMPDIR及不保存凭据的配置，不继承日常凭据，不允许外网。
- 独占新增 `runtime/review-documents.cjs`、`runtime/review-check.cjs`（0600），有同名文件即停止；不覆盖旧记录。Codex自己的UI可在此隔离config/home/cache/tmp/work中创建审核记录及正常启动文件，均不在日常配置目录。终端输出仅在用户自己的终端显示，脚本不保存终端画面或文字。
- 退出审核后只读查询。仅当10条自有通知全部启用且已信任、无其他来源/错误/警告时继续。否则停止；不会自动审批、修改启用设置或重试。
- 最后用明确 `read-only` 和 `approvalPolicy:never` 创建一个隔离空会话，仅等待真实SessionStart；不发送turn/start、提示词、模型请求或工具任务。仅清理此次检查创建的app-server进程组；交互审核超时/中断时停止其直接子进程，不操作其他Agent。
- 不读取日常Codex配置/凭据/对话，不改Claude token/hooks、pi扩展、当前dev或安装，不打包、不安装依赖。

## 结果及撤回

仅新增 `review-status.json`、条件生成的 `review-start.json`（0600），仍只存状态类别、计数、输出字节数及匿名事件类型，不保存对话、命令、hash、凭据或原生会话ID。已有结果不覆盖。结果不是日常配置/正式UI验收。

审核只是此独立隔离目录内的用户决定。保留原证据；如需撤回信任，可在同一隔离Codex审核界面操作，不直接改写其信任记录。脚本不会把隔离信任迁移到日常Codex。

[AGENTS.md](../AGENTS.md)要求“真实目标操作仍需精确范围、预览与授权”。此次新增交互启动、用户决定写入隔离信任及条件空会话，超出此前hooks/list只读授权，因此先交由用户确认。

准备代码验证：`pnpm test integrations/codex-hooks/test-support --maxWorkers=1` 29项通过、`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过，仅源码构建。新增入口拒绝测试首次因用例参数展开和URL编码路径失败，修正测试后一次有界复验全通过；没有为此执行真实Codex。真实交互审核、登录要求和审核后回调仍未验证。

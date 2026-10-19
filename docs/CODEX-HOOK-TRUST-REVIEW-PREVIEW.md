# Codex 隔离审核与条件复验预览

2026-10-19，首轮已获用户授权并尝试，启动失败；r1也已获授权并由用户运行，但在检查准备阶段停止；当前原生复验已停，不再执行下面命令。本机只读结果已确认：10条Agent Pet通知均启用但未信任，没有其他条目或配置错误。此阶段只验证隔离安装的原生通知，不接管日常Codex，也不证明正式连接已完成。

## 用户操作

以下保留已执行命令用于恢复上下文；当前不用再次运行：

```sh
cd '/Users/gan/Desktop/🥷/agent-pet'
node integrations/codex-hooks/test-support/trust-review.mjs --run-authorized-review-r1
```

r1仅添加官方 `--no-daemon` 参数，使交互CLI直接运行、不启用共享后台服务；沙箱/配置/审核规则不变。脚本只在交互终端中运行，最多打开180秒的隔离Codex。进入后输入 `/hooks`，只核对本产品的10条通知，再由你决定是否信任，完成后正常退出。不要发送任务；如果出现登录要求、其他条目、程序不支持审核或无法正常进入审核，请直接退出并告诉我。不要登录、复制凭据或选择跳过审核。

审核命令均为本产品独立observer.cjs及原配置，脚本会核对文件和程序身份。信任只通过Codex自己的界面保存；脚本不手写信任文件，不使用跳过审核参数。尚未验证隔离环境能否在未登录时进入 `/hooks`，遇到该阻塞就停，不重复重试。

## 精确范围

- 复用 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2` 及原home/config/cache/tmp/work/runtime。原hooks.json、config.toml、observer.cjs的权限、归属、内容和程序身份在开始及复验前核对，变化即停。
- 本机固定 `/Users/gan/.local/bin/codex` 的程序链接和安装metadata继续使用既有有界核对；执行其确切程序，最多3次：交互审核一次（180秒），只读hooks/list一次（10秒），仅审核完整通过后创建空会话一次（10秒）。每次均使用原loopback-only系统沙箱、隔离HOME/CODEX_HOME/XDG/TMPDIR及不保存凭据的配置，不继承日常凭据，不允许外网。
- 独占新增 `runtime/review-r1-documents.cjs`、`runtime/review-r1-check.cjs`（0600），有同名文件即停止；不覆盖旧记录。Codex自己的UI可在此隔离config/home/cache/tmp/work中创建审核记录及正常启动文件，均不在日常配置目录。终端输出仅在用户自己的终端显示，脚本不保存终端画面或文字。
- 退出审核后只读查询。仅当10条自有通知全部启用且已信任、无其他来源/错误/警告时继续。否则停止；不会自动审批、修改启用设置或重试。
- 最后用明确 `read-only` 和 `approvalPolicy:never` 创建一个隔离空会话，仅等待真实SessionStart；不发送turn/start、提示词、模型请求或工具任务。仅清理此次检查创建的app-server进程组；交互审核超时/中断时停止其直接子进程，不操作其他Agent。
- 不读取日常Codex配置/凭据/对话，不改Claude token/hooks、pi扩展、当前dev或安装，不打包、不安装依赖。

## 结果及撤回

仅新增 `review-status.json`、条件生成的 `review-start.json`（0600），仍只存状态类别、计数、输出字节数及匿名事件类型，不保存对话、命令、hash、凭据或原生会话ID。已有结果不覆盖。结果不是日常配置/正式UI验收。

审核只是此独立隔离目录内的用户决定。保留原证据；如需撤回信任，可在同一隔离Codex审核界面操作，不直接改写其信任记录。脚本不会把隔离信任迁移到日常Codex。

[AGENTS.md](../AGENTS.md)要求“真实目标操作仍需精确范围、预览与授权”。此次新增交互启动、用户决定写入隔离信任及条件空会话，超出此前hooks/list只读授权，因此先交由用户确认。

准备代码验证：`pnpm test integrations/codex-hooks/test-support --maxWorkers=1` 29项通过、`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过，仅源码构建。新增入口拒绝测试首次因用例参数展开和URL编码路径失败，修正测试后一次有界复验全通过；没有为此执行真实Codex。真实交互审核、登录要求和审核后回调仍未验证。

## 首轮失败与r1边界

用户实际运行后，Codex在进入审核前提示：记录pid-managed app-server失败，调用ps返回Operation not permitted，建议 `--no-daemon`；脚本输出REVIEW_STOPPED。未收到审核成功或启动回调，不标通过。原 `runtime/review-documents.cjs`、`runtime/review-check.cjs` 保留，不覆盖或删除首轮材料。

有界最小复现仅在原同款沙箱内启动自有Node，再以 `/bin/ps -p 自己的PID -o pid=` 查询自己；真实复现spawn EPERM，未查询其他进程。新增macOS回归保留此限制；原回环可连/外网EPERM测试仍保留。[官方参数说明](https://learn.chatgpt.com/docs/developer-commands)确认 `--no-daemon` 关闭共享后台服务，未扩大网络或跳过信任。此证据解释首轮启动失败，不代表修复版已完成真实审核。

r1复用原隔离目录，只独占新建上述两个review-r1助手；审核UI可能创建的隔离文件与原预览一致。review-status.json、条件生成的review-start.json仍独占新建。最多一次交互审核、一次查询、一次条件空会话；再失败就记录停点，不自动重试、不切换协议、不放开沙箱、不登录。修改日常配置/现有dev不在范围。

因新增review-r1文件与修正后的真实重试不在首轮执行次数内，按照AGENTS精确授权规则，运行前由用户确认本次复验。脚本实现已准备；尚未运行真实Codex复验。

r1准备验证：31项检查程序测试、pnpm typecheck、desktop源码build全部通过；未打包、未启动真实Codex复验。

## r1实际停点（2026-10-19）

用户只收到REVIEW_STOPPED。对原授权固定文件的有界只读核对显示：目录均700、本人所有；observer/hook配置均600、单链接，observer与当前内存编译一致。review-r1-documents.cjs已创建，review-r1-check.cjs不存在，两个review结果均不存在。停在创建文档助手之后、检查配置时，尚未启动本次Codex，不能判断--no-daemon真实效果。

config.toml原两项保持，仅多出精确的 `[tui]` / `screen_reader_detection_done = true`。它由此前交互启动保存，属于界面检测标志；原脚本整文件相等判断误拒绝。已修正为只接受原字节或原字节加这一段，仍拒绝未知配置/信任更改；不写回或删除这条设置。review-r1准备中断后的同名助手只有600/本人/单链接/字节全同才可复用，不覆盖；其他检查入口仍拒绝已存在文件。失败提示新增固定类别，不输出任意异常正文、路径或秘密。

检查程序33项、typecheck、desktop源码build通过；收窄复用至review-r1后两项专门回归通过。测试使用自有临时文件，没有真实Codex启动、日常配置写入、dev重启或打包。

按[AGENTS.md](../AGENTS.md)“仍失败则记录证据、剩余工作与安全停点”结束本轮原生验证。实现修复已完成，但审核、信任及回调仍未验收；没有新增r2或自动再次启动。下一阶段先决定是否恢复同一尚未启动的隔离审核流程，不执行历史命令、不绕过guard。

## 最新续接

用户再次授权修复后续验，准备检查已实际通过；之后用户确认进入登录界面。review-status.json核对为hooks-listed、10条启用/未信任，其余0；尚无已信任或回调证据。用户随后明确要求复用本机登录，新增精确范围/隔离处理及入口见[本机凭据临时使用](CODEX-LOCAL-AUTH-REVIEW-PREVIEW.md)，不再使用旧命令或覆盖旧结果。

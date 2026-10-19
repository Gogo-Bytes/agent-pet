# Codex 账号初始化受限联网复验

2026-10-19，待用户精确授权。本次是隔离审核策略调整，不是模型任务或日常Codex部署。

## 已确认与未确认

用户使用本机登录版入口后报告：TUI bootstrap的account/read在workspace routing discovery失败（-32603），最后review-interrupted。原隔离目录中临时config/auth.json已不存在；原日常auth仍为本人所有/600/普通单链接文件，内容未输出。两个auth-review结果不存在，说明尚未完成交互退出后的查询，不能宣称登录有效、审核完成或收到hook。

同款系统沙箱的真实自有网络测试已证明：loopback可连、外网EPERM。官方[app-server说明](https://learn.chatgpt.com/docs/app-server)说明account/read获取账号信息、可刷新token；仅有这条错误不能排除上游账号/工作区问题。当前最有力解释是原先完全禁外网的策略挡住初始化，需要一次受限联网对照；未验证前不标根因已解决、不要求重新登录。

## 精确变更与操作

- 复用原 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2`，不改原hooks/config/observer、不覆盖历史结果。Codex入口和隔离目录/文件身份继续严格检查。
- 继续仅只读 `/Users/gan/.codex/auth.json`（普通600本人单链接、不跟随链接、最多64KiB），只在交互时排他新建隔离 `config/auth.json` 600副本，按[已有授权的凭据规则](CODEX-LOCAL-AUTH-REVIEW-PREVIEW.md)清理；不写原缓存，不输出凭据，不调用login/logout。
- Codex仍运行于原loopback-only系统沙箱，`--no-daemon --no-alt-screen`，不修改系统网络、代理或日常环境。新增自有Node进程内的临时loopback HTTP CONNECT网关，在沙箱外提供这次明确的域名级出口例外；只允许精确 `chatgpt.com:443`，其他主机、IP字面量、端口、普通HTTP请求均拒绝。不开放auth.openai.com、api.openai.com或任何其他站点，不失败后自动加白。
- 仅此新交互子进程收到指向网关的HTTP(S)_PROXY变量。网关地址含随机内存认证，绑定127.0.0.1随机端口，不落盘、不打印；最多8个已跟踪socket，每隧道双向合计约2MiB、180秒总时限、15秒空闲限制。退出后关闭网关和活动连接。DNS与外部TCP连接由网关执行。
- TLS仍由原生Codex与chatgpt.com端到端建立，网关不解密/记录请求头、正文、凭据或响应。**这是域名级限制，不能过滤加密后的URL路径**；允许原生账号/工作区与正常启动请求，不承诺只有一个HTTP请求。用户不得发送模型任务，程序不主动发送提示、turn/start、工具或额外认证请求。外部服务可能正常读取账号信息；若凭据需要重新登录/刷新，或需要其他域名，停止，不扩大范围。
- 本次固定程序最多3次：交互审核1次（180秒）；正常退出后只读hooks/list 1次（10秒）；只有10条自有通知全部信任且无其他来源/错误/警告时，创建只读空会话1次（10秒）。网关和凭据只用于第一个交互进程，后两次仍完全禁外网/ephemeral；仍不发模型任务。
- 新助手仅 `runtime/review-network-documents.cjs`、`runtime/review-network-check.cjs`，0600排他创建，有同名则停。结果仅 `network-review-status.json`、条件生成 `network-review-start.json`，0600排他创建，固定类别/计数/匿名事件，不保存原始输出或秘密。
- 用户在 `/hooks` 中亲自审核本产品10条，脚本绝不写信任hash或跳过审核。遇到登录、额外信任范围、其他条目或错误即停，保留证据；不自动重试。
- 原dev、Claude/pi、token/hooks/配置保持；不打包、不安装依赖、不推送。

## 授权后的用户入口

```sh
cd '/Users/gan/Desktop/🥷/agent-pet'
/Users/gan/.nvm/versions/node/v22.22.3/bin/node integrations/codex-hooks/test-support/trust-review.mjs --run-authorized-account-network
```

目前不要执行。AGENTS.md要求“真实目标操作仍需精确范围、预览与授权”；此前明确禁止外网，复用本机凭据的授权不等于允许将它用于外部账号请求。新增网络例外、两个助手和两份结果需要这次确认。

## 准备验证

40项检查程序测试、pnpm typecheck、desktop源码build通过；两项网关聚焦复核通过。测试仅连接自有loopback fixture，覆盖精确目标/认证、拒绝其他目标和普通HTTP、不发出未授权外连、活动隧道双向数据及关闭清理；没有访问chatgpt.com、读取实际凭据或运行真实Codex。未进行真实网络复验，不能宣称原生审核、账号路由或Codex接入通过。

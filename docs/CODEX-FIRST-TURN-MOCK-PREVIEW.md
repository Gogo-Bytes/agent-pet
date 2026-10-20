# Codex 首轮本机模拟验证

用户已明确要求按调研方案先用本机模拟服务实施。本步复用 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2` 中已审核的10条原hook，固定入口仍为 `/Users/gan/.local/bin/codex`，按既有有界链接规则核对程序。不读日常配置或凭据，不改旧config/hooks/observer/信任。

只新增600排他文件：runtime/review-first-turn-documents.cjs、runtime/review-first-turn-check.cjs、runtime/first-turn-receiver.cjs、first-turn-result.json。原失败证据不覆盖。原隔离config/home/cache/tmp/work允许Codex按原范围运行；配置覆盖仅通过此次命令行传入，不写配置文件。

一次新建隔离app-server，15秒总限和1秒同组强制清理，OS网络限制仍loopback-only。只用127.0.0.1随机端口固定Responses模拟服务，不转发，不使用/复制登录凭据，不登录、安装或请求真实模型。先创建空线程，150ms记录负对照；再提交固定无工具输入，模拟服务返回OK；核对真实SessionStart在UserPromptSubmit之前，任务结束、仅1条本地Responses请求。接收只保存事件类别、布尔值与计数，不存原生ID、prompt、输出、stderr、请求体或token。

原hook由Codex自己调用，仍需原生信任全部有效；不直接写信任。失败只做一次有界最小假设修复与复验，复验文件须使用新固定名字保留首轮结果；不自动放宽网络、请求真实模型或修改日常配置。完成后关本步接收器与模拟服务，不重启现有pi/Claude/dev，不打包。

## 已执行结果

2026-10-19，以上范围按用户本轮指令执行通过，`first-turn-result.json`保留：initialized/threadStarted/turnStarted/turnCompleted均true；150ms负对照内无SessionStart；随后真实认证事件依次session-started、turn-submitted、stop-requested、session-ended；本地Responses请求1、unexpected0、rejected0；stdout10538字节/stderr0。外部请求为0依据是OS loopback-only限制与空凭据环境，并非对网络抓包计数；不能把固定mock回复当成真实模型验收。未修改原config/hooks/observer/信任，无临时auth文件。

`pnpm test integrations/codex-hooks/test-support --maxWorkers=1`（56项）、`pnpm typecheck`、desktop源码build通过。首次fixture发现URL校验未拒绝userinfo，修复后同组测试通过；未为此执行真实Codex。独立审查3项fixture通过无确定缺陷。此阶段只证明原生首轮hook链路，普通启动发现、身份核验及正式UI随后实施，不表示日常已接通。

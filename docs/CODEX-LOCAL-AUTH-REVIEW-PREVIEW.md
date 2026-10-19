# Codex 审核临时使用本机登录

2026-10-19，用户明确要求“直接使用本机已有的登录凭证”，覆盖此前不读取或复制凭据的限定；本次仅为恢复同一隔离审核，不接入日常配置、不发送任务、不打包。用户已确认修复后CLI显示登录要求。原review-status.json已生成：本产品10条均启用、均未信任，其他来源/错误/警告0；旧记录保留。

[官方认证说明](https://learn.chatgpt.com/docs/auth)确认file模式使用CODEX_HOME/auth.json，ephemeral只保留当前进程内存；隔离CODEX_HOME不会自动读取日常缓存。本次不尝试绕过登录或伪造凭证。

## 操作范围

- 固定只读 `/Users/gan/.codex/auth.json`：metadata已确认本人所有、600、单链接普通文件、大小不超过64KiB。实际使用时以只读/no-follow打开、按文件句柄校验权限/归属和有界大小；读取前后metadata变化即停。不打印、返回、hash记录或解析输出凭据，不读取日常config、会话或其他秘密。
- 仅在原 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2/config/auth.json` 排他新建600临时副本，原文件不写、不链接。已有目标直接停止，绝不覆盖。仅此次交互Codex通过命令行覆盖 `cli_auth_credentials_store="file"`；config.toml仍保留ephemeral，不改其字节。
- 副本只在交互进程运行期间存在。正常退出、可处理的取消、超时或异常时，在finally按创建时文件身份核对后删除，内存Buffer清零；不把副本放入Git、诊断或结果文件。若临时文件被替换或变为未知文件，停止且提示固定清理错误，不删未知文件。断电/SIGKILL无法执行finally；有残留下次拒绝覆盖，先交回处理。
- 原系统沙箱/隔离HOME/XDG/TMPDIR/禁止外网维持，仍为 `--no-daemon --no-alt-screen`。不登录/刷新凭据、不发送任务、模型请求、工具或审批。用户只操作 `/hooks` 的本产品10条审核；若仍要求登录，直接退出，不登录或重试。
- 继续原固定Codex程序及有界身份核对；本次最多一次交互审核180秒，退出后一次只读查询10秒，仅全部10条受信且无其他来源/错误/警告时一次只读空会话10秒。查询/空会话使用原ephemeral设置，不携带登录副本；同一认证loopback验证逻辑不变。
- 独占新建 `runtime/review-auth-documents.cjs`、`runtime/review-auth-check.cjs`，0600；准备阶段可复用权限/归属/单链接/内容全同的自有同名助手；未知或变化则停，绝不覆盖旧助手。结果只写 `auth-review-status.json`、条件生成 `auth-review-start.json`，0600、固定类别/计数/匿名事件，无秘密或正文。旧review结果保留。审核UI仅在原隔离目录写入正常启动/审核文件。
- 不重启现有dev，不操作Claude/pi，不改token/hooks/日常Codex配置/原登录缓存，不安装依赖、不打包、不推送。

## 用户入口

```sh
cd '/Users/gan/Desktop/🥷/agent-pet'
/Users/gan/.nvm/versions/node/v22.22.3/bin/node integrations/codex-hooks/test-support/trust-review.mjs --run-authorized-review-local-auth
```

进入后输入 `/hooks`，仅由用户核对并信任本产品10条，正常退出。暂不发送任务或登录。运行前的助手准备不读取凭证内容，不启动Codex。

## 验证及当前限制

`pnpm test integrations/codex-hooks/test-support --maxWorkers=1` 37项、`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过（源码build，不打包）。凭证测试只用自有临时假数据，覆盖正常/失败清理、原文件不变、600、拒绝已有目标/过宽权限/链接/超限文件。尚未实际使用日常凭证运行审核，不能宣称登录、信任或原生回调通过。日常认证缓存本次只做metadata检查，内容未进入工具输出。

实际准备检查已通过，两个review-auth助手已排他创建；未读取凭据内容或启动Codex。用户入口会核对并复用相同助手。收窄后的凭据与助手/入口相关9项回归通过。

# 普通启动桥接的隔离实测预览

本预览首轮已按用户授权执行，结果与复验范围见下文。前一步app-server本机模拟首轮已通过，新的私有文件发现与原生宿主核验代码已通过自有fixture。新hook命令与原来已审核的环境变量命令不同，本轮已取得单独授权并完成新的10条原生审核，没有沿用旧命令的信任同意。

固定程序仍为 `/Users/gan/.local/bin/codex`，只按既有安装链接/metadata规则核对，不读日常Codex配置或凭据，不登录、不联网账号、不调用真实模型，不改当前Claude/pi/dev或打包。

独占新目录 `/private/tmp/agent-pet-codex-normal-20261019-9fe182`（700），包含home/config/cache/tmp/work/runtime。文件600、helper700：

- runtime/controller.cjs、native-hook.cjs、process-probe，均来自本仓库源码/本次dev源码构建的自有资产；不安装依赖。
- runtime/codex-normal-a43f9e8c-3a82-457c-93c0-5ac20caf7771/{observer.cjs,activation.json,hook.json,receipt.json}；重启仅按receipt轮换该私有activation/receipt，临时.next/.pending按失败关闭规则保留。
- config/config.toml、hooks.json。初始配置无登录、无外部Provider；Codex可在这里保存其原生UI/信任记录（只限这10条自有hook与自建work目录）。不直接写trusted_hash，不操作日常信任。
- normal-result.json、失败时normal-failure.json，只存退出码、计数、连接/地址轮换/文件保持布尔值，无原生编号、prompt、响应、token、原始日志。

运行 `node integrations/codex-hooks/test-support/normal-start-review.mjs --run-authorized-normal-start`。最多启动两个隔离TUI：首轮120秒内由Main在原生/hooks查看来源与命令，并经本次明确授权代为信任10条；仅发送固定“Reply OK only. Do not use tools.”，模型是OS回环限制下无转发的本机固定Responses服务。任务后正常/quit；恢复同一私有连接后第二轮45秒内再发同一固定任务并/quit。总计2次本地模拟请求，外网禁止、不继承凭据或AGENT_PET连接变量。失败不自动重试，保留目录和既有结果。

本步仍用--no-daemon隔离TUI避免旧sandbox/ps基础设施阻塞，只证明新hook命令无专用连接环境、原生身份核验和私有地址轮换。默认共享daemon、空CLI即在线、桌面端、正式连接页/首页、真实模型与日常安装不由本步验收；不得把通过宣传为这些能力都完成。

## 首次执行结果（2026-10-19，未通过）

用户授权Main代为审核后，原生/hooks中核对来源与命令并信任10条；固定本机任务返回OK，/quit正常退出0。第一轮后检查停止，没有启动第二个TUI。原`normal-failure.json`保留：phase=first-tui、category=check-failed、responses=2、unexpected=0、rejected=0。没有日常配置/凭据/现有dev变更或打包。

原检查错误地要求交互TUI只能请求一次Responses，而且失败记录漏存连接计数。因此**不能从这份记录判定真实连接成功或失败**。此前Main一度口头判断没有收到连接，随后已明确纠正。相同版本[官方标题实现](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/tui/src/app/thread_title.rs#L73)会另开隐藏标题会话，使用当前自定义Provider及仅含title的JSON schema；WebSocket预热代码不适用于本步禁用WebSocket的HTTP服务。标题可以解释额外流量，但原记录没有分类，第二次请求的实际类别仍未知。

检查修复只改测试边界：交互fixture有界解析内存中的请求格式，仅识别固定title schema，不保存正文/原生ID/请求字段；任务返回固定OK，标题返回固定合法JSON，分别计数。每轮只接受1次任务、最多1次标题；未知结构/预热、重复任务、额外标题、非回环或授权请求仍不能通过。连接由原生身份核验后的publish独立计数，失败结果也保存退出码与各项布尔/计数。旧app-server fixture模式和严格一次请求验收保持。

## 已授权的一次有界复验（历史操作范围）

此前预览约定失败不自动重试；用户随后明确授权以下新增范围，已执行通过，结果见下一节：

`node integrations/codex-hooks/test-support/normal-start-review.mjs --run-authorized-normal-retry`

- 只复用上方原隔离目录与已审核的同一10条hooks，不新建安装、改命令或重新写信任。读取固定自有controller/native-hook/helper、私有receipt/activation/hook和原失败文件；校验目录归属/权限/无链接、当前源码构建字节及helper相同，任何变化停止。不会读取日常配置或凭据。
- 显式restore轮换原自有activation/receipt，启动本机接收器；原Codex config/hooks/trust保留。正常/quit后再恢复一次自有接收器，验证第二轮不改hook命令也能连接。最多2个新隔离TUI，首轮120秒、第二轮45秒；每轮Main仅发送一次原固定任务。无需用户操作，不批准其他通知。
- 外网继续由OS禁止；不登录、不使用本机凭据，不调用真实模型、不改日常配置/当前Agent/dev，不打包。**最多4次本机模拟响应**：两次任务，每轮至多一个原生标题；这不同于首版误设的总共2次请求预算。
- 仅独占新增normal-retry-result.json或normal-retry-failure.json（600），保存阶段、退出码、任务/标题/拒绝/连接计数、轮换/原文件保持布尔值。原normal-failure.json、审核记录及runtime资产不覆盖。若已有复验记录或材料不符则停止。
- 复验失败不再自动重试；关闭自建接收器/模拟服务，保留证据与原始材料。即使通过也只验收此隔离--no-daemon模式；默认共享daemon、空启动即在线与日常接入仍未验收。

检查程序修复验证：`pnpm test integrations/codex-hooks/test-support --maxWorkers=1` 63项通过，`pnpm typecheck`与`pnpm --filter @agent-pet/desktop build`通过（仅源码构建）；独立审查18项自有fixture通过，无新增确定缺陷。此处记录准备代码检查；随后真实复验结果如下。

## 修正后原生复验通过（2026-10-19）

Main按用户授权运行`--run-authorized-normal-retry`，旧私有材料/当前源码与helper核对通过，未重写hooks、未重新授予信任。两次隔离TUI均进入主界面，分别只发送一次原固定任务，正常/quit退出0。第一轮唯一警告经F2核对为自定义fixture模型无metadata、采用fallback，不是hook报错；未更改此设置。

结果文件：`/private/tmp/agent-pet-codex-normal-20261019-9fe182/normal-retry-result.json`（600）。原失败文件保留。

| 检查 | 第一轮 | 接收器恢复后的第二轮 |
| --- | --- | --- |
| Codex退出码 | 0 | 0 |
| 原生身份核验后发布连接 | true | true |
| 固定任务请求 | 1 | 1 |
| 原生标题schema请求 | 1 | 1 |
| 异常/被拒请求 | 0 / 0 | 0 / 0 |
| 本轮通过 | true | true |

总计4次本机固定Responses响应（任务2、标题2），没有外部模型或凭据。`activationRotated=true`、`hooksUnchanged=true`、`specialConnectionEnvironment=false`、`passed=true`。累计connected=6/disconnected=2是状态发布次数，**不是6个宿主或连接配置**。脚本正常结束，关闭自建接收器及模拟服务，不重启现有dev/Agent、不打包、不推送。

此复验实际识别了隐藏标题流量，修正后的两轮均没有重复任务；首试未记录分类，不能追溯证明首试的第二次请求也一定是标题。通过只覆盖固定安装0.163.0、无凭据/外网、隔离--no-daemon模式，以及无专用连接环境变量的私有发现、原生身份链路与接收器轮换；不是默认共享daemon、空CLI启动即在线、正式连接页/首页、日常安装或真实任务验收。

独立审查已按脱敏白名单结果复核本轮文档，未发现结论矛盾；未让审查Agent访问真实目录、安装或凭据。

# Codex CLI 被终止：一次有界只读检查

2026-10-19，待授权。用户正常运行codex得到 `zsh: killed codex`；现有命令入口可解析，不是command not found。日常接入已追加10条自有hooks，真实任务尚未发送；dev继续运行，不打包。

## 本次范围

1. 仅解析 `/Users/gan/.local/bin/codex` 及其已知standalone/current到实际文件的有限链接和祖先metadata，比较本阶段已核对的0.163.0路径。对该文件执行系统 `/usr/bin/codesign --verify --strict` 与 `/usr/bin/codesign -d`（各一次，最多3秒），只输出是否有效及固定签名类别，不输出原始完整诊断。读取扩展属性名称，仅记录是否有com.apple.quarantine，不读取属性值，不删除属性、不重新签名、不改权限。
2. 独占新建 `/private/tmp/agent-pet-codex-killed-20261019-83b6a1`（0700），home/config/cache/tmp/work均隔离。使用既有测试环境白名单，不继承凭据/自定义服务环境；只执行上述原CLI入口一次 `--version`，最多3秒，超时终止该检查子进程，必要时1秒后终止此子进程；不启动后台/会话，不加载日常配置或hooks，不传模型任务、不登录、不更新/安装。
3. 若该次仍被SIGKILL终止，仅查询最近5分钟、与已核对的该程序路径/名称相关的macOS签名/安全进程（amfid、syspolicyd、kernel）的系统日志，查询最多5秒、读取上限64KiB。只输出signature/quarantine/policy/killed/unknown固定类别及命中数，不输出原日志，不读取任何Agent日志、auth、配置或对话。不使用sudo；权限不足就停止，不扩大权限或查询范围。
4. 新目录只保存 `result.json`（0600）：固定阶段/退出码/信号/版本（仅匹配codex版本行）/签名及quarantine布尔值/系统日志类别，无原始输出、环境、路径以外用户数据或凭据。保留证据不覆盖、不自动重试。

这是诊断，不包含任何修复写入。若需恢复安装、去隔离属性、签名、修改shell或重启现有Codex后台，先明确原因并另给精确预览。保留当前dev、原配置/hooks/token和所有Agent会话；本次不操作Codex桌面端。

AGENTS.md要求真实操作“精确范围、预览与授权”；日常配置接入授权没有包含执行CLI做诊断、签名/系统日志检查和这个新隔离目录，因此单独确认。

## 已执行结果及停点

用户已授权首轮只读诊断。`/private/tmp/agent-pet-codex-killed-20261019-83b6a1/result.json`：隔离 `--version` 被SIGKILL终止，无版本输出；codesign严格验证退出0，quarantine属性不存在，程序身份前后一致。该版本检查不加载日常配置/hooks，因此现有证据排除“必须加载本次新增hooks才发生”的解释，不宣称已确定根因。

5分钟codex名称过滤的系统日志查询超过64KiB，SIGTERM停止；输出被丢弃，结果中类别0不是有效的零命中证据。没有自动重试、删除属性、重签名、重装或改配置。dev保持运行，日常接收器等待首次任务，匿名状态记录尚在等待测试完成后关闭。

## 待单独授权的收窄查询

为读取同一次SIGKILL的系统原因，只再查一次最近10分钟的 amfid/syspolicyd/kernel 日志；predicate同时限定原生程序精确路径 `/Users/gan/.codex/packages/standalone/releases/0.163.0-aarch64-apple-darwin/bin/codex`（不再仅按codex名称）。最多5秒、64KiB；采用compact消息格式而非包含额外metadata的ndjson，内存中分类为signature/policy/killed/unknown及命中数，只有固定类别、查询状态和计数保存到原诊断目录新建的 `security-targeted.json`（0600，独占）。不输出原日志。不重跑Codex，不增加程序操作或读配置，不用sudo。无结果、权限不足、超时或超限则停止，不自动继续查询。此项超出首轮“一次查询、不自动重试”约定，须再次明确同意。


收窄查询已获用户授权并执行一次，正常退出0、460字节、未超时/超限，摘要在 `security-targeted.json`。分类器返回policy=2，但没有排除compact查询头（查询predicate自身含amfid与完整路径），且未保存原日志；因此计数不能用于确认系统策略拒绝或具体根因，不标诊断通过。没有执行第三次查询，也没有修改安全属性/签名或重装。可靠证据仅是隔离--version同样SIGKILL、静态签名验证通过、无quarantine、身份未变。后续需新的明确诊断/修复方案，不能基于当前计数操作日常程序。

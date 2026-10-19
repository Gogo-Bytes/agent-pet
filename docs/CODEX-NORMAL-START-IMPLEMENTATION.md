# Codex 普通启动桥接实现与验收边界

2026-10-19。依照[方案研究](CODEX-CONNECTION-RESEARCH.md)，本轮已完成原生首轮本机模拟与普通启动基础模块；没有安装日常Codex hook、修改现有配置或启用正式Renderer支持。

## 模块

- `integrations/codex-hooks/native-hook-entry.ts`：固定命令参数指定本应用私有activation文件，每次调用重新读取；无需shell连接变量。只规范化白名单事件，不读取Agent配置/对话文件、不启动Agent、不输出hook指令；失败静默退出0。
- `integrations/hook-runtime/private-activation.ts`：目录700/文件600/本人归属、祖先目录/单链接/no-follow/nonblock、字节上限和前后metadata一致性。拒绝未知provider、schema和额外字段；能力只允许规范的本机地址。
- `native-host.ts`：复用已有macOS精确PID helper，最多16层祖先链，验证hook观察器程序、目标宿主程序、UID、PID出生时间，完整链再次核对，检查本身有超时。只检查收到候选PID及其确切祖先/已绑定宿主，不扫描机器进程、参数或环境。
- `native-receiver.ts`：认证本机入口、严格头/路径/authority/内容长度，16个peer/排队和1500ms绝对期限；异步核验完成前不发布，停止后不接受迟到结果。
- `native-presence.ts`：随机宿主运行编号，同一宿主内独立会话、每事件重新验证、事件和退出墓碑、PID复用/宿主消失清理；最多32个运行/32会话/1024事件，饱和撤销该运行而非丢墓碑冒充在线。回调返回普通值不误停，异常停止。宿主生存与会话结束分开，不推断CLI窗口还开着。
- `normal-bridge.ts` / `observations.ts`：向已有共享状态发布匿名事实；首次经原生核验的非启动事件可恢复unknown基线，不伪造SessionStart或任务成功。已结束/退役的会话不会被重新认领，动作仍可选。
- Main `codex-normal-observer.ts`：仅拥有本应用私有observer/activation/hook/receipt文件；构造不写入，显式initialize拒绝已有目录，restore在内容/权限/完整性匹配后轮换地址与token。不覆盖未知/用户编辑/中断文件，不自动修复pending，不删除加载中runtime；stop等待尚未完成的启动清理。snapshot无能力、路径或原生ID。
- `electron.vite.config.ts`：dev与源码build都编译Codex native-hook资产；没有新增依赖或应用打包。

## 实测与测试矩阵

| 检查 | 本轮结果 | 证明范围 |
| --- | --- | --- |
| 本机Codex0.163.0首轮、本机固定Responses | 真实通过，1次本地请求，启动→提交→Stop→结束 | 原hook的首轮触发/认证链路；[精确范围与结果](CODEX-FIRST-TURN-MOCK-PREVIEW.md) |
| 无环境变量hook读取私有文件，地址替换后下一次调用 | 自有Node subprocess通过 | 新native-entry及桥接组合；真实原生审核另见下行 |
| 实际macOS metadata检查 | 自建C宿主→Node hook通过，宿主退出后断开 | 原生helper和OS祖先链，非真实Agent生命周期验收 |
| Main私有记录重启 | 自有fixture通过 | 地址/token轮换、hook/observer保留、编辑/pending/权限异常保留并失败关闭 |
| 新命令的原生Codex审核与重开 | 已授权并通过，两轮原生TUI各收到真实连接、任务/标题各1次、退出0；[范围与证据](CODEX-NORMAL-START-MOCK-PREVIEW.md) | 固定安装0.163.0、隔离--no-daemon、无连接环境变量；接收地址轮换后同一hook命令仍可连接 |
| 日常安装、默认共享daemon、空CLI即在线、正式连接页/首页 | 尚未完成/验收 | 新模块尚未注册到Configurations、IPC或Renderer，不显示虚假在线 |

既有Claude与pi部署/撤回/保留测试未削弱。第二阶段全量`pnpm test --maxWorkers=1`为1288 passed /1 skipped /115 files；`pnpm typecheck`及`pnpm --filter @agent-pet/desktop build`通过，仅源码构建。随后新增审核脚本gate与回调拒绝回归，聚焦16项通过。独立审查复现了回调正常返回误停和pending启动退出过早两项，均修正并补回归；最终独立复核22项自有fixture通过，无新的确定缺陷。未推送、未打包。

本模块无法凭空提供空CLI的在线存在性，也不宣称Stop就是任务成功、工具返回就是完成/出错、审批检查就是持续等待。共享daemon最小状态来源、已运行会话恢复与正式配置部署/撤回继续按研究依赖推进；任何日常目标写入仍需精确预览与授权。

原生隔离普通启动首试因测试程序的HTTP次数假设失败，原记录缺连接计数，不能倒推首试通过；证据保留。修正后经用户精确授权的一次有界复验已通过：两轮各1任务+1标题、真实连接、退出0；私有activation轮换且hook/observer保持。63项test-support、typecheck与源码build通过，独立18项fixture复核无确定缺陷；见[范围与证据](CODEX-NORMAL-START-MOCK-PREVIEW.md)。

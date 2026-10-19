# 普通启动桥接的隔离实测预览

此步尚未执行。前一步本机模拟首轮已通过，新的私有文件发现与原生宿主核验代码已通过自有fixture。新hook命令与原来已审核的环境变量命令不同，需要Codex原生重新审核，不能沿用旧10条的信任同意。

固定程序仍为 `/Users/gan/.local/bin/codex`，只按既有安装链接/metadata规则核对，不读日常Codex配置或凭据，不登录、不联网账号、不调用真实模型，不改当前Claude/pi/dev或打包。

独占新目录 `/private/tmp/agent-pet-codex-normal-20261019-9fe182`（700），包含home/config/cache/tmp/work/runtime。文件600、helper700：

- runtime/controller.cjs、native-hook.cjs、process-probe，均来自本仓库源码/本次dev源码构建的自有资产；不安装依赖。
- runtime/codex-normal-a43f9e8c-3a82-457c-93c0-5ac20caf7771/{observer.cjs,activation.json,hook.json,receipt.json}；重启仅按receipt轮换该私有activation/receipt，临时.next/.pending按失败关闭规则保留。
- config/config.toml、hooks.json。初始配置无登录、无外部Provider；Codex可在这里保存其原生UI/信任记录（只限这10条自有hook与自建work目录）。不直接写trusted_hash，不操作日常信任。
- normal-result.json、失败时normal-failure.json，只存退出码、计数、连接/地址轮换/文件保持布尔值，无原生编号、prompt、响应、token、原始日志。

运行 `node integrations/codex-hooks/test-support/normal-start-review.mjs --run-authorized-normal-start`。最多启动两个隔离TUI：首轮120秒内由Main在原生/hooks查看来源与命令，并经本次明确授权代为信任10条；仅发送固定“Reply OK only. Do not use tools.”，模型是OS回环限制下无转发的本机固定Responses服务。任务后正常/quit；恢复同一私有连接后第二轮45秒内再发同一固定任务并/quit。总计2次本地模拟请求，外网禁止、不继承凭据或AGENT_PET连接变量。失败不自动重试，保留目录和既有结果。

本步仍用--no-daemon隔离TUI避免旧sandbox/ps基础设施阻塞，只证明新hook命令无专用连接环境、原生身份核验和私有地址轮换。默认共享daemon、空CLI即在线、桌面端、正式连接页/首页、真实模型与日常安装不由本步验收；不得把通过宣传为这些能力都完成。

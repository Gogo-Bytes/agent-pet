# Claude CLI：一次配置、普通启动

状态：用户已确认取代专用启动命令；代码与隔离核心验证已完成，真实日常接入未授权。当前切片仍为连接与静态陪伴，任务动作/提醒保持未启用。执行状态见 [MVP计划](MVP-EXECUTION-PLAN.md)。本设计覆盖 [旧终端入口方案](CLAUDE-CLI-PRESENCE-DESIGN.md) 中“每次通过专用命令运行”的要求；旧库/文件保留兼容证据，正式 Main 每配置仅启用一种模式，不双计数。

## 产品入口

选择 Claude 使用的配置目录，通常为 `~/.claude`（全部项目），项目内 `.claude` 仅作用于该项目；不改变 shell、HOME、CLAUDE_CONFIG_DIR、Agent 参数或工作目录。选择已验证 npm2.1.301 程序后，预览读取选定目录的 `settings.json`，确认仅追加一个 SessionStart hook。以后照常运行 `claude`。首次安装需新会话，已运行的 Claude 不被重载或接管。

Agent Pet 重启后检查自有材料和自有 hook，恢复未暂停的观察连接，轮换私有接收信息；主动暂停保持暂停。已运行但没有在新接收器触发启动 hook 的旧进程不被自动认领，须新开 Claude 会话。停用不卸载共享 hook；应用关闭/连接不可用时 hook 静默结束。移除只撤回精确匹配的自有 hook，保留其他设置和全部用户数据。

## 原设置保留

`claude-user-hook.ts` 对最多64KiB UTF-8 JSON 做有界解析和局部文本插入/删除，不整体 stringify；原有格式、键顺序、大整数等未知值保持原字节。不接受重复键、非法结构、disableAllHooks、软链接/硬链接/不安全权限或已有 pending。预览保存目标和祖先身份；确认前后重查，独占 pending、fsync、比较后 rename，并保留原权限。原 hooks 保持执行语义；不能替用户修改 disable/trust。

私有目录 `userData/claude-normal-<配置UUID>`（0700）含五个0600文件：observer.cjs、activation.json、hook.json、settings-before.json、receipt.json。`settings-before.json` 保留原配置的完整字节，仅供人工核对，原文件不存在时为 literal null；可能含秘密，绝不发 Renderer/日志/Git，不能自动覆盖用户后续更改。激活凭据也仅存私有文件；公开预览只含路径、权限、固定说明和是否允许。

共享文件系统没有与任意外部编辑器共同提供原子 CAS；比较与 rename 之间仍有竞争窗口。保留私有原始证据、失败现场，不承诺并发任意写入安全。真实安装检查/写入期间不要同时保存 Claude 设置。卸载重读当前文件，只删唯一、完全匹配的条目；识别到修改过的产品引用则保留 hook 和产品记录。不会用整份备份回滚覆盖后来修改。

## 在线证据与隐私

`native-hook-entry.ts` 最多接收64KiB stdin、仅接受根 SessionStart，剔除会话标识/正文/路径，只向认证 loopback 发送 hook 自身 PID 与启动类别。Main 的 `native-presence.ts` 保持请求直到校验结束，通过自有 native-process-probe helper 仅读取该 PID 及最多15级祖先的 UID、PID/PPID、微秒启动时间和完整程序路径；完整链二次核对，要求 hook 真正来自所选 Claude。不得按进程名称、最近事件、通用Node或 Session ID 猜测。

Main 随后每秒只检查已确认 Claude 的确切 PID/启动身份/程序路径；最多32个运行，无进程列表扫描、不读参数/环境/工作目录/对话、不向 Agent 发信号。正常/异常退出、PID复用或检查失败均清除观察；通常检测延迟约1秒。hook 子进程退出、SessionEnd 和 Stop 都不表示 Claude 程序退出。多个运行分别保留，重复 clear/compact/resume 不加倍。API超时/不可用按观察失效处理，不声称 Claude 被终止。

Main/UI从不启动 Claude，不发布 SessionObservation，不伪造 idle/任务成功。Renderer 消费同一 Configurations 源，首页仅静态陪伴；缺动画仍正常静态回退。pi Adapter/guard/撤回与保留测试不变。

## 兼容与边界

当前仅本机 macOS，helper依赖系统 libproc；其接口并非承诺稳定的公开跨版本 API，需按本机版本实测，失败不回退到 ps/进程名。dev/build 用已有 clang 编译自有 helper，没有安装依赖或打包。真实 npm Claude2.1.301 的祖先结构/原hooks并存仍待精确授权验证；隔离 Node/C 程序和旧 --init-only 证据不能代替日常验收。后台/远端/桌面宿主不在本切片范围。

来源：[Claude hooks](https://code.claude.com/docs/en/hooks) 与 [插件说明](https://code.claude.com/docs/en/plugins)。使用标准 command hook 字符串；没有依据当前网页就假定本机版本支持新 JS/mod 或 exec-form 功能。

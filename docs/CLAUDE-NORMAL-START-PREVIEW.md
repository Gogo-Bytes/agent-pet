# 本机 Claude 普通启动接入：精确操作预览

状态：代码/隔离验证阶段；以下日常目标操作尚未授权，不执行。

## 目标和读取

- Claude 默认用户配置目录 `/Users/gan/.claude` 与祖先目录 metadata；仅 `settings.json`，最多64KiB，检查 UTF-8/JSON/hook结构、禁用意图、权限/身份及自有条目重复情况。不读取 auth、credentials、项目/会话/对话文件，不枚举目录内容或输出原设置值。
- 原程序入口 `/Users/gan/.nvm/versions/node/v22.18.0/bin/claude` 的有界链接/祖先 metadata及对应 package.json（最多64KiB），只支持已隔离核对的 npm2.1.301/bin/claude.exe。不得改程序/安装包或 shell配置。
- 本产品现有 `/Users/gan/Library/Application Support/@agent-pet/desktop` 中仅已有 Configurations/偏好及新 Claude 自有材料；不迁移、覆盖或重建 pi receipt/runtime，不自动恢复 pi。

## 一次性追加

1. 在正式 dev 保存或复用 Claude配置记录，保留其他配置/名称/宠物绑定和偏好。新记录 UUID 由既有 Main API生成；实际确认弹窗展示唯一完整目录。
2. 独占新建本产品目录 `/Users/gan/Library/Application Support/@agent-pet/desktop/claude-normal-<本次配置UUID>`（0700）。仅五份0600文件：observer.cjs、activation.json、hook.json、settings-before.json、receipt.json。原配置备份和私有凭据始终留本机，不进日志/Git/截图。目录或文件已有/被改/身份不明就保留并停止，不能覆盖旧 launcher 材料。
3. 仅在预览和再次核对允许时，在 `/Users/gan/.claude/settings.json` 追加一个 SessionStart（startup/resume/clear/compact）command hook，命令只引用本产品 Electron 和私有 observer/activation 路径，不包含凭据。原设置及原 hooks 的字节保持，只局部插入本条；已有文件保留权限，若不存在则新建0600。独占 `/Users/gan/.claude/settings.agent-pet.pending.json` 后 fsync/比较/rename；失败保留现场，不自动清理或恢复整份原配置。读取/保存期间请勿让其他工具同时保存 Claude 设置。
4. 使用 dev 与上述同一产品 profile，不打包。若需切换已有 dev，只正常退出/启动 Agent Pet，可能短暂停止状态接收；不终止、启动、重载或控制任何现有 Claude/pi，不动 pi 配置。Electron 可写正常自有缓存。

## 激活与观察

由用户自己在可信目录正常运行 `claude`；首次设置后新开一个会话，原会话不被接管。必要的工作区信任由用户决定，不能绕过。Agent不自动登录、发送任务或模型请求，不产生模型额度消费，不安装依赖。

用户启动触发本产品 hook 后，允许自有 helper 只读核对该 hook PID 与最多15级祖先，以及核对出的确切 Claude PID：UID、PID/PPID、微秒启动时间、可执行路径；随后每秒只检查该已知 Claude PID直至退出/暂停/应用关闭。没有全进程扫描，不读参数、环境、cwd或对话。检查不到可靠身份就保持未连接，不降级猜测。

## 暂停、移除和失败

暂停只关闭观察连接并保存暂停状态；原Claude任务继续，hook在应用不可用时静默退出。重新打开 Agent Pet 会恢复未暂停的观察，主动暂停不会被覆盖。旧运行没有新启动回调时不自动认领。

移除确认只撤回完全匹配的本产品 hook 和产品配置记录；后续用户修改的其他设置/hooks保留。修改过/有歧义的产品条目、失败现场和记录保留，不能宣称清理完成。私有运行文件保留，避免已加载 hook 引用缺失文件。不会自动恢复原备份覆盖新设置，不删除用户文件、Agent程序或其他 hooks。

本次仍只验收连接/退出/首页陪伴，不把任务动作、错误/完成提醒、桌面宿主或发布标为通过。

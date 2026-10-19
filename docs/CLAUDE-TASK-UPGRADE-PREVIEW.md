# 当前 Claude 连接：任务反馈升级预览

状态：**待用户精确授权，尚未执行**。2026-10-19全量1121通过/1跳过、类型检查与源码构建通过，独立代码复核无新确定缺陷。首次启动自检曾超时，本轮复验通过但风险仍保留。继续 dev，不打包。

目的：保留现有配置，让正常启动的 Claude 提供工具操作和回答出错反馈。原连接 UUID `96b61d46-b8b4-4c45-bb1e-7415b4f6f312`、名称、宠物绑定和 pi 配置保留。完成、取消与持续等待仍不猜测。

## 读取范围

- `/Users/gan/.claude` 及祖先目录 metadata，只读 `settings.json`，最多 64KiB，检查现有自有条目/共享 hook 结构/禁用意图，不输出原配置。
- `/Users/gan/.nvm/versions/node/v22.18.0/bin/claude` 到 `/Users/gan/.nvm/versions/node/v22.18.0/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe` 的有界链接/祖先 metadata，以及该包 `package.json`（最多64KiB），只核对已支持安装，不执行程序。
- 现有产品 userData 的配置元数据、偏好，以及下列确切私有目录中的自有材料；不读 Claude auth/credentials、会话、transcript、对话或其他配置文件。

## 写入范围

私有目录：`/Users/gan/Library/Application Support/@agent-pet/desktop/claude-normal-96b61d46-b8b4-4c45-bb1e-7415b4f6f312`（0700）。

1. 独占新建 `upgrade-before.json`（0600），保存旧 observer/hook/activation/receipt，仅留本机、不输出、不进 Git。原 `settings-before.json` 不变。
2. 更新 `hook.json`、`observer.cjs`、`activation.json`、`receipt.json`，通过对应 `.pending` 独占文件校验/fsync/rename；均0600。接收凭据轮换，不输出。已有未知/编辑/pending 数据则保留并停止。
3. 仅局部追加 `/Users/gan/.claude/settings.json` 中 Agent Pet 自有的 SessionEnd、UserPromptSubmit、PreToolUse、PostToolUse、PostToolUseFailure、PermissionRequest、Notification（permission_prompt）、Stop、StopFailure、PreCompact、PostCompact hook 组。现有 SessionStart 条目、其他 hooks/设置及原文件权限保留。使用固定 `settings.agent-pet.pending.json` 独占保存与再次比对；失败不覆盖未知数据，不整份恢复备份。
4. 正常退出/重开同 profile 的 Agent Pet dev，可能短暂断开观察、清空气泡；不会启动、重载或结束任何 Claude/pi，不自动恢复 pi。Electron 只写正常产品缓存与上述接收记录，创建独占认证 loopback 接收端口，无公网监听。
5. 可独占新建 `/tmp/agent-pet-claude-task-20261018-a83c9f`（0700），仅创建 `source.txt`（0600）作用户随后选择的读写测试；不访问其他工作文件。测试结果由用户自己在该目录运行的 Claude 写入，不自动发送模型请求。

## 生效、验证和撤回

你在可信目录自己新开 Claude 会话；既有会话继续运行，不接管它们。由你决定工作目录信任/权限和任务请求及模型费用。先只确认新会话是否在线，再给你限定在上述目录的测试任务。

接收器监听前仅对应用自身PID执行一次最长3秒的助手自检；失败则不开始接收，不自动重试。实际Agent检查仍限250ms，不读取其参数或环境。此前发生过冷启动自检超时，本轮未复现，仍有启动失败风险。

每个新 hook 只保留原生 session/prompt/tool 编号和固定类别；Main 私有层每次核对该 hook 与最多15级祖先、确切 Claude PID/UID/微秒出生时间/可执行路径，不读参数、环境或工作内容。后续每秒仅核对已知 Claude PID，直至退出/暂停；无整机进程扫描。Application/Renderer 只接收随机别名、类别、状态和配置名称。

暂停仅停止观察，Claude 继续运行。移除连接只撤回精确匹配、未修改的 Agent Pet hook 组，保留其他设置、所有用户文件和私有恢复证据；原组有改动或结果不确定则保留并提示。不会自动整份恢复旧 settings 覆盖后来修改。无依赖安装、更新 CLI、登录或打包。

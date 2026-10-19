# 本机 Claude 命令入口修复预览

2026-10-19，待用户授权。

原因：登录交互 zsh 当前选择 Node v22.22.3；现有 Claude 在 v22.18.0 中，`command -v claude` 未找到。`/Users/gan/.local/bin` 已在 PATH 中。

仅独占新增符号链接 `/Users/gan/.local/bin/claude` → `/Users/gan/.nvm/versions/node/v22.18.0/bin/claude`。目标指向原来的 Claude 可执行文件，不安装或复制程序，不修改 shell 配置、Node 选择、Claude/pi 配置或 hooks。已有任何同名文件或链接则停止、不覆盖。

验证：新登录交互 zsh 中运行 `command -v claude` 并核对解析后的目标；不启动 Claude 会话、不发送模型请求、不打包。用户随后正常输入 `claude` 验证主界面。

撤回：仅当链接仍精确指向上述目标时删除本次新建链接；原程序和配置保留。若将来移除 v22.18.0 的原安装，此快捷入口会失效，需随安装迁移更新。

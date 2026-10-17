# 本机自动发现检查预览

状态：待用户授权。代码与隔离结果见 [安装发现](CLAUDE-DISCOVERY-DESIGN.md)。本次不修复终端命令、不安装另一份 Claude、不改 hooks。

## 运行与应用自有记录

正常启动新版未打包 dev，沿用 `/Users/gan/Library/Application Support/@agent-pet/desktop` 的配置与偏好。正常退出本轮隔离测试实例；不启动、重载、关闭或取消任何 Agent，不发模型请求，不接管旧会话。

应用启动恢复已有 Claude 接收时，会核对现有私有材料及 `/Users/gan/.claude/settings.json`（最多 64 KiB），轮换原私有目录 `claude-normal-96b61d46-b8b4-4c45-bb1e-7415b4f6f312` 的 activation.json/receipt.json；不改 settings/hooks、observer、备份或授权范围。pi 不自动恢复。旧 Claude 进程没有新的启动回调时不会被认领。

## 自动扫描的一次只读范围

- 当前 GUI PATH 最多 32 个绝对目录，各自仅核对 pi/claude 入口。
- `/Users/gan/.local/bin/{pi,claude}`、`/opt/homebrew/bin/{pi,claude}`、`/usr/local/bin/{pi,claude}`。
- `/Users/gan/.nvm/versions/node` 一层，最多 64 条目录项/16 个版本，各自 `bin/pi`、`bin/claude`。
- 上述入口有界链接（最多 8 次）、祖先安全 metadata 和对应安装包 package.json（每个最多 64 KiB）。不读程序正文、不执行 pi/Claude/npm/brew，不读 shell 配置、登录信息、会话或对话，不递归扫描链接目录。

预期：已核对的 npm Claude 2.1.301 可接入；同一实际程序多入口合并，不同安装分别显示；官方/Homebrew 路径线索待验证。已有 `/Users/gan/.claude` 配置显示“查看配置”，不重复创建。

停在扫描结果/查看已有记录，不点击新配置的检查或写入确认。取消会终止后续检查，已经发出的只读 OS 请求返回后释放；不删除发现的文件。

## 不包含的操作

不创建 `/Users/gan/.local/bin/claude`，不改 PATH、`.zshrc/.zprofile`，不升级/迁移/卸载，不发送模型任务。终端入口修复和其他安装方式的真实加载另给精确预览。

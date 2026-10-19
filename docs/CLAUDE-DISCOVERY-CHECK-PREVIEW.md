# 本机自动发现检查预览

状态：用户已授权，2026-10-17 解锁后完成本机扫描与已有配置查看。代码与隔离结果见 [安装发现](CLAUDE-DISCOVERY-DESIGN.md)。本次不修复终端命令、不安装另一份 Claude、不改 hooks。

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

## 本机执行结果（2026-10-17）

Mac 解锁后通过应用菜单正常退出隔离实例，确认其自有 9482 与原日常 9477 均未监听；以原 `daily-bootstrap.cjs` 启动新版未打包 dev，沿用原 userData，Renderer 为 `http://127.0.0.1:5476/management.html`。没有使用隔离 HOME/路径排除或 picker doubles 运行日常配置。

实际在正式 Electron 中打开连接页、自动扫描并确认原生只读范围，结果：

| 类型 | 版本 | 入口 |
| --- | --- | --- |
| Claude Code | npm 2.1.301，可接入 | `/Users/gan/.nvm/versions/node/v22.18.0/bin/claude` |
| pi | 0.85.1 | `/Users/gan/.nvm/versions/node/v22.22.3/bin/pi` |
| pi | 0.85.1 | `/Users/gan/.nvm/versions/node/v24.20.0/bin/pi` |

两个默认目标都显示“查看配置”，无需重新选择文件夹或程序。点击 Claude 的查看入口后，正式详情显示原名称 `Claude code`、原路径 `/Users/gan/.claude` 与“等待启动”。只读类型化 bridge 确认记录仍为原两条、原 UUID/路径，Configurations notice 为 none；Claude configured=true、waiting/0/notice none，pi disconnected/resume-required，没有自动恢复 pi。

pi 的扫描状态为 complete；组合页面提示范围受限，对应 Claude 的不完整扫描。此次没有进一步重扫或定位受限原因，不能宣称整机所有安装均被发现，也不能据此断言没有官方/Homebrew 安装。此次只证明列出的真实安装发现与已有记录复用通过，不扩大其他安装方式兼容验收。

没有执行 Agent、发送模型请求、点击新增检查/写入确认、改变 hooks/shell/PATH/安装或重新配置。Claude 当前等待正常新会话，旧会话不被自动认领。dev 保持运行，未打包；此前真实启动/Home 验收不以这次 waiting 状态重标为通过或失败。

实际正式 Electron 截图：`/private/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-discovery-ui-ssrrkfix/scan-native-real.png`。截图显示实际安装数量、已有配置入口和受限提示；展开后的路径/版本另由原生 AX 树核对。CUA 短时返回旧画面的限制仍保留，未将旧截图与展开态混为同一证据。

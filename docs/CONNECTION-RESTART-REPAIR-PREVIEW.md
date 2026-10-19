# 重启后连接恢复：本机修复预览

2026-10-19。用户要求修复重启恢复和多余 pi 记录；继续 dev，不打包。

## 本次操作

先正常退出 Agent Pet，再迁移下面的本产品记录：

- `/Users/gan/Library/Application Support/@agent-pet/desktop/pi-connection/connection.json`：原来的空记录保持为空，补充磁盘身份；不删除记录。
- `/Users/gan/Library/Application Support/@agent-pet/desktop/configuration-a276f3bb-ff79-4cfb-9a15-70caa844abc4/pi-connection/connection.json`：核对原扩展摘要、文件身份和权限后更新磁盘身份；保留连接名称、目标、原通信地址和接收凭据。
- `/Users/gan/Library/Application Support/@agent-pet/desktop/claude-normal-96b61d46-b8b4-4c45-bb1e-7415b4f6f312/hook.json` 与 `receipt.json`：只迁移目录身份和对应摘要，保留 hooks 内容、程序路径和暂停状态。

每组迁移先在其本产品父目录独占保存 `identity-migration-<随机UUID>.json` 原始记录备份（0600），不自动覆盖或回滚。任一字段、权限或内容与预期不符即停止；不把未知文件认作自有文件。

重启同一 userData 的新版 dev。Claude 按原规则恢复接收并更新本产品 activation/receipt。pi 通过「恢复连接」核对原扩展后，只在原保存地址的目录缺失时排他新建 `/tmp/ap-<原记录中的24位编号>`（0700）及其 `p.sock`；保存新的目录身份后才接收。已有未知目录/socket 不接管、不删除。检查一次正常退出和重开后的状态，恢复操作不启动 Agent。

## 读取范围和保持不变的内容

只读上述固定本产品记录及既有 Claude 私有材料、目录祖先 metadata；通过系统 `df`/`diskutil` 查询其磁盘 UUID。只读 `/Users/gan/.claude/settings.json`（最多64KiB）核对现有自有 hooks；只读 `/Users/gan/.pi/agent/extensions/agent-pet.ts`（最多64KiB）核对原摘要。对 pi settings 和 configurations.json 做有界摘要前后核对。

不写 Claude/pi settings、token、服务地址、其他 hooks 或扩展；不改变连接 UUID、名称、位置、宠物或偏好。不扫描其他 Agent，不安装，不启动/重载/取消 Claude 或 pi，不发送模型请求，不输出凭据，不打包。

修复后「等待 Agent」仅表示接收器就绪，不等于 Agent 已在线。需要新会话或 `/reload` 时由用户自行操作。原有 hooks 和扩展不会重新安装。

## 授权原因

AGENTS.md 与 MVP 要求真实目标操作有精确预览和授权。本次新增的是旧私有记录的一次迁移及原临时目录恢复，不能由旧的安装授权推定。代码和隔离验证先完成，再确认本次操作。

# 连接重启恢复

2026-10-19。代码与隔离验证完成；本机旧记录迁移及 dev 复验待按[操作预览](CONNECTION-RESTART-REPAIR-PREVIEW.md)确认。

## 原因与行为

macOS 重启后设备编号 `st_dev` 可能变化。旧 pi 私有记录、扩展归属和 Claude hook 目录记录把该编号作为跨重启身份，导致完整文件也被拒绝。旧 pi 空记录 `connection:null` 被判无效后，又通过 legacy 兼容入口呈现为第三条 pi；实际配置仍只有原两条，不能删除实际配置来掩盖该问题。

新持久身份保存 VolumeUUID，仍要求 inode、birthtime、类型/权限、uid、gid 相同。pi 文件另核对大小、链接数、修改时间和完整摘要。进入当前操作后继续严格核对 dev 和 fd/path 身份。磁盘查询失败、不同卷、文件替换或权限改变均拒绝；没有删减 managed guard。

- 新记录支持同一卷设备编号变化后的恢复。
- 没有 VolumeUUID 的旧记录仍按原严格身份检查，不会自动忽略设备编号。
- 旧记录通过显式迁移核对；只允许设备编号变化，保持其他身份与文件摘要。旧数据无法提供历史卷 UUID，因此这一步需要用户确认当前路径，并先保存私有原始备份。
- Claude 恢复只读检查现有 hooks；不重写 settings、token 或其他 hooks。
- pi 仍需显式恢复。原临时目录缺失时，先确认原扩展，再排他创建原目录，保存新目录身份后监听；原地址、token 和扩展字节保持不变。未知目录、socket、符号链接不接管。
- 有效空 legacy 记录不会生成连接行；真正损坏的记录仍显示问题，不隐藏。

## 实现入口

- `durable-file-identity.ts`：有界 `df`/`diskutil` 获取 VolumeUUID；查询前后核对路径身份。不使用跨操作缓存。
- `pi-connection-store.ts` / `pi-temp-deployment.ts` / `pi-connection.ts`：保存、归属重新核对和显式恢复。
- `claude-user-hook.ts`：将持久目录身份重新核对为当前操作身份。
- `connection-identity-migration.ts`：只读准备、单次计划、外部私有备份、固定记录迁移。未接入自动启动迁移；主应用不偷偷认领旧记录。
- `ClaudePresenceStore.replaceHookIdentity`：仅显式迁移调用，保留其他材料和 disabled 状态；部分写入失败保留备份并拒绝使用。

## 验证与限制

`pnpm exec vitest run --maxWorkers=1`：96 文件，1157 passed / 1 skipped。覆盖设备编号变化、不同磁盘、inode/权限/文件变更、空记录、缺失 runtime、已有 socket、竞争创建、保存失败、原 hooks/token/暂停状态保留和迁移过期。

首轮直接在测试里重复调用系统磁盘工具，4 个 Claude 用例超过 5 秒并产生 worker 通讯超时。改为测试边界模拟这两个系统查询，保留其余进程调用及原断言/超时；卷查询本身有独立测试。随后上述全量通过。真实仓库路径的系统查询成功，但这不替代本机旧连接的 dev 验证。

`pnpm typecheck` 与 `pnpm --filter @agent-pet/desktop build` 通过。独立审查发现的部署后身份捕获失败提示、迁移 runtime symlink/悬空 pending/空记录处理均已修复；执行脚本也改为首个失败即停止并检查保护文件。只进行源码构建，不生成安装包。真实 Agent 在线需其实际事件，等待接收不等同已连接；Claude 真实任务反馈、其他安装方式、其他 Agent 与正式发布不在本阶段验收内。

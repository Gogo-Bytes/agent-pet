# 连接重启恢复

2026-10-19。代码与隔离验证完成；用户已按[操作预览](CONNECTION-RESTART-REPAIR-PREVIEW.md)授权，本机三组旧记录迁移成功。dev 首次及正常重开后的 pi 真实连接通过；用户随后新开 Claude 并确认已连接，Claude 接收恢复与新会话在线通过。

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

## 本机迁移与 dev（2026-10-19）

首次界面捕获失败，用户正常退出后执行迁移。三组应用私有记录均成功，每组保存0600原始备份；Claude/pi settings、pi扩展及configurations.json迁移前后摘要一致。没有修改共享token/hooks、连接名称或位置。

同一userData启动标准dev（localhost:5173），正式界面显示「我的连接02」和原pi默认配置、Claude code，多余legacy pi消失。pi点击「重新连接」后显示「已连接」，证实原已运行扩展实际通信。随后通过应用菜单正常退出（dev退出0），再次dev启动。只读复核：空legacy有效、pi记录有效、原endpoint/token与备份相同、runtime目录存在、Claude store和12组hooks验证通过。

第二次启动后原生AX点击未切页，坐标点击返回windowNotFoundAtPosition；按有界规则停止该交互路径，已请用户手动检查两条连接并显式恢复pi。随后用户确认第二次pi「已经连接」、Claude code「等待启动」。因此应用重开与pi再次连接通过；Claude恢复到等待新启动事件，不代表已在线。未实测重启macOS。当前dev保持运行，未启动/重载/控制Agent、未打包/推送。

用户最终核对：列表按本次任务保留原配置，pi重连成功；Claude等待启动。当前Claude实现不会在Agent Pet重开后自动认领已运行但没有新SessionStart事件的旧会话，用户随后使用原绝对路径启动新会话，并确认 Agent Pet 显示已连接；新会话在线验证通过，任务反馈未在本次验证。这是现有生命周期能力限制，不能把等待启动误报为已连接或token失效。

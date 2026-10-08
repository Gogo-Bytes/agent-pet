# Agent Pet 产品需求（当前本地 MVP）

当前执行顺序、实现状态与验收以 [MVP 执行计划](docs/MVP-EXECUTION-PLAN.md) 为准；本文定义产品行为，不把历史生产门槛或已规划能力当作交付事实。

## 1. 产品目标

先在单用户本机 macOS 上交付可独立运行的桌宠应用，观察用户已经安装并明确配置的 pi Session，通过跟随一个可拖拽 3D 宠物的多个气泡表达重要状态。Windows、Codex、Claude Code 留待后续，不作为当前 MVP 验收项。

MVP 是只读观察产品，不控制 Agent；观测扩展的部署仍需针对具体目标的写入预览和明确授权。

## 2. 核心用户体验

- 一个宠物对应多个独立 Session。
- 每个 Session 最多对应一个气泡。
- Session 不聚合、不去重；重启后的运行视为新 Session。
- 气泡与宠物一起移动。
- 宠物可拖拽。
- 气泡可独立点击。
- 点击气泡后：确认该 Session 已读；移除气泡；尝试打开对应 Agent 窗口。
- 支持独立隐藏/显示气泡和宠物。

## 3. 一期显示范围

只向用户展示：

- `working`：正在工作
- `completed-unread`：已完成但未读
- `error-unread`：发生错误但未读

气泡内容仅包含：

- Session 名称
- Session 状态

名称 fallback 顺序：Agent 原生名称 → 项目名称 → Adapter 生成名称。

## 4. Session 生命周期

```text
working -> completed-unread
working -> error-unread
completed-unread -> acknowledged -> hidden
error-unread -> acknowledged -> hidden
```

一期不要求未读状态跨应用重启恢复。idle 是无工作/无未读时的基线，不新增 idle 通知；连接健康状态与 Session 业务状态分开，失联不伪造完成或错误。

## 5. Agent 接入边界

支持已安装并已配置 Adapter 的 Agent Session，不承诺自动发现机器上所有任意 Agent 进程。

- 当前仅 pi：复用现有只读 Adapter/扩展；真实目标部署、连接及完整端到端仍待验收，不能把开发 bridge 或休眠 managed 核心当已交付产品接入。
- pi 的 Open Session 当前为 `unsupported`，不以新建终端或启动 pi 冒充打开原窗口。
- Codex、Claude Code 的候选 Adapter 与兼容性属于后续工作。

统一接口必须允许：

```text
open session -> success
open session -> unsupported
open session -> not found
open session -> permission denied
```

## 6. 宠物资产

当前 MVP 沿用现有内置 GLB 与动画，不把自定义导入作为接入闭环前置项。以下为后续自定义资产能力的约束，不表示已实现：

- 只支持 GLB。
- 允许用户导入自定义 GLB。
- 导入前必须验证格式、大小、纹理、几何、骨骼和动画复杂度。
- 宠物资产至少应能提供 idle 动画。
- working、success、error、attention 等动画为可选能力。
- 缺少动画时使用确定性 fallback，不得导致宠物不可用。
- 一期不支持远程模型下载和未经审计的外部纹理。

## 7. 暂不包含

跨用户隔离、完整 socket ACL/peer 验证、原生 syscall 故障注入、正式签名/公证/更新流水线与自动恢复/reset/revoke-all 延后，不阻塞本地 MVP；它们仍未验证/未实现，既有保护和数据保留约束不删除。独立本地应用包仍是 MVP 交付项，未签名/本地签名的限制必须明示。

- Agent 控制、审批、暂停、发送消息
- 多宠物
- Session 聚合/去重
- 云同步
- Linux 正式支持
- VRM、FBX 等其它模型格式
- 精确 token 进度
- 宠物商店和社区市场

## 8. 主要验收场景

1. 启用一个 Adapter 后，正在工作的 Session 出现 working 气泡。
2. Session 完成后，同一气泡转为 completed-unread。
3. Session 出错后，同一气泡转为 error-unread。
4. 点击完成或错误气泡后，气泡消失并尝试打开 Agent 窗口。
5. 多个 Session 同时存在时，显示多个独立气泡。
6. 拖拽宠物时，所有气泡同步移动。
7. 隐藏气泡时，宠物仍可单独显示。
8. 内置宠物在无连接时仍可使用；未来启用自定义 GLB 导入时，超限或损坏模型须被拒绝并保留当前宠物。
9. Agent 无法连接或打开窗口时，宠物仍可运行并显示可理解的失败状态。
10. 应用重启后，不要求恢复历史未读 Session。

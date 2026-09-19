# Agent Pet 产品需求（一期）

## 1. 产品目标

在 macOS 和 Windows 桌面显示一个可拖拽的 3D 宠物，监控用户已经安装并配置的 Codex、pi、Claude Code Session，并通过跟随宠物的多个状态气泡表达重要状态。

一期是只读产品，不控制 Agent。

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

一期不要求未读状态跨应用重启恢复。

## 5. Agent 接入边界

支持已安装并已配置 Adapter 的 Agent Session，不承诺自动发现机器上所有任意 Agent 进程。

- Codex：由 Codex Adapter 提供观测和打开 Session 能力。
- pi：由 pi Adapter 提供观测和打开 Session 能力。
- Claude Code：由 Claude Code Adapter 提供观测；打开窗口能力视本地运行方式而定。

统一接口必须允许：

```text
open session -> success
open session -> unsupported
open session -> not found
open session -> permission denied
```

## 6. 宠物资产

- 一期只支持 GLB。
- 允许用户导入自定义 GLB。
- 导入前必须验证格式、大小、纹理、几何、骨骼和动画复杂度。
- 宠物资产至少应能提供 idle 动画。
- working、success、error、attention 等动画为可选能力。
- 缺少动画时使用确定性 fallback，不得导致宠物不可用。
- 一期不支持远程模型下载和未经审计的外部纹理。

## 7. 暂不包含

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
8. 导入超限或损坏的 GLB 时被拒绝，并保留当前可用宠物。
9. Agent 无法连接或打开窗口时，宠物仍可运行并显示可理解的失败状态。
10. 应用重启后，不要求恢复历史未读 Session。

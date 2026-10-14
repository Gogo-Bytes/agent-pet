# 正式多配置 pi 隔离实机验证 · 2026-10-14

状态：**VERIFIED（真实部署、空闲连接、多 peer、多配置、干净应用重启、停用与选择性撤回范围）**。不是正式 UI 用户认可、真实模型任务全矩阵或发布验收。用户回复“授权该隔离范围”，并在 A 的原生手动添加弹窗中选择 pi；原生类型选择有人工协助，不能称全程无人操作。授权原文范围见 [操作预览](PI-LIVE-CONNECTION-PREVIEW.md)。

## 环境与实际路径

隔离根为 `/Users/gan/Desktop/🥷/agent-pet-live-20261014-pdakiqzh`；A/B 分别为 `pi-a`、`pi-b`，工作目录 `work`、HOME `home`，Electron 以明确的 `--user-data-dir=…/app-data` 隔离。现有 pi CLI 为 `/Users/gan/.nvm/versions/node/v22.22.3/bin/pi`，安装包版本 **0.85.1**；未修改安装包、复制凭据、登录或发起模型请求。

在线与重启主验证用源码外未签名 arm64 包 `/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-8Izmcb/mac-arm64/Agent Pet.app`。停用提示修复最终实机包为 `/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-zDYhkH/mac-arm64/Agent Pet.app`；均自带运行时，不需要开发服务器。临时包可能被系统清理，正式入口为 `pnpm --filter @agent-pet/desktop dev` 或重新执行 `pnpm package:mac`。

## 已实际通过

| 操作 | 可复查结果 |
| --- | --- |
| 正式手动添加 A/B、读取批准、类型检查、命名、独立部署预览与确认 | 仅创建各自 0600 `extensions/agent-pet.ts`；真实 pi TUI 的 Extensions 显示该文件，收到有效 legacy hello |
| 同配置 A 同时运行两个 pi 进程 | 退出一个仍保留 A 的宠物；退出最后一个变为空态，失效聚焦清除 |
| A/B 同类不同配置同时运行 | 首页同一场景显示两只实际 starter GLB，配置身份不去重；AX 的等价聚焦入口独立 |
| 原位重命名与跨页 | 保存为“pi-A 实机验证”“pi-B 实机验证”，首页聚焦/列表一致，重启后保留 |
| pi 保持运行，正常退出/重开应用 | 应用正常 exit 0；启动仅恢复自身 metadata、没有 socket/在线宠物；明确恢复 A 后只有 A，再恢复 B 后两者在线 |
| 移除 A，B 仍运行 | A 元数据及仍匹配的自有扩展撤回；B 仍在线，可聚焦显示 pi / 小伙伴 / 陪伴中 / pi-B 实机验证 |
| 停用 B、正常重启应用 | disabled 保存，socket 不存在，扩展仍保留，首页空态；未自动监听 |
| 最终新包对已停用 B 刷新检查 | 配置检查可用，提示“已保存停用；当前未开始监听”，私有记录仍 disabled=true、socket 不存在；不是通信在线 |
| 正式确认移除 B、退出 pi/应用 | 配置记录为空，A/B 扩展均不存在；pi 正常 Ctrl-D，应用原生菜单退出 exit 0；settings/auth 文件及其他 pi 数据保留 |

停止接收或撤回文件不等于运行中扩展已卸载；最后单独正常退出所有测试 pi。没有清理未知目录、日常目标或历史 native fixtures。

## 本次修复与自动化

保存停用重启后原 UI 未区分 ready 与 disabled。本次仅在 `resume-required + disabled` 显示停用文案，失败原因不被覆盖。独立审查指出刷新也可能读目标/校验文件，已同步修正通用恢复提示，避免声称“只有恢复才读取”。

新增正式管理行为测试覆盖显式 scoped 刷新/恢复、无自动恢复、成功后提示消失及恢复拒绝原因保留；旧 Main 注释校准为多 peer 汇总，未改变 managed 语义。全量 `pnpm test`：**630 passed / 1 skipped / 67 files**；`pnpm typecheck`、desktop build（package:mac 内执行）、`pnpm package:mac`、`git diff --check` 通过。独立 subagent 审查 **READY**，18 项 focused 通过。原失败关闭、部署撤回和数据保留测试全部保留；Three.js 多实例警告、原 skip 仍保留。

## 异常与覆盖限制

首次以短命 shell 启动的应用子进程被结束，随后 CUA 自动打开默认 profile；正常退出后改用保持等待的启动器并校验 PID、显式隔离 profile。该次没有部署/启动 pi，但不能声称完全未读取默认应用资料。

首次启动 pi 时，虽然禁用了 tools，pi 仍自动下载 fd 与 rg 到隔离 `pi-a/bin`。这超出了预览“不安装依赖”的约定，已当场向用户说明并退出。下载完成的两个文件保留：fd 2,970,480 bytes、rg 4,014,576 bytes。后续根据已安装源码明确设置 `PI_OFFLINE=1`、`PI_TELEMETRY=0`；B 提示离线跳过缺失工具下载，未再安装。不能把第一次下载写成已授权依赖安装或“全程无安装”。无模型凭据继承或模型请求。

原生 CUA AX/截图有缓存、类型下拉需人工协助、坐标点击失败和间歇捕获失败。用当前包重新绑定及原生菜单打开管理窗口取得实际状态，不绕过 UI/IPC；最终截图来源为真实正式包。独立审查为源码/测试审查，没有独立操作真实目录，不能外推为第二位人员完整实机验收。

## 实际正式包截图

- [A 类型确认（不是部署预览）](evidence/management-migration/pi-live-type-a.png)、[B 部署预览](evidence/management-migration/pi-live-preview-b.png)
- [A 部分 peer 退出仍在线](evidence/management-migration/pi-live-one-peer-remains.png)、[最后 peer 退出空态](evidence/management-migration/pi-live-all-exited.png)
- [真实 A/B 两配置宠物](evidence/management-migration/pi-live-two-configurations.png)、[重启后名称保留且需明确恢复](evidence/management-migration/pi-live-restart-saved.png)
- [撤回 A 后 B 聚焦](evidence/management-migration/pi-live-b-after-a-removal.png)
- [新包停用后刷新](evidence/management-migration/pi-live-disabled-refresh.png)、[全部撤回后的连接空态](evidence/management-migration/pi-live-withdrawn.png)

部分截图左上角有系统捕获提示遮挡，内容未拼接或编辑；其他真实在线截图可见原生红/黄/绿按钮，覆盖之前只有 AX/遮挡截图的局部限制。

## 后续边界

真实 working/完成/确认/取消/下一轮及自然错误，本轮未发起；历史用户结果仍保留原范围。登录/费用相关模型任务由用户单独执行。日常 pi 配置、系统登录项、GPU/功耗、原生宽窄矮全矩阵、宠物包导入和更多资产、新 Provider、完整 D6 与签名公证/发布均未因本轮通过。后续按 MVP 顺序补相应证据。

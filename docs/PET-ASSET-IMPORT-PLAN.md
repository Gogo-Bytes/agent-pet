# 宠物资产导入实施计划与进度

**状态：P1 资产注册表实施中；导入 UI 尚未接入。**
**范围：单用户、本机 macOS、Electron/Chromium；暂不依赖 Agent 新接入或真实任务验收。**
**当前执行入口：[MVP 执行计划](MVP-EXECUTION-PLAN.md)。**

## 1. 目标

让艺术家交付的宠物文件包可以被用户通过“添加宠物”一次导入，并在 Agent Pet 中：

1. 经过有界、安全校验后保存到应用私有资产目录；
2. 出现在宠物收藏中；
3. 可预览、选中和切换；
4. 可绑定到一个或多个 Agent 配置；
5. 在首页和桌宠场景中动态加载对应 GLB；
6. 在重启后保留；
7. 可以明确删除、恢复或处理重复版本。

不在本阶段解决：Agent 新接入、真实任务稳定性、在线模型请求、云端同步、资产市场、Windows 支持。

## 2. 当前基线

### 已有

- 内置 `packages/pet-runtime/assets/starter.glb`。
- `pet.json` manifest 模板及 `validatePetManifest`。
- schema v2、动作目录 v1、23 个可选动作槽位。
- 动画映射、缺失动作回退、无动画静态展示。
- `PetBinding`、宠物名称、Agent 绑定/解绑和多 Agent 投影。
- 正式 R3F 播放器、Three.js GLB 加载、动画清理和测试。
- 宠物收藏 UI 与“添加宠物”占位入口。

### 明确缺口

- 没有文件选择器或包读取器。
- 没有宠物资产注册表。
- `PetBinding.assetId` 目前只允许 `'starter'`。
- `ScenePet` / `PetModel` 固定加载 `starter.glb`。
- 没有导入目录、版本、重复、删除、恢复和迁移策略。
- manifest 校验尚未接入实际文件安全校验。
- 没有真实外部 GLB 的 Electron 验收。

## 3. 首版包格式提案

首版采用**普通宠物文件夹**，艺术家只需要准备三个文件：

```text
my-pet/
├── pet.json       # 必需，文件夹根目录
├── pet.glb        # 必需，文件夹根目录；由 pet.json.model 指定
└── portrait.webp  # 可选，文件名和图片格式由 pet.json.avatar 指定
```

首版不支持子目录、不支持外部纹理、不支持多个模型；头像文件名和格式不固定，由 `pet.json.avatar` 指定。头像缺失或不匹配时回退默认头像。动画名称也直接写在 `pet.json`，不再增加额外清单文件。

约束：

- `pet.json` 必须位于包根目录，避免首版处理任意嵌套根目录。
- `model` 首版必须严格为 `pet.glb`，避免艺术家处理路径规则。
- 禁止绝对路径、`..`、符号链接、设备文件、外部 URI 和外部纹理依赖。
- 首版只接受根目录下的 `pet.json`、`pet.glb`，以及由 `pet.json.avatar` 指定的可选头像文件；不引入子目录、外部资源或任意脚本。
- 文件夹名称不是资产 ID；资产 ID 由应用生成并持久化。
- 原始导入文件不作为运行时信任来源，应用只使用经过校验并复制到私有目录的内容。
- 用户通过系统目录选择器选择整个宠物文件夹，不选择散落文件。

不处理 zip 或其他压缩格式，避免艺术家交付格式分叉和应用内解压复杂度。

## 4. 目标领域模型

建议新增独立资产记录，不把完整 manifest 塞入 Agent 配置：

```ts
type PetAsset = {
  id: string;
  manifest: PetManifest;
  modelPath: string;       // 应用私有目录中的已校验文件
  directory: string;       // 应用私有资产目录中的记录目录
  importedAt: string;
  source: 'bundled' | 'imported';
  status: 'ready' | 'attention';
};
```

`PetBinding` 改为：

```ts
interface PetBinding {
  assetId: string;
  name: string;
}
```

约束：

- `starter` 作为内置资产保留兼容 ID。
- 删除资产前必须检查绑定关系；首版优先要求先解绑，禁止静默替换。
- 资产记录、绑定记录和全局宠物偏好分开保存。
- 导入失败不能留下可被运行时加载的半成品记录。

## 5. 分阶段实施

### P0：契约与存储设计（当前阶段）

- [x] 盘点当前 starter-only 宠物连接实现。
- [x] 建立本文档作为进度跟踪入口。
- [x] 冻结宠物文件夹格式：根目录 `pet.json` + `pet.glb`，头像由 `pet.json.avatar` 可选声明。
- [x] 冻结资产 registry、绑定和删除语义：首版先解绑再删除。
- [x] 确认 Electron 主进程 / preload / Renderer 边界。
- [x] 写出迁移策略：旧 `assetId: starter` 数据继续可读。

完成条件：模型、目录、错误分类和 IPC API 可被测试独立使用。

### P1：资产注册表与持久化（进行中）

- [ ] 在 shared 定义 `PetAsset`、registry state 和导入结果类型。
- [ ] 在 Main 建立应用私有 pet-assets 目录。
- [ ] 实现 0700 目录、0600 文件、原子写入和崩溃恢复边界。
- [ ] 注册内置 starter 资产，不复制或破坏现有包资源。
- [ ] 读取旧配置时兼容 `assetId: starter`。
- [ ] 增加 registry 损坏、缺失、重复 ID 和未知资产的明确状态。

验证：纯存储测试、重启读取、写入失败、残留临时目录和旧数据兼容。

### P2：导入预览与安全校验（Main 核心进行中）

- [x] 已实现普通文件夹检查、manifest 读取、GLB header 校验和头像签名校验。
- [x] 头像声明缺失/不存在/不支持时返回默认头像状态，不阻塞导入。
- [x] 已实现校验后复制到应用私有目录和 registry metadata 持久化。
- [x] Main 提供目录选择入口，Renderer 不直接读任意路径。
- [x] 检查所选路径为安全的普通目录，拒绝符号链接和不安全祖先。
- [x] 检查根目录下的必需文件，拒绝路径穿越、符号链接和非普通文件。
- [x] 读取并验证 `pet.json`。
- [x] 验证 `pet.glb` 存在且为 GLB。
- [x] 读取 `pet.json.avatar`；存在且匹配时校验图片类型和大小，否则使用默认头像。
- [ ] 对 GLB 做有限结构检查和大小上限；不执行包内代码。
- [x] 生成只读导入预览：名称、版本、作者、许可证、模型大小和头像回退状态。
- [x] 用户明确确认后才复制和注册；取消不产生资产。

验证：正常包、缺 manifest、坏 JSON、路径穿越、超大包、重复版本、非法动作映射、坏 GLB、取消和写入失败。

### P3：动态加载与切换（管理页第一版进行中）

- [x] `ScenePet` / 宠物预览场景已可接受导入资产的模型 URL 与动作映射。
- [x] Main 通过受控 IPC 返回已注册模型/头像字节，Renderer 使用短生命周期 Blob URL。
- [x] 收藏卡片已显示 manifest 声明的头像；头像读取失败回退图标。
- [ ] `PetModel` / 首页多 Agent 场景改为接受各自绑定的资产描述。
- [ ] 增加资产 URL / 本地路径到 Electron Renderer 的受控映射。
- [ ] 每个资产独立加载、缓存和释放；切换时不复用错误的 GLB。
- [x] 管理页预览使用 manifest 动画映射，不再默认使用 starter 的 `bundledAnimations`。
- [x] 导入模型使用通用包围盒；无动画继续静态展示。
- [ ] 对模型尺寸、零尺寸、非法 bounding box 做独立导入资产回退测试。
- [ ] 加载失败只影响该资产，不让首页/管理页整体崩溃。
- [ ] 验证多个不同资产同时渲染和切换后的资源清理。

验证：两个测试 GLB、无动画、缺 idle、坏动画引用、切换/卸载、多个首页实例和重启。

### P4：收藏、选中和 Agent 绑定

- [x] 收藏列表从 registry 读取，不再写死 starter。
- [x] “添加宠物”改为真实导入流程。
- [x] 支持选择当前预览资产并持久化；旧偏好自动回退 starter。
- [ ] 支持对资产重命名，但保留 manifest 原始信息。
- [x] Agent 绑定使用任意已注册 `assetId`。
- [x] 删除前检查绑定关系；当前 UI 提示先解绑。
- [x] 首版删除要求先解绑；失败时保留资产和绑定。
- [ ] 解决全局宠物名称与绑定名称的同步语义。

验证：空库、单资产、多资产、搜索、选中、绑定多个 Agent、解绑、删除阻止和刷新恢复。

### P5：真实 Electron 验收

- [ ] 隔离 userData 导入一个测试宠物包。
- [ ] 验证管理页导入预览、确认、取消和错误恢复。
- [ ] 验证宠物页、首页、桌宠/浮层的动态模型显示。
- [ ] 验证重启后 registry、当前选择和绑定仍正确（偏好恢复已接入，待 Electron 实机验收）。
- [ ] 验证 GPU/内存边界、模型切换和 WebGL 恢复。
- [ ] 验证导入路径、临时文件和删除后的私有目录状态。
- [ ] 记录截图、测试命令和已知限制，不把浏览器 mock 结果当作 Electron 通过。

### P6：交付与后续

- [ ] 完成艺术家交付包说明和示例包（含 `avatar.png`）。
- [ ] 增加资产迁移/备份说明。
- [ ] 评估包签名或信任来源，但不在首版伪造安全保证。
- [ ] 评估资产导出、恢复默认和版本升级。
- [ ] 独立提交阶段性 commit；不自动推送。

## 6. IPC 初步边界

建议由 Main 持有文件系统和 registry：

```text
pet-assets:list
pet-assets:choose-import
pet-assets:inspect-import
pet-assets:confirm-import
pet-assets:cancel-import
pet-assets:select
pet-assets:delete
pet-assets:subscribe
```

原则：

- Renderer 只拿脱敏 manifest 摘要、应用私有资产句柄和状态。
- Renderer 不接收任意绝对路径，不直接解压，不直接写 registry。
- 每次导入使用 requestId，旧预览不能确认新文件。
- confirm 必须引用仍然有效的预览计划。
- 导入过程可取消，失败关闭时保留原资产 registry 不变。
- 不记录原始包正文、GLB 内容或用户本地敏感路径到诊断日志。

## 7. 当前风险与决策点

1. **包格式**：`.pet` zip 是否比目录导入更适合用户，需要在 P0 冻结。
2. **GLB 校验深度**：首版应做结构/大小/资源边界检查，不能把完整 3D 安全分析假装成已完成。
3. **名称语义**：宠物显示名应属于资产，Agent 绑定是否允许覆盖显示名，需要在 P0 明确。
4. **删除语义**：首版采用“先解绑再删除”，避免多个 Agent 绑定时产生隐式替换。
5. **Renderer 加载路径**：需要使用 Electron 受控资源映射，不能把任意本地路径直接暴露给页面。
6. **性能**：多个高面数 GLB 和高分辨率纹理可能影响 Electron GPU；首版需要大小/面数/纹理预算。

## 8. 进度记录

| 日期 | 阶段 | 结果 |
|---|---|---|
| 2026-10-20 | 基线盘点 | 确认当前为 starter-only；绑定、动作和播放器已完成；导入、registry、动态加载未实现 |
| 2026-10-20 | P0 | 创建本计划；已冻结两文件 `.pet` 格式、先解绑再删除和 Main 持有文件系统边界 |
| 2026-10-20 | P1 | 开始实现共享资产类型与 Main 私有 registry；暂不接入导入 UI |
| 2026-10-20 | P0 修订 | 改为普通宠物文件夹；`pet.json` + `pet.glb` 固定，头像由 `pet.json.avatar` 声明，缺失时默认回退 |
| 2026-10-20 | P2 | 已接入 Main IPC、目录选择、导入预览、确认安装和宠物收藏 UI；动态模型切换仍待完成 |
| 2026-10-20 | P3 | 管理页预览已接入导入 GLB Blob URL、manifest 动作映射和头像 Blob URL；首页多 Agent 资产绑定仍待接入 |

每完成一个可以独立验证、独立回滚的阶段，更新本表、运行该阶段验证，并创建单一目的 Git commit。未完成阶段不提前标记为通过。

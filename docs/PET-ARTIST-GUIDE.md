# 宠物模型与动作

艺术家交付一个本地 GLB 和 `pet.json`。动作全部可选：只做模型、完全没有动画也可以；模型会保持默认姿势。当前应用仍只有内置宠物，本说明与模板不代表用户导入功能已开放。

复制 [完整模板](../packages/pet-runtime/templates/pet.json)，填写 `id`、`version`、`model` 和 `license`。`model` 是包内相对 GLB 路径。需要某个动作时，将对应的 `null` 改成 GLB 内动画的准确名称，例如：

```json
"animations": { "idle": "Breathing", "thinking": "LookUp" }
```

未实现的动作保留 `null`、删除该项，或省略整个 `animations` 都可以。不要求动画名称等于动作 ID；同一动画也可以映射到多个动作。

[动作目录 v1](../packages/pet-runtime/templates/action-catalog.json) 列出全部 23 种动作、中文含义、循环/单次规则与回退顺序。只有模型确实存在的动画才提供试播。工作细分动作缺失时，依次尝试工作、待机；完成和出错不会互相代替。最终都找不到时，恢复默认静态姿势，不报模型加载错误。单次动作结束后回到待机，没有待机则静态；减少动画会暂停播放。

Agent 不一定能提供每种状态。目录表示产品支持的表达方式，实际触发取决于当前接入的事件能力。鼠标、拖动、睡觉等交互动作也不要求由 Agent 提供。目录中列出不等于当前产品已接好触发。

格式版本 `schemaVersion: 2`，动作目录版本 `actionCatalogVersion: 1`。旧格式不带版本仍兼容。未知格式版本拒绝；未来正整数目录版本允许读取已知动作，未知动作忽略。可选动画里的非法值按未实现处理，不能让整个模型失败；模型路径和必要身份/许可字段仍校验。这不是完整的外部资产安全导入校验。

目录唯一源是 `packages/pet-runtime/src/actions.ts`，修改后运行：

```sh
node scripts/generate-pet-templates.mjs
node scripts/generate-pet-templates.mjs --check
```

dev 隔离检查页：启动 `pnpm demo:connections`，访问 `/pet-actions-review.html`。它使用正式 R3F 播放器与真实内置 GLB，可检查无映射、无待机、缺少引用动画和单次播放；不连接 Agent。零动画 GLB 的情况另有实际 Three.js 混合器测试覆盖。

# 界面内容设计规范

适用于 Agent Pet 的管理页、桌宠、原生弹窗、菜单、通知和共用文案。面向普通使用者，不要求用户理解我们的内部实现。目标不是字数最少，而是让用户知道当前状态、下一步和操作后果。

## 判断顺序

新增或保留一段文字前，回答：**删掉它，用户会在哪个具体决策上出错？**

1. 没有影响：删除，不换成另一句口号，也不藏进折叠区。
2. 控件名称不清楚：先改名称、分组或操作位置，不用副说明补救。
3. 当前步骤确实需要：就近显示一次；按钮表达动作，状态表达结果。
4. 只在特定条件下需要：在该条件出现时显示。
5. 偶尔查阅的细节：放到有明确名称的次级入口；不使用含糊的“了解更多”。

标题、正文和按钮应互相补充，不互相复述。空白不需要填满。不要给每个开关、分组或卡片默认配一行解释。

先审查整屏结构，再审查句子。不能把“删了几句话”“移入折叠区”当作完成：确认操作若仍与详情、维护操作和多个完整路径混在一起，信息层级就没有修好。

- 写入确认使用现有 `Dialog`，一个弹窗只处理本次决定；背景详情不参与当前操作。
- 同一目录的文件使用 `FileChanges`：目录显示一次，子项显示相对路径；目录外的路径保留完整值，不伪装成目录内文件。
- 表单每步只保留一个任务标题。标题足以命名唯一输入时，用 `aria-labelledby` 关联，不再另画同义标签。
- 设置分组 `MenuGroup` 不提供副说明参数。具体禁用原因留在对应控件旁；不要恢复通用的组级说明槽。
- 普通选择以选中状态表达结果，不再叠加“已切换”；不可用动作直接禁用，不靠点击后的解释补救。

## 保留什么

- **状态**：连接、等待、暂停、失败不能只靠颜色或动画区分。等待时说明需要用户执行的动作，而不是泛泛“请稍候”。
- **错误**：说明哪里失败、可以怎样恢复。没有可靠原因就不猜测，不用“请查看提示”代替实际提示；不得把不确定保存说成成功。
- **空状态**：表达缺少的对象；已有同屏操作能解释下一步时，不再逐字复述按钮。入口不在当前区域时保留定位提示。
- **输入限制**：在相关输入旁保留无法从控件得知的格式、文件要求、许可等信息。
- **能力限制**：影响购买、启用或使用预期的限制必须可发现。日常详情可以折叠完整能力表；启用确认时保留本次能力和不支持项。
- **授权**：确认前保留准确目标、读写范围、操作后果、生效条件和撤回方式。必要后续操作（如 `/reload`、Codex `/hooks` 审核）不能只放在折叠区。完整文件清单可分层，但不能让用户在不知核心改动的情况下确认。
- **无障碍**：保留控件名称、输入标签、必要的描述关联、状态播报和焦点行为。纯视觉重复不应仅改为屏幕阅读器专用文字；同一信息是否重复，要分别检查视觉与辅助技术路径。

“少写”不授权删除安全检查、授权流程或错误恢复，也不授权把文字按钮全部换成无标签图标。

## Agent Pet 用语

| 情境 | 用语原则 |
| --- | --- |
| 操作 | 使用具体动词与对象：设置连接、暂停连接、移除连接。不要只有“确定”“处理”。 |
| 普通界面 | 使用“文件夹”“会话”“连接文件”；不用 internal status、payload、Session 等实现词。 |
| 技术目标 | 保留真实路径、文件名和用户必须执行的命令；不能为通俗而改写可执行标识。 |
| 状态重复 | 标题已是“已连接”，正文不再写“Codex 已连接”。 |
| 能力说明 | 次级入口用“支持哪些反馈？”，不是永远铺开一段功能清单。 |
| 空状态 | 同屏已有“自动扫描”“手动添加”时，用“还没有连接”，不加“从第一个连接开始”。 |

这些是项目决策，不是对所有产品通用的字数限制；不设置“所有提示不得超过 N 字”的机械门槛。

## 修改与验收

1. 沿真实入口清点文案来源：组件、共享映射、主进程错误、原生弹窗、菜单及通知。区分产品与展示页、原型、工程文档。
2. 先写批判：用户正在做什么、哪段文字没有增加信息、它抢占了什么重要内容。引用当前源码或界面，不凭旧截图评价新版本。
3. 按删除、改名、条件显示、次级详情、必须保留分类。审查同屏组合，不只逐句润色。
4. 一起移除空节点、悬空 `aria-describedby` 和失效样式；不改业务状态和授权边界。
5. 通过真实产品入口操作受影响页面，检查默认、等待、错误、空状态、确认与取消；对无法真实触发的状态明确记录限制。展示页只能证明显示层。
6. 检查键盘访问、可访问名称和窄窗口布局。类型检查与构建不能代替界面操作；遵守仓库不新增、不运行测试用例的约定。

## 研究依据

以下一手页面于 2026-11-13 经网络检索和正文读取核对。引文为原文，应用规则是本项目的推导，不声称已经过用户研究验证。

- [Apple · Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)："Simplicity isn’t minimalism." 简单是专注、可用、层级清楚，不是盲目删减。正文来源亦可用 [Markdown](https://developer.apple.com/design/human-interface-guidelines/design-principles.md)。
- [Apple WWDC25 · Make a big impact with small writing changes](https://developer.apple.com/videos/play/wwdc2025/404/)："Resist the urge to fill empty space by saying the same thing in different ways." 去掉填充词和重复思想；用词一致。不能据此删除真正解释后果的修饰词。
- [NN/g · Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/)："Every extra unit of information in an interface competes with the relevant units of information and diminishes their relative visibility." 以任务相关性提高信噪比；该文明确反对把视觉极简等同于可用性。
- [NN/g · Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)："You have to disclose everything that users frequently need up front"。低频细节按需展开，常用操作和当前决策所需信息不能藏起来；次级入口必须清楚可发现。
- [DWP Design System · Hint text](https://design-system.dwp.gov.uk/guidance/hint-text)："Only add it when there is a clear user need, and after you have first tried improving the question." 先改善问题或标签再加辅助文字；重要且不可跳过的信息不应放在弱化的提示中。此建议源自表单，不意味着所有说明都必须删除。
- [GOV.UK Design System · Error message](https://design-system.service.gov.uk/components/error-message/)："Describe what has happened and tell them how to fix it." 错误具体、可恢复、无技术黑话；系统故障不能归咎用户输入。该规范也要求字段错误与错误摘要保持一致，说明有明确定位作用的重复并非冗余。

# 本机 pi 默认配置接入操作预览 · 2026-10-15

代码目的：在保留原 pi 配置的前提下接入默认目标，修复包列表误阻止和检查取消卡住。用户已授权本轮精确只读检查；随后对以下写入预览选择了 **“只更新修复，暂不部署”**，因此本轮不执行以下部署或连接操作。保留本预览供后续明确授权，不能把本轮授权扩大为写入。

## 已核对的事实

只读 `/Users/gan/.pi/agent` 的必要 metadata、settings 与固定入口，得到：`packages` 为 5 条字符串来源；顶层 `extensions` 未设置；无固定根入口、根 manifest、ignore 或已有 `agent-pet.ts`。只输出规则形态，没有输出来源内容、其他设置或凭据。

已阅读此前授权的 pi 0.85.1 安装包源码 `dist/core/package-manager.js`：包来源解析与用户目录自动扩展发现分开，顶层扩展 overrides 才作用于默认发现路径。修复仅放行有界、非空、无控制字符的字符串包来源；不解析、执行、安装或修改包。顶层扩展规则、未知对象、ignore、类型/权限/所有权保护仍保留。这是已验证版本的语义依据，不宣称检查函数探测了正在运行的 pi 版本。

修复代码只读复验本机得到 `findings: []`，settings SHA-256 与本轮读取前相同；校验摘要保存在自有 `/tmp/agent-pet-daily-preflight.json`，不保存原配置副本。

## 请求执行的精确范围

1. 使用更新后的 `/Users/gan/Desktop/🥷/Agent Pet.app` 与当前自身 profile。读取目标及祖先 metadata、`settings.json`（至多 64 KiB）、`extensions/package.json`、固定入口及 ignore 的存在/类型，生成实际部署预览。不读取 `auth.json`、Session、对话或其他 pi 资料，不跟随配置符号链接。
2. 仅当预览仍允许且确认时重新校验未发生变化，**独占新建** `/Users/gan/.pi/agent/extensions/agent-pet.ts`（0600），内容为项目已有只读观测扩展加本机接收配置。它仅观察身份、名称与粗粒度任务状态，不注册控制工具、不发送对话正文。
3. 不改动、覆盖、复制或删除既有 `settings.json`、包列表、其他扩展、ignore、trust 或 pi 程序。只在 Agent Pet 自身 `/Users/gan/Library/Application Support/@agent-pet/desktop/configuration-a276f3bb-ff79-4cfb-9a15-70caa844abc4/pi-connection/` 保存本产品私有凭据/receipt，目录 0700、文件 0600；正常状态发布可更新本应用非秘密配置 metadata。创建独占 0700 `/tmp/ap-<随机值>` 和其接收 socket，不认领已有路径，不暴露端点/token。重启仍需明确恢复。
4. 部署后观察正式页“等待 pi”及实际 hello 后的在线状态。**不替用户启动、重载或控制日常 pi**；接收就绪后，请用户自行在空闲 pi 中安全 `/reload`，或正常打开自己原有的 pi。Agent 不登录、不复制凭据、不发起模型请求、不安装/更新依赖。原 pi 自己正常运行仍受用户原有规则控制。
5. 再次比较 settings 校验摘要，确认原文件内容保持。成功后保留接收与本产品扩展供日常使用；不把用户默认配置作为临时 fixture 清理。

## 撤回与失败

通过产品“停用接收”保留文件；需要撤回时，经移除确认仅撤回本应用 receipt 仍匹配身份和内容的 `agent-pet.ts`。用户修改与未知文件保留，原 pi 数据、扩展和包配置不动。文件移除不代表运行中的扩展已卸载，需要用户在安全时机重载/退出 pi。保存、部署或监听失败如实报告，不显示虚假在线，不删除未知 socket 或修复权限；按 AGENTS 的一次有界修复/复验后停在安全位置。

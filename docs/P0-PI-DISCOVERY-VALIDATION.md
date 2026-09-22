# P0：pi 0.85.1 扩展发现的隔离动态验证

状态：**11 个 discovery 检查通过；不是扩展加载、连接或产品实现验收。**

## 目标与实际运行对象

本次在一次性目录调用实际安装包导出的 `DefaultPackageManager.resolve()`，未复制其发现算法作为测试替身。唯一 stub 是内存 settings：两个作用域的 `packages: []`、所需资源排除规则、`isProjectTrusted() === false`。未创建 SettingsManager、DefaultResourceLoader 或 AgentSession，未运行 pi CLI/TUI、扩展 module/factory、agent 进程、安装命令或网络连接。

- 安装包：`/Users/gan/.nvm/versions/node/v22.22.3/lib/node_modules/@earendil-works/pi-coding-agent`
- API：`dist/core/package-manager.js` 的 `DefaultPackageManager`。
- 实测包版本：`@earendil-works/pi-coding-agent` **0.85.1**。
- 运行时：`/Users/gan/.nvm/versions/node/v22.22.3/bin/node`，**v22.22.3 / darwin / arm64**。
- [results.json](evidence/p0/pi-discovery/results.json) 包含包身份、关键安装源码 SHA-256、逐项输入/期望/实际结果和资源 metadata。临时绝对路径已转换为相对路径。

## 执行前安全审查

已阅读本仓库 [静态研究](P0-PI-INTEGRATION-RESEARCH.md)、[本机安全决策](P0-LOCAL-SECURITY-DECISION.md)；本次直接使用的 pi 文档 `docs/packages.md`、`docs/settings.md`、`docs/environment-variables.md` 均完整阅读，资源设置交叉引用已跟进。未把 provider、TUI、安装/卸载等无关引用扩大为验证范围。

实际安装源码审查结论（行号限此安装版本）：

- `package-manager.js:610–614,698–737`：构造器只规范化显式路径；`resolve` 汇总 settings 包列表、解析本地资源、自动发现并返回资源表。
- `:981–1044`：**resolve 非普遍无副作用**。npm/git 源可安装缺失包、检查版本或更新临时 git。此次两个包列表为空，循环不进入；另传入拒绝 missing-package 回调，`PI_OFFLINE=1` 是附加保护，不是安全结论的唯一依据。
- `:1925–2019`：无 plain 本地资源路径；仅合成 overrides。用户资源在显式 agentDir；`.agents/skills` 使用合成 HOME。project trust 为 false，避免项目自动资源及祖先 `.agents` 搜索。每个合成 cwd 放置项目 decoy，确认未返回。
- `:376–456,516–535,2062–2096`：根入口优先、ignore、enabled override 与最终路径去重均由实际代码执行。
- 同时检查 `config.js`、`pi-manifest.js`、`utils/paths.js`、`utils/child-process.js`、`utils/git.js` 和 `output-guard.js`。配置模块顶层读取的是指定安装包 package.json，不调用真实用户 settings/session/auth API。

运行隔离：

1. `mktemp -d /tmp/ap-pi-discovery.XXXXXX`；`env -i` 清空继承环境，只传入合成 HOME/TMPDIR/agent/session 路径、安装包路径与 offline/telemetry 关闭值。`cd -P` 保证 macOS `/private/tmp` 路径一致。
2. Node `--permission` 仅允许读取这次临时目录和指定安装包子树、仅允许写临时目录；未授予 child/worker 权限。脚本断言真实 settings 路径无读取权限、安装包无写权限。没有读取该 settings 文件。
3. 导入包前阻断 Node 常用网络入口、Socket.connect、fetch 和 child_process 方法，并同步 builtin ESM exports；没有触发阻断计数。该措施不是恶意代码沙箱或完整网络审计，安全依据仍包括受控输入和实际路径审查。
4. 每个 fixture 的顶层与 factory 都是抛错哨兵，但仅作为文件名存在，未导入/执行。无 token、凭证或真实会话内容。

## 结果

| 检查 | 实际结果 |
| --- | --- |
| 独立 `agent-pet.ts` | 返回一个 user/auto、enabled:true 资源 |
| 根 `index.ts` 与 sibling 共存 | 只返回 index，Pet sibling 不发现 |
| 根 package.json 的 `pi.extensions: ["entry.js"]` | 只返回 entry.js，Pet sibling 不发现 |
| `.gitignore` | Pet 不返回 |
| `.ignore` | Pet 不返回 |
| `.fdignore` | Pet 不返回 |
| `!extensions/*.ts` | Pet 仍在资源表中，但 enabled:false |
| `-extensions/agent-pet.ts` | Pet 仍在资源表中，但 enabled:false |
| `.ts.tmp` / `.ts.bak` / `.js~` / 点文件 | 均不发现，仅正常 `.ts` 返回 |
| 内容完全相同的 Pet 与 `agent-pet-old.ts` | 两个不同路径均 enabled:true；存在重复加载候选风险，未执行证明双 factory |
| 显式自定义 agentDir | 只发现 chosen-profile 的 Pet，不发现合成 HOME 默认 agentDir 的 decoy |

**区别必须保留：ignore 是不发现，settings exclusion 是发现但禁用。** 不能把原始资源列表非空直接当作“会加载”。自定义目录测试只证明构造参数的作用，不证明 GUI 能判断终端 pi 的实际 profile，也没有测试环境变量选择 agentDir 的完整启动路径。

## 复现与失败记录

主证据：

- [probe.mjs](evidence/p0/pi-discovery/probe.mjs)：临时验证脚本的原样快照，不是生产代码。
- [run.sh](evidence/p0/pi-discovery/run.sh)：新建一次性 sandbox，运行后删除；只将 results.json 复制回脚本所在目录。
- [results.json](evidence/p0/pi-discovery/results.json)：实际 API 输出摘要及断言结果。
- [attempts.json](evidence/p0/pi-discovery/attempts.json)：包括失败在内的执行记录。

实际成功命令：

```sh
sh /tmp/ap-pi-discovery.6ga0D7/run.sh \
  /Users/gan/.nvm/versions/node/v22.22.3/lib/node_modules/@earendil-works/pi-coding-agent \
  /Users/gan/.nvm/versions/node/v22.22.3/bin/node
# {"passed":true,"cases":11,"failures":[]}
```

建议在新 mktemp 中复现，避免覆盖历史证据：

```sh
T=$(mktemp -d /tmp/ap-pi-discovery.XXXXXX)
cp docs/evidence/p0/pi-discovery/{run.sh,probe.mjs} "$T/"
sh "$T/run.sh" \
  /Users/gan/.nvm/versions/node/v22.22.3/lib/node_modules/@earendil-works/pi-coding-agent \
  /Users/gan/.nvm/versions/node/v22.22.3/bin/node
# 检查 "$T/results.json" 后删除自己创建的 "$T"
```

首次尝试 **失败（exit 1）**：脚本前置断言只接受 `/tmp/...`，但 macOS `process.cwd()` 返回 `/private/tmp/...`。在 import 安装包之前终止，未运行 discovery。修复路径 guard 并采用 `cd -P` 后，上述 11 项全部通过。未隐藏失败，也未为通过修改安装源码。

## 限制与工程结论

- 只证明当前安装的 unbundled Node 模块发现行为；未验证 CLI bundle、其它版本、Bun/Electron、Windows、fork/rebrand。
- 没有运行 ResourceLoader 后续过滤/加载、TS 编译、factory、reload、session 生命周期、握手或 UDS；**发现 ≠ 加载 ≠ 连接**。
- 没有检查真实用户配置；项目 trust 为合成 false，不是完整 project trust 测试。未验证 symlink/ACL、恶意并发、原子安装、升级/撤销事务、显式 `-e` 或 `--no-extensions`。
- root entry 与用户禁用是需要向用户报告的配置阻塞，不能自动改共享 index/settings 绕过。备份不应保留为另一个可发现 `.ts/.js`。
- 无生产改动、依赖安装、commit、stage 或 push。原有未跟踪文档与其它 evidence 保持原状；本次仅新增本报告及 `docs/evidence/p0/pi-discovery/` 的四个证据文件。

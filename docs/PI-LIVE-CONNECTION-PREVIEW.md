# 正式 pi 接入实机操作预览 · 2026-10-14

状态：**待用户精确授权，未部署/未启动真实 pi**。依据 [MVP 执行计划](MVP-EXECUTION-PLAN.md) 的真实目标操作规则；代码与隔离回归已经完成。这里授权的是独立测试环境，不扩展到日常配置或有费用的模型请求。

## 已准备的具体环境

- 未签名 arm64 应用：`/var/folders/sr/gztw7n8x7fncz4nmpgvbj3zc0000gn/T/agent-pet-m5-8Izmcb/mac-arm64/Agent Pet.app`。
- 自建 0700 根：`/Users/gan/Desktop/🥷/agent-pet-live-20261014-pdakiqzh`。
- Electron 私有 profile：上述根下 `app-data`，通过 `--user-data-dir` 明确隔离；已完成正式首页空态 smoke。
- pi 目标 A/B：上述根下 `pi-a` / `pi-b`，目前均为空的 0700 目录。先运行 A，通过后再运行 B。
- pi 工作目录与 HOME：上述根下 `work` / `home`，均为空；不在项目或日常 HOME 中启动 pi。
- 现有 CLI：`/Users/gan/.nvm/versions/node/v22.22.3/bin/pi`，符号链接实际指向 `lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`。目前只定位了路径；下一步先核对该安装包的版本、文档及扩展 API，未启动 CLI。

## 拟读取、写入及运行范围

1. 只读该 pi 安装包的 metadata、扩展/启动说明和正常 CLI 运行所需代码/既有依赖；不安装、更新或修改安装包。若与支持的接口不兼容，停止并报告。
2. 正式页面选择上述 A/B 目标；有界检查目标及祖先 metadata、`settings.json`、`extensions/package.json`、固定入口与 ignore 存在情况。不开启日常 HOME 自动扫描，不读取 Session/对话/登录凭据，不改 settings、ignore 或 trust。
3. 在页面确认真实部署预览后，每个目标只独占创建 0600 `extensions/agent-pet.ts` 和所需自有目录。私有凭据/所有权只存入 `app-data/configuration-<id>/pi-connection/`；应用创建独占 0700 `/tmp/ap-<随机值>` 接收目录和其 socket，准确路径在部署时记录，旧端点不抢占。Electron 的缓存等正常资料仅进入隔离 profile。
4. 使用隔离 HOME、明确的 `PI_CODING_AGENT_DIR` 和空工作目录运行现有 pi；不继承模型凭据、不复制 auth 文件、不自动登录或发起模型请求。pi 自己正常运行产生的设置/Session 等文件限于隔离根；不读取这些文件正文。需要登录、模型任务或新成本时由用户操作，另行说明范围。
5. 先检查加载/hello/在线，再检查两进程部分退出、两个配置身份、正常退出/显式恢复及停用。真实 working/完成/取消由用户在 pi 中发起并观察；自然错误终态没有出现则保留未测，不制造错误。

## 撤回与停点

通过正式页停用接收、选择性移除。只撤回仍匹配身份与内容的自有扩展；用户改动、未知文件、pi 创建资料及可能的登录凭据都保留。停用/文件移除不宣称运行中的扩展已卸载；正常退出自有 pi 后才算其进程停止。应用重启不自动监听、不重建丢失 runtime、不删除既有 socket；明确恢复拒绝时保留原状。

原生选择器若仍无法可靠自动点击，由用户手动选定上述具体目录。测试未通过时只做一次有界复现与修复复验，记录残留并停在安全状态。历史 native smoke fixtures 和旧验收目录不读取、不清理。本次预览不授权正式发布、自动恢复或其他 Provider。

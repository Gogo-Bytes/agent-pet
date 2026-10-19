# Codex 隔离hook状态只读核对

2026-10-19，待本次精确授权。r2已经成功初始化并创建空会话，但没有收到hook；不能只凭这一点归因于未信任或禁用。本机导出的协议明确提供hooks/list，支持分别读取enabled、trustStatus和source元数据。

## 唯一操作

```sh
node integrations/codex-hooks/test-support/hook-status-check.mjs --run-authorized-check
```

[脚本](../integrations/codex-hooks/test-support/hook-status-check.mjs)复用原 `/tmp/agent-pet-codex-start-20261019-5f92c8-r2`，不创建新隔离配置、不覆盖result.json，不改config/hooks.json、config/config.toml或任何信任记录。

- 读取该目录及home/config/cache/tmp/work/runtime的metadata。只读原runtime/observer.cjs（最多256KiB）、config/hooks.json（最多64KiB）、config/config.toml（最多1KiB），核对700/600、本人所有、单链接文件；当前正式源码内存编译摘要及文档必须与原文件一致，否则停止。原文件不执行于本检查器内部，也不覆盖。
- Vite从本产品源码内存编译后，仅独占新增runtime/status-documents.cjs、runtime/status-check.cjs（0600）；已有则停止。仅读取本机已知Codex入口及standalone安装范围的有界链接/必要祖先metadata，前后最多两次128次metadata/8次链接核对，不枚举或读日常配置。
- 仅通过已验证的loopback-only系统沙箱启动一次固定Codex的app-server，仍使用原隔离HOME/CODEX_HOME/XDG/TMPDIR及内存凭据模式，不继承凭据，不允许外网。
- RPC只发送initialize（为读取该版本hook列表开启experimentalApi）、initialized、hooks/list，cwds仅原隔离work目录。不发送thread/start或turn/start、不创建新会话、不运行hook、不登录、不批准信任。若Codex合并系统管理条目，也只在内存中过滤并保存数量，不执行条目或输出命令内容。
- 最长10秒、合并输出128KiB，只清理此次新建进程组。原Codex/Claude/pi及当前dev不操作，仍不打包。

## 记录

独占新增hook-status.json（0600）。仅保存初始化/固定退出类别、固定RPC错误类别及错误码、输出字节数，以及本产品精确source/command/event匹配的hook数量、启用/禁用及trusted/untrusted/modified/managed数量，另有其他来源和错误/警告的数量。不保存任意命令、路径、hash、原生编号、警告/错误全文、对话或凭据。

结果只用于定位“未发现、未启用、未信任或其他错误”，不自动改配置或信任，不发布在线状态。需要用户审核信任或其他范围变化时停止，由用户决定。脚本已有25项检查程序测试、类型检查和源码build验证；r2原记录保留。

AGENTS.md要求真实目标操作有精确范围、预览与授权。此前r2只有schema导出及空会话；本次新增hooks/list、三个独占文件及原隔离自有材料只读核对，因此确认这一范围。

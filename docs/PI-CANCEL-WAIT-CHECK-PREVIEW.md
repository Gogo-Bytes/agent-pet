# 取消修复与等待/出错实机验证预览 · 2026-10-16

状态：用户已明确选择“按预览更新并加载临时测试”；观察扩展替换、临时文件独占创建、同profile的dev重启与原连接恢复已完成。用户reload后取消真实复验已通过（12:23 idle/cancelled，无错误误报）。临时命令仍无法识别，等待输入/受控任务失败未通过；已按身份、摘要、权限及父目录匹配选择性撤回helper，待用户空闲reload卸载可能残留的注册。详见 [实机记录](PI-EXTENSION-LIVE-ACCEPTANCE.md)。

## 已发现的问题

用户在当前pi中按Esc取消新建的sleep任务。11:56:47.808进入executing，11:56:48.581出现tool_error，11:56:48.587最终error；cancelled能力仍unknown。用户看到`Error: This operation was aborted`。这证明取消实机验证失败，不能计作正常任务出错通过。

正式观察扩展的能力表改为按实例隔离；现在只读保留当前运行的`ctx.signal`，在整批结束时用其aborted区分取消与error；不解析错误正文、不监听键盘、不调用abort。取消工具不再发送tool_error。新批次/续跑替换signal，settled/reload/shutdown释放引用，旧signal不能把后续失败变成取消。无signal仍保留stopReason兼容路线。

上游0.85.1的[ExtensionContext](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/src/core/extensions/types.ts)定义signal；[Session实现](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/src/core/agent-session.ts)将其绑定到agent.signal。等待只覆盖[原生扩展UI提示](https://github.com/badlogic/pi-mono/blob/v0.85.1/packages/coding-agent/docs/extensions.md#ui_prompt_start--ui_prompt_end)。本次读取的是公开上游源码，没有额外读取本机安装包或会话。

## 准备好的测试文件

仓库中的 [live-check.ts](../integrations/pi-extension/test-support/live-check.ts)独立于生产观察扩展、正式Main/preload及UI入口。它只有两个测试能力：

- `/agent-pet-check-wait`：仅在空闲TUI里打开真正的确认框，关闭后通知结束；不更改配置，不请求模型，也不直接发送观察事件。
- 注册独立的`agent-pet-live-check/fail-local`测试模型，名称为“Agent Pet 本机出错测试（不联网）”。不覆盖真实Provider，不自动选择模型，不发消息；用户自己通过`/model`选择并发一条测试消息后，该本机provider同步抛出固定异常，交由pi的真实任务流程结束。这是**受控本机故障验证**，不是商业模型服务故障验收。它不发网络请求，也不使用模型额度；原pi的其他扩展行为不由本测试改变。

没有伪造socket帧、调用观察扩展事件handler或改变实际模型的错误返回。helper只在用户显式命令/选择后触发；正式扩展仍只观察。

## 精确真实操作范围

配置ID：`a276f3bb-ff79-4cfb-9a15-70caa844abc4`，原目标：`/Users/gan/.pi/agent`。

1. 正常退出当前Agent Pet dev一次，短暂中断接收；pi和既有任务继续。只读核对原配置的私有安装记录、原目标/扩展及父目录metadata、原runtime是否停止。保留所有用户配置、凭据、包来源、信任设置、其他扩展和用户资产；不读取auth、Session/对话或其他包内容。
2. 沿用已验证的显式更新器，只替换`/Users/gan/.pi/agent/extensions/agent-pet.ts`为取消修复版；更新对应私有receipt的本扩展身份和摘要，保留目标、接收凭据、runtime及停用状态。settings.json只作≤64KiB前后摘要比较，不输出/复制内容。
3. 新建唯一0700私有备份目录：

   `/Users/gan/Library/Application Support/@agent-pet/desktop/configuration-a276f3bb-ff79-4cfb-9a15-70caa844abc4/extension-update-d33a43a8-18eb-45af-9236-f5bd8ed2604f`

   original.ts、recovery.json均0600并含私有接收数据，不进Git、日志或截图。仅原子替换已匹配的本产品扩展；有未知修改、符号链接、原记录变化、runtime/socket未停止或路径已存在则拒绝，不自动修复。
4. 仅独占新建`/Users/gan/.pi/agent/extensions/agent-pet-live-check.ts`（0600），内容等于已审查的test-support/live-check.ts。文件已存在就拒绝，不能覆盖或认领。将创建时的目标、文件身份和摘要写到上述私有目录的`live-helper.json`（独占0600）。只读验证父目录无符号链接且身份未变。撤回只在helper身份、摘要、权限及父目录仍一致时删除本次新建文件；被修改或归属不明则保留并报告。测试失败也不删除其他文件或清理目录。
5. 新建该备份目录下的`evidence`（0700）。重新启动同一源码dev、同一应用profile与原保存连接，只新建其中states.ndjson（0600、≤128KiB、仅匿名枚举）；原证据文件保留，不追加或覆盖。沿用原接收端点，不打包、不安装依赖、不自动启动/重载pi。
6. 用户在空闲时手动`/reload`。先执行等待命令、保持弹窗片刻再关闭，再做新sleep任务并按Esc取消。用户先记下自己的当前模型，然后通过`/model`选择本机出错测试模型、发送测试消息，看到预期错误后切回原模型；这会由pi正常记录本次测试和模型选择到当前会话，**不修改默认模型或共享settings**。本代理不读取这些会话内容，不替用户发模型请求或取消既有任务。
7. 用户确认已切回原模型后，按live-helper.json校验并选择性撤回helper，用户再次`/reload`卸载测试命令/模型。保留修复后的正式观察扩展、原用户配置、私有备份、所有验收记录和测试输出。

## 回退与安全停点

正式扩展可以按更新器的显式restore恢复此次备份版本，前提是当前新扩展/receipt、备份权限/身份/摘要、原目标/配置均匹配且接收器停止；不复制过期inode，也不盲目回滚不确定保存。实际使用回退仍由用户明确选择，pi加载切换仍由用户reload。helper撤回与正式扩展回退独立。

本轮仅为已有macOS/pi适配补验证，不增加产品Provider，不更改Main/preload/Application边界或managed guard。按AGENTS/MVP，真实替换和新增这个测试扩展需要对上述范围另获确认；此前授权不被解释为自动允许新的日常文件。

## 工程验证

新增取消红测试先捕获tool_error误报，修复后保留signal直到settled的路线通过；另覆盖同workId续跑换signal、旧signal迟到abort和下一批真实error不被旧取消遮蔽。独立审查最终10项focused通过，无阻塞项；helper只有注册/本地抛错隔离测试，不能代替pi实际加载。

`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`、diff检查通过。最终普通全量并行运行出现1项原有Darwin Worker启动unavailable（其余763通过、1跳过）；原文件独立4项复验通过。一次有界降低并行度完整复验`pnpm test --maxWorkers=2`为**764 passed / 1 skipped / 78 files**，未改测试、阈值、guard或协议。并发负载相关是推断，未证明底层具体原因；原始失败不隐藏。没有打包或安装依赖。

# Codex CLI 正式接线与验收

2026-10-19。**正式连接页/Home已接代码；0.163.0隔离默认后台两轮实测通过，日常目标尚未部署。** 前台与默认模式分别保存证据，不将隔离结论扩大为日常安装或桌面端通过。见[前台证据](CODEX-NORMAL-START-MOCK-PREVIEW.md)和[默认模式精确预览](CODEX-DEFAULT-START-PREVIEW.md)。

## 接入方式与边界

手动添加→Codex→实际CODEX_HOME目录（通常~/.codex，不是项目的.codex）→选择程序→查看追加预览→明确确认。只读所选目录hooks.json（64KiB）及祖先/程序metadata；只追加本产品10条通知，保留现有JSON值和无关字节，不重写config.toml、其他hooks、登录或shell。Codex原生/hooks审核是独立步骤，应用不写信任、不启动/控制/审批Agent。

只接受已有原生证据版本0.163.0的standalone布局；其他安装方式/版本没有假成功入口。默认后台可能有独立程序：Main按该版本固定的packages/app-server-daemon入口和有限旧布局状态metadata解析并核对精确路径；不读取后台日志正文，不用进程名字猜在线。若后台程序升级/更换不匹配，事件不会冒充在线，需重新核对。0.163.0固定managed隔离副本默认启动与接收器重建已通过真实测试；其他布局、后台进程连续性和完整生命周期矩阵仍未验收。

## 模块与状态

- `protected-json-file.ts`：从Claude已有实现提取token级JSON扫描/追加/移除与有界安全文件IO；重复key、符号/硬链接、目录替换、权限、pending、旧预览响应继续失败关闭。Claude原有语义/匹配器不变。
- `codex-user-hook.ts`：10条完整注册；原有hooks保留。修改过/部分缺失/疑似引用自有助手的未知条目不静默覆盖或删除。只选择性撤回完整且未变的自有条目，不把旧备份整份覆盖回去。
- `codex-registration-store.ts`：0700独占目录内600 state/receipt，备份原hooks证据；暂停/移除标记持久化，fsync与pending保护。保存前使用首次验证的原始字节作为比较基准，不能采纳并发外部编辑作为可覆盖基准。未知/编辑/pending记录保留并失败关闭；不自动修复或删除。
- `codex-connection.ts`：预览/确认/取消/恢复/暂停/移除复用前一步原生桥接。保存不会执行Codex；恢复核对原hook/程序和私有材料后才监听，主动暂停不自动恢复。退出只停止观察，不结束Agent。移除保留已加载hooks可能仍使用的私有运行材料。
- `Configurations`/现有类型化IPC：按配置加前缀的匿名会话身份，注册共享Application状态。旧记录不需改schema/丢配置；缺少原配置证据时不自行部署。Main固定读取运行资产，Renderer无Node/文件访问。没有新增可由Renderer指定可执行程序路径的IPC。
- `CodexConnectionControls`/连接详情：类型和状态各用tag放在名称下；预览用现有Dialog，取消、Escape、关闭、忙碌后焦点恢复与跨页撤回可用。无外套卡片；单行路径/溢出沿用正式共享样式。手动添加已允许CLI连接，自动扫描Codex尚未实现。
- `configurationOnline`/Home：只有原生核验后的observing才出现宠物；配置存在/文件可用/后台PID活着都不等于在线。多配置保持独立身份，暂停/结束清除观察和首页。Three.js与HTML继续消费同一共享状态。

状态文案明确“等待首次任务”：仅打开空CLI不显示宠物，首条任务中才有原生事件。默认后台会话可在关闭终端后继续存在，是否结束以事件和宿主事实为准，不把终端关闭自动当作退出。当前动作仍为可选且缺动画静态回退；Stop、审批检查、工具返回不制造完成/持续等待/任务出错。Codex桌面端不在此验收。

## 验证与实际画面

隔离Main/React行为测试覆盖追加/保留、旧预览、取消、暂停持久化/恢复、私有及目标文件编辑、pending、选择性撤回、多配置→Application→Home、空态/online和暂停离场。原Claude93项hooks回归通过。全量首次有1项旧用例还把Codex当不支持类型；改用尚未支持的Gemini保持同一防假在线断言后，一次完整复验**1306 passed /1 skipped /120 files**。随后独立审查发现私有记录read与commit之间的并发编辑覆盖窗口，红测试确实复现（期望false实际true），改用首次验证字节后新增聚焦测试通过；未削弱guard。最终全量复验1310 passed /1 skipped /121 files；随后补UI移除后不撤销失效预览的回归，3项聚焦测试通过。typecheck、desktop源码build通过，不打包。独立审查首轮8项、后续12项、最终17项自有fixture通过，真实默认模式未由它们验证。

正式Renderer浏览器dev `http://127.0.0.1:4176/management-review.html?case=codex-preview` 已实际查看预览/取消回焦（取消回“设置连接”）、430×740无横向溢出；online示例实际加载内置GLB，Enter聚焦/信息、Escape返回通过，控制台无error。这些截图使用正式React/R3F代码加**测试边界示例数据**，不是本机真实Agent在线或Electron Main实测，不以截图证明默认连接通过：

- [预览](../.agent-work/codex-connection-ui-20261019/preview.jpg)
- [窄窗口](../.agent-work/codex-connection-ui-20261019/preview-narrow.jpg)
- [首页](../.agent-work/codex-connection-ui-20261019/home.jpg)、[键盘聚焦](../.agent-work/codex-connection-ui-20261019/home-focus.jpg)
- [连接详情](../.agent-work/codex-connection-ui-20261019/connected.jpg)

日常dev/Agent仍保持，未读写日常Codex配置或凭据、未打包/推送。默认后台隔离检查已按精确授权执行，两轮退出0、可信连接true、各1任务+1标题请求；正式Configurations重建接收器成功且hooks不变，隔离后台与接收器停止成功。没有登录凭据/真实模型；原生初始化未OS过滤，未断言零外网。结果与覆盖限制见[默认实测](CODEX-DEFAULT-START-PREVIEW.md#本次执行结果2026-10-19)。日常目标需另给具体写入/撤回预览，不从本次隔离测试推断已允许部署。

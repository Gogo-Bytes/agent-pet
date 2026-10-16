# 当前 pi 扩展更新与实机检查 · 2026-10-16

状态：**真实任务已验证读取、写入、执行、工具出错、回答及正常完成；其余细分状态与真实动画显示未验收。**

用户明确要求更新当前已连接的pi扩展、保留原配置、使用dev不打包；随后对 [精确预览](PI-EXTENSION-UPDATE-PREVIEW.md) 回复“按预览更新，我来操作pi”。本轮不替用户reload、发模型请求或取消既有任务。

## 已完成的真实操作

- 核实当前唯一保存配置为`pi 默认配置`（a276f3bb-ff79-4cfb-9a15-70caa844abc4），目标`/Users/gan/.pi/agent`；原私有receipt和扩展内容/文件身份匹配，原runtime有效，socket缺失，未检测到Agent Pet应用进程。
- 用新host/operator工具，仅原子替换`extensions/agent-pet.ts`，原文件与恢复记录保存于预览的私有0700备份目录、文件0600。工具返回`updated`与`settingsUnchanged:true`。备份含凭据，不进仓库或公开证据。
- 从源码启动Electron dev，沿用`/Users/gan/Library/Application Support/@agent-pet/desktop`，Renderer为localhost:5174；在实际管理窗口操作“重新连接”，原socket已监听，原有pi会话自动重连，收到coarse状态。没有重新部署其他目标，没有构建应用包。
- 更新后独立只读复核：receipt有效、新扩展匹配新receipt、内容等于当前canonical源码加原配置；target、receiver config、runtime与disabled标志和备份原记录全部一致。未输出实际接收端点或凭据。
- 仅本次dev启用私有枚举证据，保存在预览的`evidence/states.ndjson`。初始4条记录只证明收到原会话粗粒度状态，不证明新版已加载或细分能力支持。匿名记录无名称、正文、工具数据、路径或凭据。
- `/tmp/agent-pet-events-b007f4e0/source.txt`已独占创建，只有无秘密测试文本；用户随后在已reload的pi中完成限定任务；result.txt存在且非空，故意缺失的missing-test.txt仍不存在。只检查测试输出的存在和大小，没有读取pi对话或工具正文。

## 验证与限制

更新工具工程提交`c2ea4b7`；此前动作与事件实现为`4072a1e`、`e6012da`。本轮全量 **756 passed / 1 skipped / 76 files**，`pnpm typecheck`、`pnpm --filter @agent-pet/desktop build`通过；独立重点19项通过，补充目标绑定后20项通过。build仅编译，没有package:mac/electron-builder、依赖安装或推送。旧managed guard、部署/撤回/数据保留测试保留。

原生工具AX返回页面与截图存在滞后/不一致，页面控件点击一次重新绑定/抬起后可触发实际接收；以socket存在与Main私有状态证据核对。未把陈旧首页截图当作已连接截图，没有将此问题扩大成产品或视觉验收通过。

## 真实测试结果 · 2026-10-16 11:45 +08:00

用户报告测试完成后，只读核对原私有枚举证据与授权测试目录。文件共35条快照、50,222字节，未达到128KiB上限；本次测试对应一个新匿名会话的15次状态变化。所有时刻connected=true，首个细分事件后对应能力才由unknown变为supported。新版细分扩展确已生效；不据此认定其他仍在线的旧会话也已升级。

| 本地时间 | 收到的事实 | 任务状态 / 请求动作 |
| --- | --- | --- |
| 11:45:01.486 | 连接基线 | idle / idle |
| 11:45:09.633 | 开始工作 | working / working |
| 11:45:12.343 | reading | working / reading |
| 11:45:14.198、16.087 | writing两次 | working / writing |
| 11:45:20.697–26.724 | executing，持续6.027秒 | working / executing，结束后回working |
| 11:45:28.573–28.576 | reading后出现一次tool_error | **仍为working** / tool_error |
| 11:45:30.982 | responding | working / responding |
| 11:45:31.495 | 正常完成，活动清空 | completed / success |

已用本地只读断言核对这15次变化：活动开始/结束配对；两个writing事件只证明写入类活动，不从枚举反推具体工具名；中途所有任务状态均保持working，没有提前completed或误报整个任务error；工具失败后继续回答，最后completed。result.txt存在且0<size≤4096，missing-test.txt未被创建。断言输出 `PASS_OBSERVED_SUBSET`。原始匿名证据继续留在应用私有目录，没有复制prompt、响应、工具参数或结果。

## 当前实机矩阵

| 项目 | 证据与状态 |
| --- | --- |
| 精确扩展更新、保留配置 | 已完成；原settings摘要一致、新扩展/receipt匹配、接收配置保留 |
| dev接收恢复 | 已观察到原3个会话及本次新匿名会话的连接；不代表全部会话加载新版 |
| 新版扩展实际生效 | 本次会话已收到5类细分信号，能力随实际事件确认 |
| 读取、写入、执行、回答 | **真实通过**，请求动作与收到的活动一致 |
| 单个工具失败后继续完成 | **真实通过**，tool_error没有将整个任务误判为失败 |
| 思考、查找 | 本次未收到，能力保持unknown；不推断为不支持 |
| 取消 | 后续首次实机失败（见下节），修复隔离通过，尚待重新加载复验 |
| 整个任务失败、等待输入、整理、回答长度中断 | 本次未触发、未验证 |
| 自动重试 | 当前适配未知，未实现可靠原生信号 |
| 动作缺失或无动画 | 工程/隔离正式播放器验证通过；本次证据只验证请求动作，不证明专用动画或实际可见表现 |

内置资产仍只有四种动画，新状态按资产能力回退工作/待机/静态；事件可见不等于新增专用动画。继续使用同一dev接收进程，未重启、未打包，本代理未发模型请求或取消任务。界面比例/序号问题已独立修复并提交ed963f3；同一代码基线全量760通过/1跳过、typecheck、desktop build通过，本轮仅增加实机证据，没有改代码或为文档重复构建。

更新可按预览明确回退；未执行回退，也未自动清理私有备份或测试目录。设置其他实机停点、原生层级与发布验收保持原状态。

## 后续取消检查 · 2026-10-16 11:56 +08:00

用户明确只取消本次新sleep任务。executing从11:56:47.808开始，11:56:48.581记录tool_error，11:56:48.587记录error；cancelled仍unknown。用户同时看到“Error: This operation was aborted”。取消验收**失败**，不能将这次用户中止当作真正任务出错验收。独立隔离复现发现观察扩展只看stopReason，漏读当前运行的原生AbortSignal；修复及单独测试helper已准备，新的真实替换/加载尚未执行，范围见 [精确预览](PI-CANCEL-WAIT-CHECK-PREVIEW.md)。此前5类真实信号通过范围保留；取消、真实等待及受控失败仍待复验。

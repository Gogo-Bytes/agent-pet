# 跨 Agent 3D Desktop Pet 可行性研究

## 结论摘要
项目技术上可行。推荐 **Tauri 2 + Three.js + Rust sidecar/adapter host**：Tauri 体积和权限边界优于 Electron，Three.js/glTF 适合可定制宠物；但透明、点击穿透、全局置顶在不同桌面环境（尤其 Linux Wayland）存在平台差异，应把“窗口能力”定义为可降级能力而非绝对承诺。

Agent 集成不应假定一个统一的 undocumented API：Codex 有官方 App Server（JSON-RPC/JSONL、流式通知），pi 有官方 JSON/RPC、SDK 和扩展事件，Claude Code CLI 最稳妥的官方入口是 Hooks（stdin JSON）；Claude 平台的 sessions/events API 不等于本地 Claude Code CLI，应明确区分。MVP 先做只读状态观测、单宠物、单窗口和本地配置，之后再做会话控制与高级动画。

## 1. 官方集成面与可统一程度

### 1.1 OpenAI Codex CLI

- **App Server（推荐的深度嵌入入口）**：官方文档描述双向 JSON-RPC（省略 `jsonrpc` header），默认 stdio/JSONL；通知包括 `thread/*`、`turn/*`、`item/*` 和 `serverRequest/resolved`，适用于认证、会话历史、审批及流式 agent 事件。[Codex App Server](https://developers.openai.com/docs/app-server)。
- **CLI/恢复与 MCP**：CLI 文档覆盖 `codex resume`、`codex mcp` 等能力，但 MCP 是工具连接面，不应误当作“状态事件总线”。[Codex CLI](https://developers.openai.com/docs/codex/cli)。
- **Hooks**：官方 Hooks 文档提供生命周期自动化入口；适合在本机把事件转发给 adapter，但 hook schema、版本及可用事件应以当前文档为准。[Hooks](https://developers.openai.com/docs/hooks)。
- **建议**：优先启动受管的 App Server 子进程并解析其 JSONL；若用户仅安装 CLI 或 App Server 变动，则提供 hooks/进程观测降级。不要自行声明未在文档中出现的 Codex event 名称或字段。

### 1.2 pi coding agent

- `pi --mode json` 输出 JSONL 会话/agent 事件，包括 `session`、`agent_start`、`turn_start`、`message_update`、`message_end`、`turn_end`、`agent_end`。[JSON mode](https://pi.dev/docs/latest/json)
- `pi --mode rpc` 是 stdin/stdout 的严格 LF 分隔 JSON 协议，包含 response 与流式事件；文档明确适合无头通信。[RPC](https://pi.dev/docs/latest/rpc)
- SDK 提供 `createAgentSession()`、`session.subscribe()`；扩展事件包括 `session_start`、`agent_start/end`、`turn_start/end`、`tool_call` 等。[SDK](https://pi.dev/docs/latest/sdk)、[Extensions](https://pi.dev/docs/latest/extensions)
- 会话保存为 JSONL（当前格式版本及 tree-linked entry 结构见文档），不要直接依赖内部文件格式作为实时 API。[Session format](https://pi.dev/docs/latest/session-format)
- **建议**：adapter v1 用 `--mode json` 或 `--mode rpc`，按行解析、处理 backpressure；若同一 Node 运行时嵌入，再评估 SDK。扩展 API 比文件 tail 更稳定，但仍需锁定 pi 版本并处理 schema 演进。

### 1.3 Claude Code

- 本地 CLI 的官方、可验证入口是 **Hooks**：`SessionStart`、`SessionEnd`、`PreToolUse`、`PostToolUse`、`Stop`、`SubagentStart` 等；command hook 从 stdin 接收 JSON，包含（按事件而异）`session_id`、`transcript_path`、`cwd` 和 `hook_event_name`。[Hooks reference](https://code.claude.com/docs/en/hooks)、[Hooks guide](https://code.claude.com/docs/en/hooks-guide)
- `SessionEnd` 适合记录/清理且不能阻止退出；不能把它当持续实时事件流。hook 进程也有超时和失败处理约束。
- MCP 和插件是工具/扩展分发面：项目 `.mcp.json`、用户配置以及插件中的 `hooks/hooks.json` 等。[MCP](https://code.claude.com/docs/en/mcp)、[Plugins](https://code.claude.com/docs/en/plugins)
- **重要边界**：Anthropic Platform 的 Managed Agents sessions/events（例如 `/v1/sessions/{id}/events`、SSE）是平台 API；其文档不能证明本地 Claude Code CLI 暴露同一 API。[Platform events](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)、[Events API](https://platform.claude.com/docs/en/api/beta/sessions/events)。因此本产品的本地 Claude adapter 应先采用 Hooks/受控 transcript 读取（若用户授权），不能宣称“直接订阅 Claude Code session stream”。

### 1.4 统一事件契约（研究者设计，不是各厂商原生 schema）

Adapter 应只输出内部规范事件，保留原始 payload 供诊断：

```ts
type AgentStatus = 'offline'|'starting'|'idle'|'working'|'waiting_input'|'waiting_approval'|'error'|'stopped';
type AgentEvent = {
  id: string; provider: 'codex'|'pi'|'claude'|'other';
  sessionId?: string; timestamp: string; status?: AgentStatus;
  kind: 'session'|'turn'|'message'|'tool'|'approval'|'error'|'heartbeat';
  summary?: string; project?: string; cwd?: string;
  raw?: unknown; schemaVersion: 1;
};
```

这是**建议的抽象/推断**，并非任何官方协议。状态机必须允许 `unknown`、重复事件、断线重连和事件乱序；仅在有证据时显示 token、工具名、文件名等敏感详情。

## 2. 桌面栈比较

| 方案 | 优点 | 关键限制/风险 | 结论 |
|---|---|---|---|
| **Tauri 2 + Three.js** | 系统 WebView + Rust，包体较小；capabilities/permissions、scope、CSP 和 IPC 权限边界细；官方 updater 强制签名 | Rust 学习和 sidecar 管理成本；WebView/透明窗口在 OS 间差异；权限配置易误配 | **首选**，适合常驻小工具 |
| **Electron + Three.js** | Chromium 一致性强，Three.js 兼容风险低；Node 子进程/stdio 集成简单；生态成熟 | 包体/内存较大；主进程权限很强，必须严格 preload/IPC；Linux Wayland 置顶限制仍存在 | 若团队 JavaScript 优先或要快速验证，**MVP 可选** |
| **Qt/QML + 原生 3D** | 原生窗口控制成熟 | Three.js 无法直接复用；Web 视图桥接与 3D 资产管线更复杂 | 不适合本项目目标 |
| **Flutter desktop** | 跨平台 UI 与打包体验不错 | Three.js 不是原生路径，3D/透明窗口及 Web asset 复用成本高 | 不推荐 |
| **Wails** | Go + WebView，小体积 | 生态和权限/自动更新一体化程度不如 Tauri；平台差异仍需自行处理 | 备选，不优于 Tauri |

### 窗口行为

- Electron `BrowserWindow` 原生支持 `transparent`、`frameless`（透明 Windows 窗通常需要 frameless）和 `alwaysOnTop`；官方明确 Linux Wayland 不支持 always-on-top，并提示 macOS 透明窗口可能出现视觉残留。[BrowserWindow](https://github.com/electron/electron/blob/main/docs/api/browser-window.md)、[Window options](https://github.com/electron/electron/blob/main/docs/api/structures/base-window-options.md)
- Tauri 配置支持 `transparent`、`decorations:false`、`alwaysOnTop:true`，并可通过 JS API 控制；文档提示 macOS 透明可能需要 private API（影响 App Store），Windows 透明存在限制。[Window customization](https://v2.tauri.app/learn/window-customization/)、[Window config](https://v2.tauri.app/reference/config/)
- 拖动/缩放：优先使用 HTML/CSS drag region 与平台 window API；不要让 Three.js canvas 全部 `pointer-events:none`，否则无法拖动。可把宠物命中区域与透明区域分层，提供“穿透/交互”开关。原生 resize hit-test 需逐平台测试。
- 结论（直接证据 + 推断）：MVP 支持 macOS/Windows；Linux 作为 best-effort，Wayland 下置顶/穿透能力需在安装时检测并显示降级提示。

### IPC、安全、更新

- Electron：保持 `contextIsolation`、renderer sandbox、禁用 `nodeIntegration`，仅用 preload + `contextBridge` 暴露窄 API；验证 IPC sender、限制导航/外链、使用 CSP。[Context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)、[Sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[Security](https://www.electronjs.org/docs/latest/tutorial/security)。autoUpdater 官方覆盖 macOS/Windows，Linux 通常交给发行版；需要签名与 HTTPS。[autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)、[Distribution](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- Tauri：Commands 是 request/response，Events 是 fire-and-forget，参数/返回值需可序列化；capabilities 精确授权窗口权限，CSP 与 Rust 参数校验应默认开启。[IPC](https://v2.tauri.app/concept/inter-process-communication/)、[Capabilities](https://tauri.app/security/capabilities/)、[CSP](https://tauri.app/security/csp/)。Updater 插件要求签名，签名验证不可关闭，适合正式发布。[Updater](https://v2.tauri.app/plugin/updater/)
- 安全架构建议：UI 永不直接执行 shell；adapter host 才能 spawn 用户明确配置的 agent，使用绝对路径/参数数组而非 shell 拼接；secret/token 不进入 renderer、日志或 `raw` 事件；默认只读，控制动作单独授权并确认。

## 3. 3D 资产与定制

Three.js 官方 `GLTFLoader` 支持 glTF 2.0 的 `.gltf` 与二进制 `.glb`。[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)；Khronos 将 glTF 定义为 royalty-free runtime delivery format，但这描述的是格式，不是每个模型的版权许可。[Khronos glTF](https://www.khronos.org/gltf/)、[glTF spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

- 首选 GLB（单文件，便于缓存/导入），约定 `idle/work/success/error` 动画名或在 manifest 中声明映射；压缩、纹理尺寸和骨骼数量设上限，加载前校验大小/类型。
- Three.js 项目本身 MIT，但模型、纹理、动画、声音分别受其来源许可证约束；Khronos sample assets 页面逐模型提供许可信息。[Three.js LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE)、[Sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets)
- 自定义资产 manifest（建议）：`id/version/model.glb/thumbnail/animations/license/attribution/author`。不要从网络 URL 直接加载未审计模型；将用户资产视为不可信输入，限制解码资源和纹理路径。

## 4. 推荐 monorepo 架构

```text
apps/desktop/                 # Tauri shell + Three.js renderer
packages/event-contract/      # versioned AgentEvent, schemas, state reducer
packages/pet-runtime/         # Three scene, animation/state mapping, asset loader
packages/adapter-core/        # lifecycle, process supervision, reconnect, redaction
packages/adapter-codex/       # App Server JSONL client
packages/adapter-pi/          # JSON/RPC client
packages/adapter-claude/      # hooks receiver + optional authorized transcript reader
packages/config/              # validation, persistence, migration
crates/agent-host/            # Rust sidecar supervisor/native IPC (if needed)
assets/                       # only assets with recorded licenses
```

Adapter core 应隔离 OS process/stdio；统一 reducer 只消费规范事件；renderer 只订阅快照，不直接读 agent 文件或执行命令。配置包含 `enabledAdapters`、可执行文件路径、工作目录白名单、隐私级别、窗口偏好和 asset directory。契约采用 JSON Schema/Zod（renderer 与 Rust 边界再校验），事件 `schemaVersion` 与 provider adapter 版本独立。

## 5. MVP（约 3 个里程碑）

1. **窗口与宠物骨架**：Tauri 2、Three.js、透明无边框窗口、置顶/拖动/大小调整、任务栏菜单、macOS/Windows CI；GLB loader + 一个自制/明确许可资产。
2. **只读适配器**：先 pi JSONL 与 Codex App Server；Claude Hooks 通过安装说明和本地 receiver 接入；统一 `idle/working/waiting/error/offline` 状态，断线和重启可恢复；不显示 prompt/代码内容。
3. **配置与发布**：资产 manifest/import、状态动画映射、隐私开关、日志脱敏、签名安装包与 Tauri updater；再验证 Linux（X11/Wayland）并记录能力矩阵。

暂缓：远程云同步、跨设备控制、直接修改 agent 会话、复杂商店、网络下载模型、精确 token 进度（各 agent 不具备统一且稳定的公开语义）。

## 6. 主要风险与缓解

- **协议漂移/ undocumented API**：只依赖上述一手文档；锁定版本，契约测试以真实 CLI fixture 驱动，未知事件保留并忽略。
- **事件缺失**：Claude 本地 Hooks 不是完整实时流；显示“最近已知状态 + stale 标记”，不要伪造 working。
- **平台窗口差异**：能力探测、降级到普通无边框窗口，提供快捷键关闭穿透；分别测试 macOS、Windows、X11、Wayland。
- **安全与供应链**：最小权限 capability；sidecar 可执行文件签名/哈希；更新签名；资产许可证登记；不把原始 agent 输出写入崩溃日志。
- **性能**：限制 DPR、帧率和渲染分辨率；窗口不可见时降帧；动画状态与事件处理解耦。
- **用户隐私**：默认只采集生命周期和粗粒度状态；cwd/session id 可哈希；所有 transcript/消息读取必须显式 opt-in。

## Contradictions / 未决证据

- Tauri 与 Electron 官方文档都支持透明和置顶，但都记录平台限制；不能承诺所有 Linux 桌面环境一致支持，且“点击穿透”在所查官方页面中没有形成跨平台统一保证。
- Claude Platform sessions/events 与 Claude Code CLI Hooks 是两套产品面；没有证据证明本地 CLI 可直接提供 Platform API 的 SSE session stream。
- Codex App Server 文档适合嵌入，但其 WebSocket transport 标为 experimental/不适合生产；MVP 应使用 stdio/JSONL。

## Missing evidence

- 需要在目标 OS/窗口管理器上实机验证：透明边缘、置顶层级、点击穿透、休眠/多显示器、DPI、Wayland。
- 需要锁定 Codex、pi、Claude Code 的目标版本并编写 fixture；事件字段与生命周期行为可能随版本变化。
- 未对本仓库现有代码、构建系统和许可证做审计；本报告是技术可行性与架构研究，不是现有实现评审。

## 来源取舍

**保留**：Electron、Tauri、Three.js/Khronos、OpenAI Developer、pi.dev、Claude Code 官方文档（直接定义 API/平台约束）。

**降权**：第三方博客、搜索摘要和社区 wrapper；它们可帮助发现链接，但不能作为 undocumented API、性能、兼容性或许可证结论的证据。

## 最终推荐

采用 **Tauri 2 + Three.js**，以 adapter-core + provider adapter 的 monorepo 设计，MVP 只读、macOS/Windows 优先；Codex 使用 App Server stdio，pi 使用 JSON/RPC，Claude Code 使用 Hooks。若团队没有 Rust 能力或必须最快完成原型，Electron + 相同 renderer/contract 仍是低风险替代，但必须把 Electron 安全基线和更高资源占用列为验收项。

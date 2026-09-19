# Agent Pet 项目实施计划

## 1. 项目目标

构建一个 Electron 桌面应用：显示 3D 宠物，并根据 Codex、pi、Claude Code 等 Agent session 状态触发动画。宠物支持拖拽、缩放、置顶、点击穿透切换和自定义 GLB 资产。

MVP 目标平台：macOS、Windows。Linux 暂作为 best-effort，不承诺 Wayland 下完整的置顶和点击穿透能力。

## 2. 技术决策

- 桌面壳：Electron + TypeScript
- 3D：Three.js + GLB/glTF + `AnimationMixer`
- UI：React（仅用于设置/状态面板，不把 3D 场景和 UI 强耦合）
- 构建：pnpm workspace + Turbo（若实际规模证明需要）
- 校验：Zod 或 JSON Schema
- 测试：Vitest 单元/契约测试，Playwright 或 Electron 测试方案做桌面冒烟测试
- 发布：macOS/Windows 签名安装包与自动更新

选择 Electron 的原因：Chromium 对 Three.js/WebGL 行为更一致，Node 子进程和 JSONL/RPC Agent 接入简单。必须启用 `contextIsolation`、sandbox、严格 CSP，禁止 renderer 直接访问 Node 或执行 shell。

## 3. 目标目录结构

```text
apps/desktop/
  src/main/                 # Electron 生命周期、窗口、菜单、进程管理
  src/preload/              # 类型化且最小化的 contextBridge API
  src/renderer/             # React + Three.js
packages/
  event-contract/           # AgentEvent、状态 reducer、schema 版本
  pet-runtime/              # GLB 加载、动画映射、渲染预算
  adapter-core/             # 进程监督、重连、超时、脱敏
  adapter-codex/            # Codex App Server stdio/JSONL
  adapter-pi/               # pi JSON/RPC
  adapter-claude/           # Claude Code Hooks
  config/                   # 配置、迁移、持久化
  platform/                 # 窗口能力检测与 OS 抽象
assets/                     # 明确许可证的内置宠物
fixtures/                   # 脱敏后的 Agent 事件流
```

依赖方向：`renderer -> preload API -> main -> adapter-core -> provider adapters`。Renderer 不读取 Agent 文件、不启动进程、不接触密钥。

## 4. 核心状态契约

```ts
type AgentStatus =
  | 'offline' | 'starting' | 'idle' | 'working'
  | 'waiting_input' | 'waiting_approval' | 'error' | 'stopped';

type AgentEvent = {
  schemaVersion: 1;
  id: string;
  provider: 'codex' | 'pi' | 'claude' | 'other';
  sessionId?: string;
  timestamp: string;
  kind: 'session' | 'turn' | 'message' | 'tool' | 'approval' | 'error' | 'heartbeat';
  status?: AgentStatus;
  summary?: string;
  project?: string;
  cwd?: string;
};
```

状态转换：

```text
offline -> starting -> idle
idle <-> working
working -> waiting_input | waiting_approval | error | idle
任意活动状态 -> stopped | offline
```

要求：事件可重复、乱序、未知、断线；按 `id` 去重；事件失联后进入 `stale/offline`；不能仅根据“没有消息”推断 `working`。

## 5. 3D 宠物契约

```ts
type PetManifest = {
  id: string;
  version: string;
  model: string;              // 本地 GLB
  thumbnail?: string;
  animations: {
    idle: string;
    working: string;
    waiting?: string;
    success?: string;
    error?: string;
    offline?: string;
  };
  author?: string;
  license: string;
  attribution?: string;
};
```

缺少某种动画时使用确定性的 fallback。自定义资产默认只允许本地导入；限制文件大小、纹理、骨骼、动画和几何复杂度，禁止未经审计的远程模型和外部纹理。

## 6. 实施阶段

### Phase 0：项目基础

- 初始化 pnpm workspace、TypeScript、lint、format、测试
- 建立 Electron 主进程、preload、renderer
- 加入严格安全基线和最小 IPC
- 加入一个占位 3D 场景

完成标准：开发模式启动；renderer 无 Node 权限；IPC 参数经过校验；基础 CI 可运行。

### Phase 1：窗口与 Pet Runtime

- 透明无边框 BrowserWindow
- 置顶、拖拽、缩放、位置持久化
- 交互/点击穿透切换
- Three.js 场景、GLB 加载、动画状态映射
- 渲染帧率、DPR 和后台降帧策略

完成标准：macOS/Windows 上可拖拽和缩放；失败能力有 fallback；一个明确许可的 GLB 能稳定完成 idle/working/error/offline 动画。

### Phase 2：事件契约与 Adapter Core

- AgentEvent schema 和 reducer
- 事件去重、乱序、防御性解析、stale 检测
- 子进程监督、超时、重启退避、脱敏日志
- 脱敏 fixture replay 测试

完成标准：模拟事件流能稳定驱动 Pet；Malformed JSON、进程退出、断线和重复事件不会导致应用崩溃。

### Phase 3：Agent 接入

按风险和实时性顺序：

1. pi：JSON/RPC 或 JSON 模式
2. Codex：App Server stdio/JSONL
3. Claude Code：Hooks receiver；transcript 读取必须显式 opt-in

完成标准：真实支持版本的 smoke test 可运行；未安装或不支持的 Agent 显示 offline/diagnostic，不影响 Pet 使用。

### Phase 4：配置、资产和发布

- Agent 路径、工作目录、隐私级别
- Pet 导入、预览、删除、恢复默认
- 动画映射配置
- 崩溃恢复、配置迁移
- macOS/Windows 签名安装包、更新和回滚验证

完成标准：干净安装、升级、卸载、配置迁移和更新失败恢复均经过验证；默认日志不包含 prompt、代码、transcript、secret。

## 7. MVP 明确不做

- Agent 会话控制、自动批准、工具调用
- 云端同步和宠物商店
- 远程模型下载
- 精确 token/progress 展示
- Linux/Wayland 完整兼容承诺
- Claude Code 完整实时 session stream

## 8. 发布阻塞项

1. 窗口能力矩阵：透明、置顶、点击穿透、DPI、多显示器、睡眠恢复
2. Agent 事件真值模型和 stale 状态
3. renderer/main/adapter 安全边界
4. 自定义 GLB 的不可信输入防护
5. 崩溃、断线、升级、权限拒绝恢复
6. 安装包签名和更新验证
7. 性能预算：启动时间、空闲 CPU/GPU、内存、帧率和事件洪峰

## 9. 第一批实现任务

1. 初始化 workspace 和桌面应用骨架
2. 创建 `event-contract` 包与 reducer 测试
3. 创建透明 Pet Window 和 preload API
4. 创建 `pet-runtime`，加载一个测试 GLB
5. 建立 `fixtures/` 和状态回放测试
6. 在真实 macOS/Windows 上验证窗口行为

在这六项完成前，不接入真实 Agent，也不实现复杂设置页面。

## 10. 待用户确认

- 首发是否只支持 macOS + Windows
- 是否接受 Electron 较高的包体和内存占用
- 首个 3D 宠物由项目自制还是使用明确许可证资产
- `cwd`、session ID 是否默认脱敏
- Claude transcript 是否允许用户主动开启
- 是否需要第一版支持多个同时运行的 Agent session

# Three.js 场景与 HTML 操作层

Status: accepted

Agent Pet 的桌面界面采用 Three.js 场景与 HTML 操作层的双层呈现：Three.js 负责宠物、环境、装饰、镜头和动画，HTML 负责导航、状态、连接、宠物管理、设置和错误反馈。两层订阅同一个 renderer-safe 状态快照，不各自维护业务状态；3D 可点击物只提供轻量快捷动作并必须有 HTML 等价入口。这样可以保留游戏页面的空间感，同时保持低门槛、键盘/辅助功能支持和可测试性，避免将复杂流程埋进 3D 热区。

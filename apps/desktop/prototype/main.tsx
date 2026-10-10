import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Variant = 'a' | 'b' | 'c';
type Scene = 'welcome' | 'waiting' | 'working' | 'completed' | 'disconnected';
type View = 'home' | 'pets' | 'connections' | 'settings';
type Agent = { id: string; name: string; icon: string; color: string; state: string; stateCopy: string; connected: boolean };

const agents: Agent[] = [
  { id: 'pi', name: 'pi', icon: '✦', color: '#8c7aff', state: '陪伴中', stateCopy: '正在专心工作', connected: true },
  { id: 'codex', name: 'Codex', icon: '⌘', color: '#4ac6a8', state: '等待中', stateCopy: '随时可以出发', connected: false },
  { id: 'claude', name: 'Claude Code', icon: '☼', color: '#ff9b6e', state: '未连接', stateCopy: '还没和你见面', connected: false },
];

function currentVariant(): Variant {
  const value = new URLSearchParams(location.search).get('variant');
  return value === 'b' || value === 'c' ? value : 'a';
}

function currentScene(): Scene {
  const value = new URLSearchParams(location.search).get('scene');
  return value === 'waiting' || value === 'working' || value === 'completed' || value === 'disconnected' ? value : 'welcome';
}

function currentView(): View {
  const value = new URLSearchParams(location.search).get('view');
  return value === 'pets' || value === 'connections' || value === 'settings' ? value : 'home';
}

function goScene(scene: Scene) {
  const url = new URL(location.href); url.searchParams.set('scene', scene); history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

function goView(view: View) {
  const url = new URL(location.href); url.searchParams.set('view', view); history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

function goVariant(variant: Variant) {
  const url = new URL(location.href); url.searchParams.set('variant', variant); history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

function App() {
  const [variant, setVariant] = useState<Variant>(currentVariant);
  const [scene, setScene] = useState<Scene>(currentScene);
  const [view, setView] = useState<View>(currentView);
  const [selected, setSelected] = useState('pi');
  const [connected, setConnected] = useState(true);
  useEffect(() => { const onPop = () => { setVariant(currentVariant()); setScene(currentScene()); setView(currentView()); }; addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop); }, []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); goVariant(order[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!); } }; addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey); }, [variant]);
  const selectedAgent = useMemo(() => agents.find(agent => agent.id === selected) ?? agents[0]!, [selected]);
  const connect = () => { setConnected(true); setSelected('pi'); };
  const props = { selected, setSelected, selectedAgent, connected, connect };
  return <div className="prototype-page">
    {variant === 'a' && view === 'home' && <VariantA {...props} scene={scene} />}
    {variant === 'a' && view === 'pets' && <PetsView {...props} />}
    {variant === 'a' && view === 'connections' && <ConnectionsView {...props} />}
    {variant === 'a' && view === 'settings' && <SettingsView {...props} />}
    {variant === 'b' && <VariantB {...props} />}
    {variant === 'c' && <VariantC {...props} />}
    <PrototypeSwitcher variant={variant} scene={scene} />
  </div>;
}

type ViewProps = { selected: string; setSelected: (id: string) => void; selectedAgent: Agent; connected: boolean; connect: () => void };

function Pet({ mood = 'happy' }: { mood?: 'happy' | 'working' | 'sleepy' }) { return <div className={`pet pet-${mood}`}><div className="pet-ears">⌃　⌃</div><div className="pet-face"><span>•</span><span>•</span><b>{mood === 'sleepy' ? '—' : mood === 'working' ? '◡' : 'ᴗ'}</b></div><div className="pet-body">✦</div></div>; }
function AgentPills({ selected, setSelected }: Pick<ViewProps, 'selected' | 'setSelected'>) { return <div className="agent-pills">{agents.map(agent => <button className={selected === agent.id ? 'agent-pill selected' : 'agent-pill'} key={agent.id} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span>{agent.name}</button>)}</div>; }

function AppHeader({ view }: { view: View }) { return <header className="topbar"><button className="brand brand-button" onClick={() => goView('home')}><span className="brand-mark">✦</span><span>Agent Pet</span></button><nav className="app-nav" aria-label="功能导航">{([['home', '首页'], ['pets', '宠物'], ['connections', '连接'], ['settings', '设置']] as const).map(([id, label]) => <button key={id} className={view === id ? 'nav-link active' : 'nav-link'} onClick={() => goView(id)}>{label}</button>)}</nav></header>; }

function FeatureHeader({ title, copy, view }: { title: string; copy: string; view: Exclude<View, 'home'> }) { return <><AppHeader view={view} /><div className="feature-heading"><p className="eyebrow">Agent Pet</p><h1>{title}</h1><p className="subcopy">{copy}</p></div></>; }

function PetsView({ selected, setSelected }: ViewProps) {
  const [asset, setAsset] = useState('星星');
  return <main className="game-shell feature-game"><AppHeader view="pets" /><section className="game-feature-room wardrobe"><div className="feature-kicker">宠物衣柜</div><div className="wardrobe-stage"><div className="wardrobe-glow" /><Pet /><strong>{asset}</strong><small>当前形象</small></div><div className="wardrobe-panel"><div className="panel-title">我的宠物 <span>1 / 1</span></div><button className="wardrobe-item selected" onClick={() => setAsset('星星')}><span className="wardrobe-icon">✦</span><span>星星</span><b>使用中</b></button><button className="wardrobe-import" onClick={() => alert('Web 原型暂不导入文件；正式版将校验 GLB + JSON 宠物包。')}>＋ 导入宠物包</button><div className="panel-title binding-title">给谁使用？</div><div className="binding-chips">{agents.filter(agent => agent.connected).map(agent => <button key={agent.id} className={selected === agent.id ? 'binding-chip active' : 'binding-chip'} onClick={() => setSelected(agent.id)}>{agent.icon} {agent.name} · {asset}</button>)}</div></div></section><GameDock /></main>;
}

function ConnectionsView({ selected, setSelected }: ViewProps) {
  const [scanned, setScanned] = useState(false);
  return <main className="game-shell feature-game"><AppHeader view="connections" /><section className="game-feature-room connection-room"><div className="feature-kicker">寻找伙伴</div><div className="radar"><div className="radar-ring one"/><div className="radar-ring two"/><span>⌁</span></div><div className="radar-panel"><strong>{scanned ? '找到 pi' : '准备扫描'}</strong><small>{scanned ? '可以查看并连接' : '扫描只会查看本机候选'}</small><button className="primary" onClick={() => setScanned(true)}>{scanned ? '重新扫描' : '扫描本机'}</button></div><div className="provider-tray">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'provider-token selected' : 'provider-token'} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span><strong>{agent.name}</strong><small>{agent.id === 'pi' ? scanned ? '已找到' : '可扫描' : '即将支持'}</small></button>)}</div><button className="manual-link" onClick={() => alert('Web 原型暂不读取本机文件；桌面版会在自动扫描失败时提供系统选择器。')}>找不到？手动选择位置 →</button></section><GameDock /></main>;
}

function SettingsView({ connected }: ViewProps) {
  const [notifications, setNotifications] = useState(true);
  const [login, setLogin] = useState(false);
  return <main className="game-shell feature-game"><AppHeader view="settings" /><section className="game-feature-room settings-room"><div className="feature-kicker">设置</div><div className="settings-board"><h1>基本设置</h1><SettingRow title="完成提醒" copy="宠物提醒我查看结果" checked={notifications} onChange={() => setNotifications(!notifications)} /><SettingRow title="登录时启动" copy="打开电脑后自动出现" checked={login} onChange={() => setLogin(!login)} /><div className="settings-footnote">只观察状态 · 不读取对话 · 不控制 Agent</div></div></section><GameDock /></main>;
}

function GameDock() { return <footer className="game-dock"><button onClick={() => goView('home')}><span>⌂</span>首页</button><button onClick={() => goView('pets')}><span>♟</span>宠物</button><button onClick={() => goView('connections')}><span>⌁</span>连接</button><button onClick={() => goView('settings')}><span>⚙</span>设置</button></footer>; }

function SettingRow({ title, copy, checked, onChange }: { title: string; copy: string; checked: boolean; onChange: () => void }) { return <button className="setting-row" onClick={onChange}><span><strong>{title}</strong><small>{copy}</small></span><span className={checked ? 'toggle on' : 'toggle'}><i /></span></button>; }

function VariantA({ selected, setSelected, scene }: ViewProps & { scene: Scene }) {
  const status: Record<Scene, { label: string; hint: string; mood: 'happy' | 'working' | 'sleepy'; action: string }> = {
    welcome: { label: '等待连接', hint: '还没有 Agent', mood: 'happy', action: '连接 pi' },
    waiting: { label: '待命中', hint: 'pi 尚未开始工作', mood: 'sleepy', action: '查看连接' },
    working: { label: '工作中', hint: 'pi 正在处理任务', mood: 'working', action: '查看连接' },
    completed: { label: '已完成', hint: 'pi 有新消息', mood: 'happy', action: '查看状态' },
    disconnected: { label: '连接中断', hint: 'pi 暂时离线', mood: 'sleepy', action: '重新连接' },
  };
  const current = status[scene];
  return <main className="game-shell">
    <header className="game-topbar"><div className="game-logo"><span>✦</span> Agent Pet</div><div className="game-status"><i className={scene === 'working' ? 'pulse' : ''} />{current.label}</div></header>
    <section className="game-room" aria-label="宠物房间">
      <div className="room-decoration room-star-one">✦</div><div className="room-decoration room-star-two">✧</div>
      <div className="room-shelf" aria-hidden="true"><span>◉</span><span>✿</span></div>
      <div className="room-stage"><div className="room-circle" /><Pet mood={current.mood} /><div className="room-shadow" /></div>
      <div className="room-status"><span className="room-status-icon">{scene === 'completed' ? '✦' : scene === 'working' ? '⌁' : '☼'}</span><div><strong>{current.label}</strong><small>{current.hint}</small></div></div>
      <div className="room-agent-slots" aria-label="Agent 状态">
        {agents.filter(agent => agent.connected).map(agent => <button key={agent.id} className={selected === agent.id ? 'room-agent selected' : 'room-agent'} onClick={() => setSelected(agent.id)} aria-pressed={selected === agent.id}><span style={{ color: agent.color }}>{agent.icon}</span><span>{agent.name}</span><small>{scene === 'welcome' ? '未连接' : current.label}</small></button>)}<button className="room-agent room-add" onClick={() => goView('connections')}><span>＋</span><span>添加</span></button>
      </div>
    </section>
    <footer className="game-dock"><button onClick={() => goView('pets')}><span>♟</span>宠物</button><button onClick={() => goView('connections')}><span>⌁</span>连接</button><button onClick={() => goView('settings')}><span>⚙</span>设置</button><button className="dock-primary" onClick={() => goView('connections')}>{current.action} →</button></footer>
  </main>;
}

function VariantB({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-b"><div className="wizard-top"><div className="brand"><span className="brand-mark">✦</span> Agent Pet</div><span className="step-count">第 1 步 / 3</span></div><div className="step-dots"><b /><i /><i /></div><section className="wizard"><div className="wizard-copy"><p className="eyebrow">让宠物认识你的 AI</p><h1>选择一个<br /><em>AI 伙伴</em></h1><p className="subcopy">不用设置复杂选项，选好后我们会帮你完成剩下的事情。</p><div className="agent-list">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-option selected' : 'agent-option'} onClick={() => setSelected(agent.id)}><span className="agent-icon" style={{ background: agent.color }}>{agent.icon}</span><span><strong>{agent.name}</strong><small>{agent.connected ? '已经准备好了' : '即将和你见面'}</small></span><span className="radio">{selected === agent.id ? '●' : '○'}</span></button>)}</div><button className="primary wide" onClick={connect}>{connected ? '继续陪伴' : '下一步'} <span>→</span></button><p className="quiet">你随时都可以换一个伙伴 · 只观察状态，不读取对话内容</p></div><aside className="wizard-pet"><Pet mood={connected ? 'happy' : 'sleepy'} /><div className="speech">{connected ? `${selectedAgent.name} 已经在这里啦！` : '我在这里等你～'}</div></aside></section></main>;
}

function VariantC({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-c"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Agent Pet</span></div><button className="icon-button">⚙</button></header><section className="control-center"><div className="mood-card"><div><p className="eyebrow">现在的 Agent Pet</p><h1>{connected ? '陪伴中，状态不错' : '正在等一个伙伴'}</h1><p className="subcopy">{connected ? `${selectedAgent.name} 正在安静地做自己的事。` : '选一个 AI，让今天变得更有趣。'}</p></div><Pet mood={connected ? 'happy' : 'sleepy'} /></div><div className="section-heading"><span>我的 AI 伙伴</span><button className="text-button">管理连接 →</button></div><div className="agent-grid">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-tile selected' : 'agent-tile'} onClick={() => setSelected(agent.id)}><span className="tile-icon" style={{ color: agent.color }}>{agent.icon}</span><span className="tile-name">{agent.name}</span><span className={`tile-state ${selected === agent.id && connected ? 'online' : ''}`}>{selected === agent.id && connected ? '陪伴中' : agent.state}</span></button>)}</div><div className="activity-card"><div className="activity-icon">☀</div><div><strong>{connected ? '一切都好' : '还可以更热闹一点'}</strong><span>{connected ? '完成时我会轻轻提醒你。' : '挑一个 AI 伙伴，我就准备好了。'}</span></div><button className="primary small" onClick={connect}>{connected ? '查看状态' : '开始连接'}</button></div></section></main>;
}

function PrototypeSwitcher({ variant, scene }: { variant: Variant; scene: Scene }) { const names = { a: 'A · 宠物陪伴首页', b: 'B · 单步连接向导', c: 'C · 宠物控制中心' }; const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); return <nav className="prototype-switcher" aria-label="原型方案切换"><span className="demo-label">界面演示</span>{variant === 'a' && <select aria-label="演示状态" value={scene} onChange={event => goScene(event.target.value as Scene)}><option value="welcome">首次使用</option><option value="waiting">等待 pi</option><option value="working">工作中</option><option value="completed">已完成</option><option value="disconnected">连接中断</option></select>}<button onClick={() => goVariant(order[(index + 2) % 3]!)}>←</button><span>{names[variant]}</span><button onClick={() => goVariant(order[(index + 1) % 3]!)}>→</button></nav>; }

createRoot(document.getElementById('root')!).render(<App />);

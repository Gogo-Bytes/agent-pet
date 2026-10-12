import { type CSSProperties, useEffect, useMemo, useState } from 'react';
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
  const [petBindings, setPetBindings] = useState<Record<string, string>>({ pi: '星星', codex: '云朵', claude: '小橘' });
  useEffect(() => { const onPop = () => { setVariant(currentVariant()); setScene(currentScene()); setView(currentView()); }; addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop); }, []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); goVariant(order[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!); } }; addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey); }, [variant]);
  const selectedAgent = useMemo(() => agents.find(agent => agent.id === selected) ?? agents[0]!, [selected]);
  const connect = () => { setConnected(true); setSelected('pi'); };
  const props = { selected, setSelected, selectedAgent, connected, connect, petBindings, setPetBindings };
  return <div className="prototype-page">
    {variant === 'a' && <GameLayout {...props} view={view} scene={scene} />}
    {variant === 'b' && <VariantB {...props} />}
    {variant === 'c' && <VariantC {...props} />}
    <PrototypeSwitcher variant={variant} scene={scene} />
  </div>;
}

type ViewProps = { selected: string; setSelected: (id: string) => void; selectedAgent: Agent; connected: boolean; connect: () => void; petBindings: Record<string, string>; setPetBindings: (bindings: Record<string, string>) => void };

function Pet({ mood = 'happy', tone = 'violet' }: { mood?: 'happy' | 'working' | 'sleepy'; tone?: 'violet' | 'mint' | 'peach' }) { return <div className={`pet pet-${mood} pet-tone-${tone}`}><div className="pet-ears">⌃　⌃</div><div className="pet-face"><span>•</span><span>•</span><b>{mood === 'sleepy' ? '—' : mood === 'working' ? '◡' : 'ᴗ'}</b></div><div className="pet-body">✦</div></div>; }
function AgentPills({ selected, setSelected }: Pick<ViewProps, 'selected' | 'setSelected'>) { return <div className="agent-pills">{agents.map(agent => <button className={selected === agent.id ? 'agent-pill selected' : 'agent-pill'} key={agent.id} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span>{agent.name}</button>)}</div>; }

function AppHeader({ view }: { view: View }) { return <header className="game-topbar"><button className="game-logo brand-button" onClick={() => goView('home')}><span>✦</span> Agent Pet</button><span className="feature-page-label">{view === 'pets' ? '宠物' : view === 'connections' ? '连接' : '设置'}</span></header>; }

function FeatureHeader({ title, copy, view }: { title: string; copy: string; view: Exclude<View, 'home'> }) { return <><AppHeader view={view} /><div className="feature-heading"><p className="eyebrow">Agent Pet</p><h1>{title}</h1><p className="subcopy">{copy}</p></div></>; }

function PetsView({ selected, setSelected, petBindings, setPetBindings }: ViewProps) {
  const [asset, setAsset] = useState('星星');
  const [notice, setNotice] = useState('');
  const petOptions = [
    { name: '星星', icon: '✦', tone: 'violet' as const, mood: 'happy' as const, copy: '轻轻发光的陪伴者' },
    { name: '云朵', icon: '☁', tone: 'mint' as const, mood: 'sleepy' as const, copy: '安静柔软的好朋友' },
    { name: '小橘', icon: '●', tone: 'peach' as const, mood: 'working' as const, copy: '元气满满的行动派' },
  ];
  const pet = petOptions.find(option => option.name === asset) ?? petOptions[0]!;
  const selectedAgent = agents.find(agent => agent.id === selected) ?? agents[0]!;
  const equipped = petBindings[selectedAgent.id] === asset;
  const handlePrimary = () => {
    if (!selectedAgent.connected) { goView('connections'); return; }
    setPetBindings({ ...petBindings, [selectedAgent.id]: asset });
    setNotice(`${asset} 已经陪伴 ${selectedAgent.name}`);
    window.setTimeout(() => setNotice(''), 2200);
  };
  return <section className="game-feature-room pet-library">
    <header className="pet-library-head"><div><span className="pet-library-eyebrow">伙伴收藏</span><h1>选择一个伙伴</h1></div><span className="pet-library-count">{petOptions.length} / 12</span></header>
    <div className="pet-library-stage">
      <div className="pet-library-copy"><span>当前预览</span><h2>{pet.name}</h2><p>{pet.copy}</p><small>{equipped ? `${selectedAgent.name} 正在和它一起工作` : `预览中 · 尚未装备给 ${selectedAgent.name}`}</small></div>
      <div className={`pet-library-scene tone-${pet.tone}`}><div className="pet-library-glow" /><Pet mood={pet.mood} tone={pet.tone} /></div>
      <div className="pet-library-actions"><span>陪伴对象</span><div className="pet-agent-picker">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'pet-agent-choice active' : 'pet-agent-choice'} onClick={() => setSelected(agent.id)} aria-pressed={selected === agent.id}><i style={{ color: agent.color }}>{agent.icon}</i><b>{agent.name}</b><small>{agent.connected ? (petBindings[agent.id] ?? '未装备') : '未连接'}</small></button>)}</div><button className={equipped ? 'pet-equip-button equipped' : 'pet-equip-button'} onClick={handlePrimary}>{selectedAgent.connected ? (equipped ? '已装备' : `让它陪伴 ${selectedAgent.name}`) : `先连接 ${selectedAgent.name}`}</button></div>
    </div>
    <div className="pet-collection-head"><strong>我的伙伴</strong><span>左右滑动选择</span></div>
    <div className="pet-carousel" role="list" aria-label="宠物选择"><div className="pet-carousel-track">{petOptions.map(option => <button key={option.name} role="listitem" className={asset === option.name ? 'pet-card active' : 'pet-card'} onClick={() => setAsset(option.name)}><span className={`pet-card-icon tone-${option.tone}`}>{option.icon}</span><span><b>{option.name}</b><small>{option.copy}</small></span>{asset === option.name && <i>预览中</i>}</button>)}<button className="pet-card pet-card-add" onClick={() => alert('Web 原型暂不导入文件；正式版将校验 GLB + JSON 宠物包。')}><span className="pet-card-plus">＋</span><span><b>添加新伙伴</b><small>导入宠物包</small></span></button></div></div>
    <div className={notice ? 'pet-notice visible' : 'pet-notice'} role="status" aria-live="polite">{notice}</div>
  </section>;
}
function ConnectionsView({ selected, setSelected }: ViewProps) {
  const [scanned, setScanned] = useState(false);
  return <section className="game-feature-room connection-room"><div className="feature-kicker">寻找伙伴</div><div className="radar"><div className="radar-ring one"/><div className="radar-ring two"/><span>⌁</span></div><div className="radar-panel"><strong>{scanned ? '找到 pi' : '准备扫描'}</strong><small>{scanned ? '可以查看并连接' : '扫描只会查看本机候选'}</small><button className="primary" onClick={() => setScanned(true)}>{scanned ? '重新扫描' : '扫描本机'}</button></div><div className="provider-tray">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'provider-token selected' : 'provider-token'} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span><strong>{agent.name}</strong><small>{agent.id === 'pi' ? scanned ? '已找到' : '可扫描' : '即将支持'}</small></button>)}</div><button className="manual-link" onClick={() => alert('Web 原型暂不读取本机文件；桌面版会在自动扫描失败时提供系统选择器。')}>找不到？手动选择位置 →</button></section>;
}

function SettingsView({ connected }: ViewProps) {
  const [notifications, setNotifications] = useState(true);
  const [login, setLogin] = useState(false);
  return <section className="game-feature-room settings-room"><div className="feature-kicker">设置</div><div className="settings-board"><h1>基本设置</h1><SettingRow title="完成提醒" copy="宠物提醒我查看结果" checked={notifications} onChange={() => setNotifications(!notifications)} /><SettingRow title="登录时启动" copy="打开电脑后自动出现" checked={login} onChange={() => setLogin(!login)} /><div className="settings-footnote">只观察状态 · 不读取对话 · 不控制 Agent</div></div></section>;
}

function GameLayout(props: ViewProps & { view: View; scene: Scene }) {
  const { view, scene, ...rest } = props;
  return <main className={view === 'home' ? 'game-shell' : 'game-shell feature-game'}>{view !== 'home' && <AppHeader view={view} />}{view === 'home' ? <VariantA {...rest} scene={scene} /> : view === 'pets' ? <PetsView {...rest} /> : view === 'connections' ? <ConnectionsView {...rest} /> : <SettingsView {...rest} />}<GameDock view={view} /></main>;
}

function GameDock({ view }: { view: View }) {
  const tabs = [['home', '⌂', '首页'], ['pets', '♟', '宠物'], ['connections', '⌁', '连接'], ['settings', '⚙', '设置']] as const;
  const activeIndex = tabs.findIndex(([id]) => id === view);
  return <footer className="game-dock"><nav className="dock-tabs" role="tablist" aria-label="页面导航" style={{ '--dock-index': activeIndex } as CSSProperties}><span className="dock-tab-slider" aria-hidden="true" />{tabs.map(([id, icon, label]) => <button key={id} className={view === id ? 'dock-tab active' : 'dock-tab'} role="tab" aria-selected={view === id} onClick={() => goView(id)}><span>{icon}</span><small>{label}</small></button>)}</nav>{view === 'home' && <button className="dock-primary" onClick={() => goView('connections')}>查看连接 →</button>}</footer>;
}

function SettingRow({ title, copy, checked, onChange }: { title: string; copy: string; checked: boolean; onChange: () => void }) { return <button className="setting-row" onClick={onChange}><span><strong>{title}</strong><small>{copy}</small></span><span className={checked ? 'toggle on' : 'toggle'}><i /></span></button>; }

function VariantA({ selected, setSelected, selectedAgent, petBindings, scene }: ViewProps & { scene: Scene }) {
  const petBinding = petBindings[selectedAgent.id] ?? '星星';
  const petTone = selectedAgent.id === 'codex' ? 'mint' : selectedAgent.id === 'claude' ? 'peach' : 'violet';
  const status: Record<Scene, { label: string; hint: string; mood: 'happy' | 'working' | 'sleepy'; action: string }> = {
    welcome: { label: '等待连接', hint: '还没有 Agent', mood: 'happy', action: '连接 pi' },
    waiting: { label: '待命中', hint: 'pi 尚未开始工作', mood: 'sleepy', action: '查看连接' },
    working: { label: '工作中', hint: 'pi 正在处理任务', mood: 'working', action: '查看连接' },
    completed: { label: '已完成', hint: 'pi 有新消息', mood: 'happy', action: '查看状态' },
    disconnected: { label: '连接中断', hint: 'pi 暂时离线', mood: 'sleepy', action: '重新连接' },
  };
  const current = selectedAgent.connected
    ? status[scene]
    : { label: '未连接', hint: '从连接页添加这个 Agent', mood: 'sleepy' as const, action: `连接 ${selectedAgent.name}` };
  return <><header className="game-topbar"><div className="game-logo"><span>✦</span> Agent Pet</div><button className="hud-connection" onClick={() => goView('connections')} title="管理 Agent 连接" aria-label="管理 Agent 连接"><i />{agents.filter(agent => agent.connected).length} / {agents.length}<span>⌁</span></button></header>
    <section className="pet-stage" aria-label="宠物展示台">
      <div className="pet-stage-character"><div className={`pet-stage-orb tone-${petTone}`} /><Pet mood={current.mood} tone={petTone} /><div className="pet-stage-shadow" /></div>
      <div className={`pet-identity ${selectedAgent.connected ? scene : 'disconnected'}`}><span className="identity-agent">{selectedAgent.icon} {selectedAgent.name}</span><h1>{petBinding}</h1><button className="identity-status" onClick={() => goView('connections')} title={current.hint}><i /><span>{current.label}</span><span className="identity-arrow">↗</span></button></div>
      <div className="agent-rail" aria-label="Agent 状态">
        {agents.map(agent => <button key={agent.id} className={`${selected === agent.id ? 'agent-orb selected' : 'agent-orb'}${agent.connected ? '' : ' is-offline'}`} onClick={() => setSelected(agent.id)} aria-label={`${agent.name} · ${agent.connected ? (agent.id === selectedAgent.id ? current.label : agent.state) : '未连接'}`} aria-pressed={selected === agent.id} data-tooltip={`${agent.name} · ${agent.connected ? (agent.id === selectedAgent.id ? current.label : agent.state) : '未连接'}`}><span style={{ color: agent.color }}>{agent.icon}</span><i /></button>)}<button className="agent-orb agent-add" onClick={() => goView('connections')} aria-label="添加 Agent" data-tooltip="添加 Agent"><span>＋</span></button>
      </div>
    </section>
  </>;
}

function VariantB({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-b"><div className="wizard-top"><div className="brand"><span className="brand-mark">✦</span> Agent Pet</div><span className="step-count">第 1 步 / 3</span></div><div className="step-dots"><b /><i /><i /></div><section className="wizard"><div className="wizard-copy"><p className="eyebrow">让宠物认识你的 AI</p><h1>选择一个<br /><em>AI 伙伴</em></h1><p className="subcopy">不用设置复杂选项，选好后我们会帮你完成剩下的事情。</p><div className="agent-list">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-option selected' : 'agent-option'} onClick={() => setSelected(agent.id)}><span className="agent-icon" style={{ background: agent.color }}>{agent.icon}</span><span><strong>{agent.name}</strong><small>{agent.connected ? '已经准备好了' : '即将和你见面'}</small></span><span className="radio">{selected === agent.id ? '●' : '○'}</span></button>)}</div><button className="primary wide" onClick={connect}>{connected ? '继续陪伴' : '下一步'} <span>→</span></button><p className="quiet">你随时都可以换一个伙伴 · 只观察状态，不读取对话内容</p></div><aside className="wizard-pet"><Pet mood={connected ? 'happy' : 'sleepy'} /><div className="speech">{connected ? `${selectedAgent.name} 已经在这里啦！` : '我在这里等你～'}</div></aside></section></main>;
}

function VariantC({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-c"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Agent Pet</span></div><button className="icon-button">⚙</button></header><section className="control-center"><div className="mood-card"><div><p className="eyebrow">现在的 Agent Pet</p><h1>{connected ? '陪伴中，状态不错' : '正在等一个伙伴'}</h1><p className="subcopy">{connected ? `${selectedAgent.name} 正在安静地做自己的事。` : '选一个 AI，让今天变得更有趣。'}</p></div><Pet mood={connected ? 'happy' : 'sleepy'} /></div><div className="section-heading"><span>我的 AI 伙伴</span><button className="text-button">管理连接 →</button></div><div className="agent-grid">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-tile selected' : 'agent-tile'} onClick={() => setSelected(agent.id)}><span className="tile-icon" style={{ color: agent.color }}>{agent.icon}</span><span className="tile-name">{agent.name}</span><span className={`tile-state ${selected === agent.id && connected ? 'online' : ''}`}>{selected === agent.id && connected ? '陪伴中' : agent.state}</span></button>)}</div><div className="activity-card"><div className="activity-icon">☀</div><div><strong>{connected ? '一切都好' : '还可以更热闹一点'}</strong><span>{connected ? '完成时我会轻轻提醒你。' : '挑一个 AI 伙伴，我就准备好了。'}</span></div><button className="primary small" onClick={connect}>{connected ? '查看状态' : '开始连接'}</button></div></section></main>;
}

function PrototypeSwitcher({ variant, scene }: { variant: Variant; scene: Scene }) { const names = { a: 'A · 宠物陪伴首页', b: 'B · 单步连接向导', c: 'C · 宠物控制中心' }; const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); return <nav className="prototype-switcher" aria-label="原型方案切换"><span className="demo-label">界面演示</span>{variant === 'a' && <select aria-label="演示状态" value={scene} onChange={event => goScene(event.target.value as Scene)}><option value="welcome">首次使用</option><option value="waiting">等待 pi</option><option value="working">工作中</option><option value="completed">已完成</option><option value="disconnected">连接中断</option></select>}<button onClick={() => goVariant(order[(index + 2) % 3]!)}>←</button><span>{names[variant]}</span><button onClick={() => goVariant(order[(index + 1) % 3]!)}>→</button></nav>; }

createRoot(document.getElementById('root')!).render(<App />);

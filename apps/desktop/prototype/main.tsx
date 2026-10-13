import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GlassAction, GlassButton, GlassSurface, GlassToolbar } from './components/glass.js';
import { Icon } from './components/icons.js';
import './styles.css';
import './glass-layout.css';

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

function AppHeader({ view }: { view: View }) { return <header className="game-topbar"><button className="game-logo brand-button" onClick={() => goView('home')}><span>✦</span> Agent Pet</button><span className="feature-page-label">{view === 'home' ? '' : view === 'pets' ? '宠物' : view === 'connections' ? '连接' : '设置'}</span></header>; }

function FeatureHeader({ title, copy, view }: { title: string; copy: string; view: Exclude<View, 'home'> }) { return <><AppHeader view={view} /><div className="feature-heading"><p className="eyebrow">Agent Pet</p><h1>{title}</h1><p className="subcopy">{copy}</p></div></>; }


function ConnectionsView({ selected, setSelected }: ViewProps) {
  const [scanned, setScanned] = useState(false);
  return <section className="game-feature-room connection-room"><div className="feature-kicker">寻找伙伴</div><div className="radar"><div className="radar-ring one"/><div className="radar-ring two"/><span>⌁</span></div><div className="radar-panel"><strong>{scanned ? '找到 pi' : '准备扫描'}</strong><small>{scanned ? '可以查看并连接' : '扫描只会查看本机候选'}</small><button className="primary" onClick={() => setScanned(true)}>{scanned ? '重新扫描' : '扫描本机'}</button></div><div className="provider-tray">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'provider-token selected' : 'provider-token'} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span><strong>{agent.name}</strong><small>{agent.id === 'pi' ? scanned ? '已找到' : '可扫描' : '即将支持'}</small></button>)}</div><button className="manual-link" onClick={() => alert('Web 原型暂不读取本机文件；桌面版会在自动扫描失败时提供系统选择器。')}>找不到？手动选择位置 →</button></section>;
}

function SettingsView({ connected }: ViewProps) {
  const [notifications, setNotifications] = useState(true);
  const [login, setLogin] = useState(false);
  return <section className="game-feature-room settings-room"><div className="feature-kicker">设置</div><div className="settings-board"><h1>基本设置</h1><SettingRow title="完成提醒" copy="宠物提醒我查看结果" checked={notifications} onChange={() => setNotifications(!notifications)} /><SettingRow title="登录时启动" copy="打开电脑后自动出现" checked={login} onChange={() => setLogin(!login)} /><div className="settings-footnote">只观察状态 · 不读取对话 · 不控制 Agent</div></div></section>;
}

const companionPets = [
  { name: '星星', icon: '✦', tone: 'violet' as const },
  { name: '云朵', icon: '☁', tone: 'mint' as const },
  { name: '小橘', icon: '●', tone: 'peach' as const },
  { name: '月兔', icon: '☾', tone: 'violet' as const },
  { name: '泡泡', icon: '○', tone: 'mint' as const },
  { name: '太阳', icon: '☀', tone: 'peach' as const },
];

function CompanionStage({ view, scene, selected, setSelected, selectedAgent, petBindings, setPetBindings }: ViewProps & { view: View; scene: Scene }) {
  const [asset, setAsset] = useState(petBindings[selected] ?? '星星');
  const [panel, setPanel] = useState<'pets' | 'agents' | null>(null);
  const [motionsOpen, setMotionsOpen] = useState(false);
  const [motionQuery, setMotionQuery] = useState('');
  const [motion, setMotion] = useState('idle');
  const [play, setPlay] = useState(0);
  const [query, setQuery] = useState('');
  const motions = [{ id: 'idle', label: '待机' }, { id: 'work', label: '工作' }, { id: 'celebrate', label: '庆祝' }, { id: 'sleep', label: '睡觉' }];
  const openPanel = (value: 'pets' | 'agents') => { setQuery(''); setMotionsOpen(false); setPanel(value); };
  const editing = view === 'pets';
  const name = editing ? asset : petBindings[selected] || '星星';
  const pet = companionPets.find(p => p.name === name) ?? companionPets[0]!;
  useEffect(() => { if (view === 'home') setAsset(petBindings[selected] || '星星'); setPanel(null); setMotionsOpen(false); }, [view, selected]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPanel(null); setMotionsOpen(false); } }; addEventListener('keydown', close); return () => removeEventListener('keydown', close); }, []);
  useEffect(() => {
    if (!panel) return;
    const dialog = document.querySelector<HTMLElement>('.pet-panel-backdrop [role="dialog"]');
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const blocked: { element: HTMLElement; inert: boolean }[] = [];
    // Prevent pointer and keyboard interaction with the scene and persistent dock.
    for (let node: HTMLElement | null = dialog; node && !node.classList.contains('game-shell'); node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          blocked.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
    }
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
    (dialog.querySelector<HTMLInputElement>('input') ?? controls()[0])?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0], last = items.at(-1);
      if (!first || !last) return;
      if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      for (const entry of blocked) entry.element.inert = entry.inert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [panel]);
  const step = (delta: number) => { const i = companionPets.findIndex(p => p.name === asset); setAsset(companionPets[(i + delta + companionPets.length) % companionPets.length]!.name); };
  const trigger = (value: string) => { setMotion(value); setPlay(n => n + 1); };
  const toggleAgentBinding = (agentId: string) => {
    const next = { ...petBindings };
    if (next[agentId] === asset) delete next[agentId];
    else next[agentId] = asset;
    setPetBindings(next);
  };
  return <section className="pet-stage shared-companion-stage" hidden={view !== 'home' && view !== 'pets'} aria-label="宠物场景">
    <div className="shared-scene" data-scene-instance="persistent"><div className="pet-stage-character"><div className={`pet-stage-orb tone-${pet.tone}`} /><div key={play} className={`motion-preview motion-${motion}`}><Pet tone={pet.tone} mood={motion === 'sleep' ? 'sleepy' : 'happy'} /></div><div className="pet-stage-shadow" /></div></div>
    <div className="pet-identity"><span className="identity-agent">{editing ? '我的宠物' : selectedAgent.name}</span><h1>{name}</h1>{editing ? <div className="pet-binding-tags" aria-label="使用这个宠物的 Agent">{agents.filter(agent => petBindings[agent.id] === asset).map(agent => <GlassSurface as="span" className="pet-binding-tag" key={agent.id}><i style={{ color: agent.color }}>{agent.icon}</i>{agent.name}<button aria-label={`解除 ${agent.name} 的宠物绑定`} onClick={() => { const next = { ...petBindings }; delete next[agent.id]; setPetBindings(next); }}><Icon name="close" /></button></GlassSurface>)}<GlassButton className="pet-tag-add" aria-label="配置使用此宠物的 Agent" title="配置 Agent" onClick={() => openPanel('agents')}><Icon name="plus" /></GlassButton></div> : <><span className="identity-status">{selectedAgent.connected ? ({welcome:'待命中',waiting:'待命中',working:'工作中',completed:'已完成',disconnected:'连接中断'}[scene]) : '未连接'}</span><div className="pet-binding-tags">{agents.map(agent => <GlassButton key={agent.id} className="pet-binding-tag" onClick={() => setSelected(agent.id)} aria-pressed={selected === agent.id}><i style={{color:agent.color}}>{agent.icon}</i>{agent.name}</GlassButton>)}</div></>}</div>
    {editing && <><GlassToolbar className="pet-cycle" aria-label="宠物切换"><GlassAction aria-label="上一个宠物" onClick={() => step(-1)}><Icon name="left" /></GlassAction><GlassAction className="pet-grid-open" title="所有宠物" aria-label="打开宠物收藏" onClick={() => openPanel('pets')}><Icon name="grid" /> <small>{companionPets.findIndex(p => p.name === asset) + 1} / {companionPets.length}</small></GlassAction><GlassAction aria-label="下一个宠物" onClick={() => step(1)}><Icon name="right" /></GlassAction></GlassToolbar><div className="pet-animation-picker"><GlassToolbar className="pet-animation-toolbar" aria-label="动画预览"><GlassAction title="重新播放" aria-label="重新播放当前动画" onClick={() => trigger(motion)}><Icon name="replay" /></GlassAction><GlassAction aria-label="选择动画" aria-expanded={motionsOpen} aria-controls="motion-palette" onClick={() => setMotionsOpen(open => !open)}><Icon name="play" /> {motions.find(m => m.id === motion)?.label} <Icon name={motionsOpen ? 'up' : 'down'} /></GlassAction></GlassToolbar>{motionsOpen && <GlassSurface as="section" material="panel" className="motion-palette" id="motion-palette" aria-label="选择动画"><header><strong>动作</strong><small>{motions.length}</small></header><label className="surface-search glass-inset"><Icon name="search" /><input aria-label="搜索动画" placeholder="搜索动作" value={motionQuery} onChange={e => setMotionQuery(e.target.value)} /></label><div className="motion-list">{motions.filter(m => m.label.includes(motionQuery)).map(m => <button className="glass-choice" key={m.id} aria-pressed={motion === m.id} title={motion === m.id ? '点击重新播放' : '播放动作'} onClick={() => trigger(m.id)}><span>{m.label}</span><Icon name={motion === m.id ? 'check' : 'play'} /></button>)}{!motions.some(m => m.label.includes(motionQuery)) && <p className="collection-empty">没有找到动作</p>}</div></GlassSurface>}</div></>}
    {panel && <div className="pet-panel-backdrop" onClick={() => setPanel(null)}><GlassSurface material="panel" className={panel === 'pets' ? 'pet-collection-drawer' : 'pet-agent-dialog'} role="dialog" aria-modal="true" aria-label={panel === 'pets' ? '宠物收藏' : '配置 Agent'} onClick={e => e.stopPropagation()}><header><h2>{panel === 'pets' ? '宠物收藏' : '配置给 Agent'}</h2><button className="glass-choice" aria-label="关闭弹窗" onClick={() => setPanel(null)}><Icon name="close" /></button></header>{panel !== 'agents' && <label className="collection-search glass-inset"><Icon name="search" /><input aria-label={panel === 'pets' ? '搜索宠物' : '搜索动画'} placeholder={panel === 'pets' ? '搜索宠物' : '搜索动画'} value={query} onChange={e => setQuery(e.target.value)} /></label>}{panel === 'pets' ? <div className="pet-avatar-grid">{companionPets.filter(p => p.name.includes(query)).map(p => <button key={p.name} aria-pressed={asset === p.name} onClick={() => { setAsset(p.name); setPanel(null); }}><span className={`pet-card-icon tone-${p.tone}`}>{p.icon}</span><span className="avatar-name">{p.name}</span></button>)}<button className="avatar-add" onClick={() => alert('原型演示：正式版将在这里选择宠物包')}><span className="pet-card-icon"><Icon name="plus" /></span><span className="avatar-name">添加</span></button>{!companionPets.some(p => p.name.includes(query)) && <p className="collection-empty">没有找到宠物</p>}</div> : <><div className="pet-agent-options">{agents.map(agent => <button key={agent.id} className={petBindings[agent.id] === asset ? 'glass-choice is-configured' : 'glass-choice'} aria-pressed={petBindings[agent.id] === asset} onClick={() => toggleAgentBinding(agent.id)}><i style={{color:agent.color}}>{agent.icon}</i><span>{agent.name}</span><small>{petBindings[agent.id] === asset ? '已配置 ✓' : petBindings[agent.id] || '未配置'}</small></button>)}</div><button className="dialog-done" onClick={() => setPanel(null)}>完成</button></>}</GlassSurface></div>}
  </section>;
}

function GameLayout(props: ViewProps & { view: View; scene: Scene }) {
  return <main className="game-shell"><AppHeader view={props.view} /><CompanionStage {...props} />{props.view === 'connections' && <ConnectionsView {...props} />}{props.view === 'settings' && <SettingsView {...props} />}<GameDock view={props.view} /></main>;
}

function GameDock({ view }: { view: View }) {
  const tabs = [['home', 'home', '首页'], ['pets', 'pet', '宠物'], ['connections', 'link', '连接'], ['settings', 'settings', '设置']] as const;
  const activeIndex = tabs.findIndex(([id]) => id === view);
  return <footer className="game-dock"><nav className="dock-tabs" role="tablist" aria-label="页面导航" style={{ '--dock-index': activeIndex } as CSSProperties}><span className="dock-tab-slider" aria-hidden="true" />{tabs.map(([id, icon, label]) => <button key={id} className={view === id ? 'dock-tab active' : 'dock-tab'} role="tab" aria-selected={view === id} onClick={() => goView(id)}><Icon name={icon} /><small>{label}</small></button>)}</nav>{view === 'home' && <button className="dock-primary" aria-label="查看连接" title="查看连接" onClick={() => goView('connections')}><span>查看连接</span><Icon name="right" /></button>}</footer>;
}

function SettingRow({ title, copy, checked, onChange }: { title: string; copy: string; checked: boolean; onChange: () => void }) { return <button className="setting-row" role="switch" aria-checked={checked} onClick={onChange}><span><strong>{title}</strong><small>{copy}</small></span><span className={checked ? 'toggle on' : 'toggle'}><i /></span></button>; }

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

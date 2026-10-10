import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Variant = 'a' | 'b' | 'c';
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

function goVariant(variant: Variant) {
  const url = new URL(location.href); url.searchParams.set('variant', variant); history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

function App() {
  const [variant, setVariant] = useState<Variant>(currentVariant);
  const [selected, setSelected] = useState('pi');
  const [connected, setConnected] = useState(true);
  useEffect(() => { const onPop = () => setVariant(currentVariant()); addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop); }, []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); goVariant(order[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!); } }; addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey); }, [variant]);
  const selectedAgent = useMemo(() => agents.find(agent => agent.id === selected) ?? agents[0]!, [selected]);
  const connect = () => { setConnected(true); setSelected('pi'); };
  const props = { selected, setSelected, selectedAgent, connected, connect };
  return <div className="prototype-page">
    {variant === 'a' && <VariantA {...props} />}
    {variant === 'b' && <VariantB {...props} />}
    {variant === 'c' && <VariantC {...props} />}
    <PrototypeSwitcher variant={variant} />
  </div>;
}

type ViewProps = { selected: string; setSelected: (id: string) => void; selectedAgent: Agent; connected: boolean; connect: () => void };

function Pet({ mood = 'happy' }: { mood?: 'happy' | 'working' | 'sleepy' }) { return <div className={`pet pet-${mood}`}><div className="pet-ears">⌃　⌃</div><div className="pet-face"><span>•</span><span>•</span><b>{mood === 'sleepy' ? '—' : mood === 'working' ? '◡' : 'ᴗ'}</b></div><div className="pet-body">✦</div></div>; }
function AgentPills({ selected, setSelected }: Pick<ViewProps, 'selected' | 'setSelected'>) { return <div className="agent-pills">{agents.map(agent => <button className={selected === agent.id ? 'agent-pill selected' : 'agent-pill'} key={agent.id} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span>{agent.name}</button>)}</div>; }

function VariantA({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-a"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Agent Pet</span></div><span className="tiny-status"><i className="dot" /> {connected ? '陪伴中' : '等你选择'}</span></header><section className="hero-a"><div className="hero-copy"><p className="eyebrow">你的桌面小伙伴</p><h1>今天想让谁<br /><em>陪你一起玩？</em></h1><p className="subcopy">选一个 AI 伙伴，Agent Pet 会用自己的方式告诉你它正在做什么。</p><AgentPills selected={selected} setSelected={setSelected} /><button className="primary" onClick={connect}>{connected ? '让它继续陪着我' : '让它陪着我'} <span>→</span></button></div><div className="hero-pet"><div className="halo" /><Pet mood={connected ? 'working' : 'happy'} /><div className="bubble">{connected ? `${selectedAgent.name} 正在认真工作` : '等你挑一个伙伴'}</div></div></section><section className="mini-row"><div><strong>今天的心情</strong><span>有一点期待，也有一点可爱</span></div><div><strong>宠物状态</strong><span>{connected ? '正在陪伴你的工作' : '自由自在地等候中'}</span></div></section></main>;
}

function VariantB({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-b"><div className="wizard-top"><div className="brand"><span className="brand-mark">✦</span> Agent Pet</div><span className="step-count">第 1 步 / 3</span></div><div className="step-dots"><b /><i /><i /></div><section className="wizard"><div className="wizard-copy"><p className="eyebrow">让宠物认识你的 AI</p><h1>选择一个<br /><em>AI 伙伴</em></h1><p className="subcopy">不用设置复杂选项，选好后我们会帮你完成剩下的事情。</p><div className="agent-list">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-option selected' : 'agent-option'} onClick={() => setSelected(agent.id)}><span className="agent-icon" style={{ background: agent.color }}>{agent.icon}</span><span><strong>{agent.name}</strong><small>{agent.connected ? '已经准备好了' : '即将和你见面'}</small></span><span className="radio">{selected === agent.id ? '●' : '○'}</span></button>)}</div><button className="primary wide" onClick={connect}>{connected ? '继续陪伴' : '下一步'} <span>→</span></button><p className="quiet">你随时都可以换一个伙伴 · 只观察状态，不读取对话内容</p></div><aside className="wizard-pet"><Pet mood={connected ? 'happy' : 'sleepy'} /><div className="speech">{connected ? `${selectedAgent.name} 已经在这里啦！` : '我在这里等你～'}</div></aside></section></main>;
}

function VariantC({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-c"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Agent Pet</span></div><button className="icon-button">⚙</button></header><section className="control-center"><div className="mood-card"><div><p className="eyebrow">现在的 Agent Pet</p><h1>{connected ? '陪伴中，状态不错' : '正在等一个伙伴'}</h1><p className="subcopy">{connected ? `${selectedAgent.name} 正在安静地做自己的事。` : '选一个 AI，让今天变得更有趣。'}</p></div><Pet mood={connected ? 'happy' : 'sleepy'} /></div><div className="section-heading"><span>我的 AI 伙伴</span><button className="text-button">管理连接 →</button></div><div className="agent-grid">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-tile selected' : 'agent-tile'} onClick={() => setSelected(agent.id)}><span className="tile-icon" style={{ color: agent.color }}>{agent.icon}</span><span className="tile-name">{agent.name}</span><span className={`tile-state ${selected === agent.id && connected ? 'online' : ''}`}>{selected === agent.id && connected ? '陪伴中' : agent.state}</span></button>)}</div><div className="activity-card"><div className="activity-icon">☀</div><div><strong>{connected ? '一切都好' : '还可以更热闹一点'}</strong><span>{connected ? '完成时我会轻轻提醒你。' : '挑一个 AI 伙伴，我就准备好了。'}</span></div><button className="primary small" onClick={connect}>{connected ? '查看状态' : '开始连接'}</button></div></section></main>;
}

function PrototypeSwitcher({ variant }: { variant: Variant }) { const names = { a: 'A · 宠物陪伴首页', b: 'B · 单步连接向导', c: 'C · 宠物控制中心' }; const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); return <nav className="prototype-switcher" aria-label="原型方案切换"><button onClick={() => goVariant(order[(index + 2) % 3]!)}>←</button><span>{names[variant]}</span><button onClick={() => goVariant(order[(index + 1) % 3]!)}>→</button></nav>; }

createRoot(document.getElementById('root')!).render(<App />);

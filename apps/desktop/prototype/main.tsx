import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Variant = 'a' | 'b' | 'c';
type Scene = 'welcome' | 'waiting' | 'working' | 'completed' | 'disconnected';
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

function goScene(scene: Scene) {
  const url = new URL(location.href); url.searchParams.set('scene', scene); history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

function goVariant(variant: Variant) {
  const url = new URL(location.href); url.searchParams.set('variant', variant); history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
}

function App() {
  const [variant, setVariant] = useState<Variant>(currentVariant);
  const [scene, setScene] = useState<Scene>(currentScene);
  const [selected, setSelected] = useState('pi');
  const [connected, setConnected] = useState(true);
  useEffect(() => { const onPop = () => { setVariant(currentVariant()); setScene(currentScene()); }; addEventListener('popstate', onPop); return () => removeEventListener('popstate', onPop); }, []);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); goVariant(order[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]!); } }; addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey); }, [variant]);
  const selectedAgent = useMemo(() => agents.find(agent => agent.id === selected) ?? agents[0]!, [selected]);
  const connect = () => { setConnected(true); setSelected('pi'); };
  const props = { selected, setSelected, selectedAgent, connected, connect };
  return <div className="prototype-page">
    {variant === 'a' && <VariantA {...props} scene={scene} />}
    {variant === 'b' && <VariantB {...props} />}
    {variant === 'c' && <VariantC {...props} />}
    <PrototypeSwitcher variant={variant} scene={scene} />
  </div>;
}

type ViewProps = { selected: string; setSelected: (id: string) => void; selectedAgent: Agent; connected: boolean; connect: () => void };

function Pet({ mood = 'happy' }: { mood?: 'happy' | 'working' | 'sleepy' }) { return <div className={`pet pet-${mood}`}><div className="pet-ears">⌃　⌃</div><div className="pet-face"><span>•</span><span>•</span><b>{mood === 'sleepy' ? '—' : mood === 'working' ? '◡' : 'ᴗ'}</b></div><div className="pet-body">✦</div></div>; }
function AgentPills({ selected, setSelected }: Pick<ViewProps, 'selected' | 'setSelected'>) { return <div className="agent-pills">{agents.map(agent => <button className={selected === agent.id ? 'agent-pill selected' : 'agent-pill'} key={agent.id} onClick={() => setSelected(agent.id)}><span style={{ color: agent.color }}>{agent.icon}</span>{agent.name}</button>)}</div>; }

function VariantA({ selected, setSelected, scene }: ViewProps & { scene: Scene }) {
  const copy: Record<Scene, { eyebrow: string; title: string; accent: string; body: string; bubble: string; status: string; action: string; mood: 'happy' | 'working' | 'sleepy' }> = {
    welcome: { eyebrow: '你的桌面小伙伴', title: '今天想让谁', accent: '陪你一起玩？', body: '选一个 AI 伙伴。准备好之后，小宠物就能陪你度过每一次等待和完成。', bubble: '嗨，认识一下？', status: '还没有连接', action: '认识 pi', mood: 'happy' },
    waiting: { eyebrow: 'pi 已准备好', title: '先歇一会儿', accent: '也很好。', body: '你正常打开 pi 后，宠物会在这里陪着你。不用一直盯着屏幕。', bubble: '我在这儿～', status: '等待 pi', action: '看看连接状态', mood: 'sleepy' },
    working: { eyebrow: '正在陪伴 pi', title: '它在忙，', accent: '我陪你等。', body: 'pi 正在处理一件事。等它完成，我会轻轻提醒你。', bubble: 'pi 正在认真工作', status: '陪伴中', action: '看看现在的状态', mood: 'working' },
    completed: { eyebrow: '有新消息啦', title: '好消息，', accent: '完成啦！', body: 'pi 刚刚完成了一件事。桌面的气泡会提醒你查看。', bubble: '有一件事完成了 ✨', status: '有新消息', action: '看看这件事', mood: 'happy' },
    disconnected: { eyebrow: '稍等一下', title: 'pi 暂时', accent: '离开了。', body: '宠物还在这里。你重新打开 pi 后，就可以继续陪伴。', bubble: '我会在这儿等你', status: '暂时未连接', action: '看看怎么恢复', mood: 'sleepy' },
  };
  const current = copy[scene];
  const unsupported = selected !== 'pi';
  return <main className="shell variant-a"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Agent Pet</span></div><span className="tiny-status"><i className={`dot ${scene === 'disconnected' || scene === 'welcome' ? 'dot-muted' : ''}`} /> {current.status}</span></header><section className="hero-a"><div className="hero-copy"><p className="eyebrow">{current.eyebrow}</p><h1>{current.title}<br /><em>{current.accent}</em></h1><p className="subcopy">{current.body}</p><div className="agent-pills">{agents.map(agent => <button className={selected === agent.id ? 'agent-pill selected' : 'agent-pill'} key={agent.id} onClick={() => setSelected(agent.id)} aria-pressed={selected === agent.id}><span style={{ color: agent.color }}>{agent.icon}</span>{agent.name}{!agent.connected && <small>即将支持</small>}</button>)}</div>{unsupported ? <p className="availability-note">{agents.find(agent => agent.id === selected)?.name} 还没有接入能力。目前可以先让宠物陪你使用 pi。</p> : <button className="primary" onClick={() => goScene(scene === 'welcome' ? 'waiting' : 'working')}>{current.action} <span>→</span></button>}</div><div className="hero-pet"><div className="halo" /><Pet mood={current.mood} /><div className="bubble">{unsupported ? '以后也想认识它！' : current.bubble}</div></div></section><section className="mini-row"><div><strong>宠物在这里</strong><span>没有 Agent 也可以一直陪着你</span></div><div><strong>当前伙伴</strong><span>{scene === 'welcome' ? '还没有连接' : 'pi · ' + current.status}</span></div></section></main>;
}

function VariantB({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-b"><div className="wizard-top"><div className="brand"><span className="brand-mark">✦</span> Agent Pet</div><span className="step-count">第 1 步 / 3</span></div><div className="step-dots"><b /><i /><i /></div><section className="wizard"><div className="wizard-copy"><p className="eyebrow">让宠物认识你的 AI</p><h1>选择一个<br /><em>AI 伙伴</em></h1><p className="subcopy">不用设置复杂选项，选好后我们会帮你完成剩下的事情。</p><div className="agent-list">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-option selected' : 'agent-option'} onClick={() => setSelected(agent.id)}><span className="agent-icon" style={{ background: agent.color }}>{agent.icon}</span><span><strong>{agent.name}</strong><small>{agent.connected ? '已经准备好了' : '即将和你见面'}</small></span><span className="radio">{selected === agent.id ? '●' : '○'}</span></button>)}</div><button className="primary wide" onClick={connect}>{connected ? '继续陪伴' : '下一步'} <span>→</span></button><p className="quiet">你随时都可以换一个伙伴 · 只观察状态，不读取对话内容</p></div><aside className="wizard-pet"><Pet mood={connected ? 'happy' : 'sleepy'} /><div className="speech">{connected ? `${selectedAgent.name} 已经在这里啦！` : '我在这里等你～'}</div></aside></section></main>;
}

function VariantC({ selected, setSelected, selectedAgent, connected, connect }: ViewProps) {
  return <main className="shell variant-c"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Agent Pet</span></div><button className="icon-button">⚙</button></header><section className="control-center"><div className="mood-card"><div><p className="eyebrow">现在的 Agent Pet</p><h1>{connected ? '陪伴中，状态不错' : '正在等一个伙伴'}</h1><p className="subcopy">{connected ? `${selectedAgent.name} 正在安静地做自己的事。` : '选一个 AI，让今天变得更有趣。'}</p></div><Pet mood={connected ? 'happy' : 'sleepy'} /></div><div className="section-heading"><span>我的 AI 伙伴</span><button className="text-button">管理连接 →</button></div><div className="agent-grid">{agents.map(agent => <button key={agent.id} className={selected === agent.id ? 'agent-tile selected' : 'agent-tile'} onClick={() => setSelected(agent.id)}><span className="tile-icon" style={{ color: agent.color }}>{agent.icon}</span><span className="tile-name">{agent.name}</span><span className={`tile-state ${selected === agent.id && connected ? 'online' : ''}`}>{selected === agent.id && connected ? '陪伴中' : agent.state}</span></button>)}</div><div className="activity-card"><div className="activity-icon">☀</div><div><strong>{connected ? '一切都好' : '还可以更热闹一点'}</strong><span>{connected ? '完成时我会轻轻提醒你。' : '挑一个 AI 伙伴，我就准备好了。'}</span></div><button className="primary small" onClick={connect}>{connected ? '查看状态' : '开始连接'}</button></div></section></main>;
}

function PrototypeSwitcher({ variant, scene }: { variant: Variant; scene: Scene }) { const names = { a: 'A · 宠物陪伴首页', b: 'B · 单步连接向导', c: 'C · 宠物控制中心' }; const order: Variant[] = ['a', 'b', 'c']; const index = order.indexOf(variant); return <nav className="prototype-switcher" aria-label="原型方案切换"><span className="demo-label">界面演示</span>{variant === 'a' && <select aria-label="演示状态" value={scene} onChange={event => goScene(event.target.value as Scene)}><option value="welcome">首次使用</option><option value="waiting">等待 pi</option><option value="working">工作中</option><option value="completed">已完成</option><option value="disconnected">连接中断</option></select>}<button onClick={() => goVariant(order[(index + 2) % 3]!)}>←</button><span>{names[variant]}</span><button onClick={() => goVariant(order[(index + 1) % 3]!)}>→</button></nav>; }

createRoot(document.getElementById('root')!).render(<App />);

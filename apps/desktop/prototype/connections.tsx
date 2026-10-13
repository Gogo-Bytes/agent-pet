import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/icons.js';
import './connections.css';

export type ConnectionDemo = 'normal' | 'empty' | 'missing' | 'waiting' | 'error';
type Health = 'online' | 'waiting' | 'error';
type ProviderId = 'pi' | 'codex' | 'claude' | 'gemini' | 'cursor' | 'opencode';
export type ConnectionHealths = Partial<Record<ProviderId, Health>>;
const providers: Record<ProviderId, { name: string; glyph: string; tone: string }> = {
  pi: { name: 'pi', glyph: 'π', tone: 'violet' },
  codex: { name: 'Codex', glyph: '⌘', tone: 'mint' },
  claude: { name: 'Claude Code', glyph: '✳', tone: 'peach' },
  gemini: { name: 'Gemini CLI', glyph: '✦', tone: 'blue' },
  cursor: { name: 'Cursor', glyph: '↗', tone: 'slate' },
  opencode: { name: 'OpenCode', glyph: '◈', tone: 'rose' },
};
type Target = { id: string; provider: ProviderId; name: string; location: string };
function ProviderMark({ provider }: { provider: ProviderId }) {
  const value = providers[provider];
  return <span aria-hidden="true" className={`provider-logo provider-${value.tone}`}>{value.glyph}</span>;
}
type Connection = Target & { health: Health; lastState: string | null };
type Step = 'overview' | 'searching' | 'found' | 'location' | 'confirm' | 'checking' | 'rechecking' | 'result' | 'remove';
const targets: Target[] = [
  { id: 'pi-default', provider: 'pi', name: '个人配置', location: '~/.pi/agent' },
  { id: 'pi-project', provider: 'pi', name: '项目配置', location: '~/Projects/demo/.pi' },
  { id: 'codex-personal', provider: 'codex', name: '个人配置', location: '~/Agent-Demo/codex/personal' },
  { id: 'codex-project', provider: 'codex', name: '网站项目', location: '~/Agent-Demo/codex/website' },
  { id: 'claude-personal', provider: 'claude', name: '个人配置', location: '~/Agent-Demo/claude/personal' },
  { id: 'gemini-personal', provider: 'gemini', name: '个人配置', location: '~/Agent-Demo/gemini/personal' },
  { id: 'cursor-project', provider: 'cursor', name: '设计项目', location: '~/Agent-Demo/cursor/design' },
  { id: 'opencode-project', provider: 'opencode', name: '实验项目', location: '~/Agent-Demo/opencode/playground' },
];
const initial: Connection = { ...targets[0]!, health: 'online', lastState: '待命中' };
const initialRecords: Connection[] = [
  initial,
  { ...targets[2]!, health: 'online', lastState: '工作中' },
  { ...targets[4]!, health: 'waiting', lastState: null },
  { ...targets[5]!, health: 'error', lastState: '已完成' },
  { ...targets[7]!, health: 'online', lastState: '待命中' },
];
const healthLabels: Record<Health, string> = { online: '已连接', waiting: '等待启动', error: '连接中断' };

export function ConnectionsView({ visible, demo, onConfigured }: {
  visible: boolean;
  demo: ConnectionDemo;
  onConfigured: (healths: ConnectionHealths) => void;
}) {
  const [records, setRecords] = useState<Connection[]>(initialRecords);
  const [selected, setSelected] = useState(initial.id);
  const [step, setStep] = useState<Step>('overview');
  const [target, setTarget] = useState<Target>(targets[0]!);
  const [locationFrom, setLocationFrom] = useState<'overview' | 'found'>('overview');
  const [confirmFrom, setConfirmFrom] = useState<'found' | 'location'>('found');
  const [location, setLocation] = useState(targets[0]!.id);
  const [notice, setNotice] = useState('');
  const content = useRef<HTMLElement | null>(null);
  const previousSelection = useRef(selected);
  const retryCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const detail = records.find(record => record.id === selected);
  const busy = step === 'searching' || step === 'checking' || step === 'rechecking';
  const flow = step !== 'overview' && step !== 'remove' && step !== 'rechecking';

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    clearTimeout(timer.current);
    retryCount.current = 0;
    setStep('overview'); setNotice(''); setSelected(initial.id); setLocation(initial.id);
    setTarget(targets[0]!);
    setRecords(demo === 'empty' || demo === 'missing' ? [] : demo === 'normal' ? initialRecords : [{ ...initial,
      health: demo === 'waiting' ? 'waiting' : demo === 'error' ? 'error' : 'online',
      lastState: null,
    }]);
  }, [demo]);
  useEffect(() => {
    const healths: ConnectionHealths = {};
    for (const record of records) {
      if (healths[record.provider] !== 'online') healths[record.provider] = record.health;
    }
    onConfigured(healths);
  }, [records, onConfigured]);
  useEffect(() => {
    if (visible) {
      content.current?.focus({ preventScroll: true });
      if (selected !== previousSelection.current && matchMedia('(max-width:760px)').matches) {
        content.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
      }
    }
    previousSelection.current = selected;
  }, [step, visible, selected]);

  function stop(next: Step = 'overview') { clearTimeout(timer.current); setStep(next); }
  function scan() {
    stop('searching'); setNotice('');
    timer.current = setTimeout(() => setStep('found'), 900);
  }
  function openLocation(from: 'overview' | 'found') { setLocationFrom(from); stop('location'); }
  function choose(value: Target, from: 'found' | 'location') {
    setTarget(value); setConfirmFrom(from); stop('confirm');
  }
  function check(adding: boolean) {
    const checkedId = adding ? target.id : selected;
    stop(adding ? 'checking' : 'rechecking'); setNotice('');
    timer.current = setTimeout(() => {
      const health: Health = demo === 'waiting' ? 'waiting' : demo === 'error' && (adding || retryCount.current++ === 0) ? 'error' : 'online';
      setRecords(current => adding
        ? [...current.filter(record => record.id !== target.id), { ...target, health, lastState: null }]
        : current.map(record => record.id === checkedId ? { ...record, health } : record));
      setSelected(checkedId); setStep(adding ? 'result' : 'overview');
      if (!adding) setNotice(health === 'online' ? '检查完成，连接正常。' : health === 'waiting' ? `还未收到 ${providers[(adding ? target : detail)!.provider].name} 的启动信号。` : '未收到连接信号。');
    }, 1100);
  }

  return <section className="connections-page" hidden={!visible} aria-label="Agent 连接管理">
    <header className="connections-heading">
      <div><span className="connection-eyebrow">AGENTS</span><h1>连接</h1></div>
      <div className="connection-heading-actions">
        <button className="connection-primary" disabled={busy} onClick={scan}><Icon name="search" />一键扫描</button>
        <button className="connection-icon" disabled={busy} aria-label="手动选择配置位置" title="手动选择配置位置" onClick={() => openLocation(step === 'found' ? 'found' : 'overview')}><Icon name="plus" /></button>
      </div>
    </header>
    <div className="connections-layout">
      <aside className="configured-connection-list" aria-label="已接入的配置">
        <header><h2>已接入</h2><span>{records.length}</span></header>
        {records.map(record => <button className="connection-row" key={record.id}
          aria-pressed={['overview', 'remove', 'rechecking'].includes(step) && selected === record.id}
          onClick={() => { stop(); setSelected(record.id); setNotice(''); }}>
          <ProviderMark provider={record.provider} />
          <span><strong>{providers[record.provider].name} <small>{record.name}</small></strong><span className="row-status"><i className={`health-dot ${record.health}`} />{healthLabels[record.health]}</span></span>
          <Icon name="right" />
        </button>)}
        {!records.length && <p className="connection-list-empty">暂无连接</p>}
      </aside>
      <article ref={content} tabIndex={-1} className="connection-content" aria-label="连接操作与详情" aria-live="polite" aria-busy={busy}>
        {flow && <header className="connection-flow-heading"><span>{step === 'searching' || step === 'found' ? '扫描配置' : step === 'location' ? '选择位置' : `接入 ${providers[target.provider].name}`}</span><button className="connection-icon" aria-label={step === 'searching' || step === 'found' ? '结束扫描' : '取消接入'} title={step === 'searching' || step === 'found' ? '结束扫描' : '取消接入'} onClick={() => stop()}><Icon name="close" /></button></header>}
        {step === 'overview' && !detail && <div className="connection-empty"><Icon name="link" /><h2>扫描本机的 Agent 配置</h2><p>6 种 Agent · 模拟配置</p><button className="connection-primary" onClick={scan}><Icon name="search" />一键扫描</button><button className="connection-text" onClick={() => openLocation('overview')}>手动选择位置</button></div>}
        {step === 'overview' && detail && <>
          <div className="connection-detail-title"><div><span className="connection-eyebrow">{providers[detail.provider].name}</span><h2>{detail.name}</h2></div><span className={`connection-status ${detail.health}`}><i className={`health-dot ${detail.health}`} />{healthLabels[detail.health]}</span></div>
          <dl className="connection-facts"><div><dt>配置位置</dt><dd className="connection-path">{detail.location}</dd></div><div><dt>工作状态</dt><dd>{detail.lastState ?? '尚未收到'}</dd></div><div><dt>最近通信</dt><dd>{detail.health === 'online' ? '刚刚' : '暂无'}</dd></div></dl>
          {detail.health !== 'online' && <div className="connection-guidance"><Icon name="link" /><div><h3>{detail.health === 'waiting' ? `打开 ${providers[detail.provider].name} 即可连接` : `请确认 ${providers[detail.provider].name} 已打开`}</h3>{detail.health === 'error' && <p>{detail.provider === 'pi' ? 'pi 已在运行？重新加载扩展后再检查。' : '程序已在运行？重新检查连接。'}</p>}</div></div>}
          {notice && <p className="connection-notice" role="status">{notice}</p>}
          <div className="connection-actions"><button className="connection-secondary" onClick={() => check(false)}><Icon name="replay" />检查连接</button><button className="connection-text" onClick={() => stop('remove')}>移除</button></div>
        </>}
        {busy && <div className="connection-empty"><span className="connection-spinner" /><h2>{step === 'searching' ? '正在扫描' : '正在检查连接'}</h2>{step === 'searching' && <p>查找个人与项目配置</p>}<button className="connection-text" onClick={() => stop()}>取消</button></div>}
        {step === 'found' && <>
          <h2>{demo === 'missing' ? '未找到可接入的配置' : `找到 ${targets.length} 个配置`}</h2>
          {demo === 'missing' ? <p className="connection-description">试试手动选择配置文件夹。</p> : <div className="connection-candidates">{targets.map(value => {
            const configured = records.some(record => record.id === value.id);
            return <div className="connection-candidate" key={value.id}><ProviderMark provider={value.provider} /><div><strong>{providers[value.provider].name} <small>{value.name}</small></strong><span className="connection-path">{value.location}</span></div>{configured ? <span className="candidate-added"><Icon name="check" />已接入</span> : <button className="connection-secondary" aria-label={`接入 ${providers[value.provider].name} ${value.name}`} onClick={() => choose(value, 'found')}>接入<Icon name="right" /></button>}</div>;
          })}</div>}
          <div className="connection-actions"><button className="connection-text" onClick={scan}><Icon name="replay" />重新扫描</button><button className="connection-text" onClick={() => openLocation(step === 'found' ? 'found' : 'overview')}>手动选择位置</button></div>
        </>}
        {step === 'location' && <>
          <h2>选择配置位置</h2>
          <label className="connection-location">配置位置<select aria-label="配置位置" value={location} onChange={event => setLocation(event.target.value)}>{targets.map(value => <option value={value.id} key={value.id}>{providers[value.provider].name} · {value.name} · {value.location}</option>)}</select></label>
          {records.some(record => record.id === location) ? <div className="connection-guidance"><Icon name="check" /><span>此配置已接入</span></div> : <button className="connection-primary" onClick={() => choose(targets.find(value => value.id === location)!, 'location')}>继续<Icon name="right" /></button>}
          <button className="connection-text" onClick={() => stop(locationFrom)}>返回</button>
        </>}
        {step === 'confirm' && <>
          <h2>接入 {providers[target.provider].name}</h2>
          <dl className="connection-facts confirmation-facts"><div><dt>配置位置</dt><dd className="connection-path">{target.location}</dd></div>{target.provider === 'pi' && <div><dt>新增文件</dt><dd className="connection-path">extensions/agent-pet.ts</dd></div>}</dl>
          <p className="connection-description">{target.provider === 'pi' ? '添加状态扩展。已运行的 pi 需要重新加载扩展。' : `模拟接入${target.name}，接收 ${providers[target.provider].name} 的工作状态。`}</p>
          <div className="connection-actions"><button className="connection-primary" onClick={() => check(true)}>确认接入<Icon name="right" /></button><button className="connection-text" onClick={() => stop(confirmFrom)}>返回</button></div>
        </>}
        {step === 'result' && <>
          <div className="connection-result-icon"><Icon name={detail?.health === 'online' ? 'check' : 'link'} /></div>
          <h2>{detail?.health === 'online' ? '已连接' : detail?.health === 'waiting' ? '已配置，等待启动' : '已配置，连接中断'}</h2>
          <p className="connection-description">{detail?.health === 'online' ? `已收到 ${providers[target.provider].name} 的连接信号。` : detail?.health === 'waiting' ? `打开 ${providers[target.provider].name} 后即可继续。` : '打开程序后再检查连接。'}</p>
          <div className="connection-actions"><button className="connection-primary" onClick={() => stop()}>完成<Icon name="check" /></button></div>
        </>}
        {step === 'remove' && <>
          <h2>移除 {detail && providers[detail.provider].name} · {detail?.name}？</h2><p className="connection-description">移除这个连接。不删除 Agent 或它的对话。</p>
          <div className="connection-actions"><button className="connection-secondary" onClick={() => stop()}>取消</button><button className="connection-danger" onClick={() => { const next = records.filter(record => record.id !== selected); setRecords(next); setSelected(next[0]?.id ?? ''); setNotice(''); stop(); }}>确认移除</button></div>
        </>}
      </article>
    </div>
  </section>;
}

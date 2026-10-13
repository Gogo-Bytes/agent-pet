import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/icons.js';
import './connections.css';

type Health = 'online' | 'waiting' | 'error';
type RecordItem = { id: string; name: string; location: string; health: Health; lastState: string | null };
type Step = 'overview' | 'searching' | 'found' | 'location' | 'confirm' | 'checking' | 'rechecking' | 'result' | 'remove';
type Demo = 'normal' | 'empty' | 'missing' | 'waiting' | 'error';
const labels: Record<Health, string> = { online: '连接正常', waiting: '等待 pi 启动', error: '连接需要检查' };
const initial: RecordItem = { id: 'pi-default', name: 'pi', location: '默认配置', health: 'online', lastState: '待命中' };

export function ConnectionsView({ visible, onConfigured }: { visible: boolean; onConfigured: (health: Health | null) => void }) {
  const [records, setRecords] = useState<RecordItem[]>([initial]);
  const [selected, setSelected] = useState(initial.id);
  const [step, setStep] = useState<Step>('overview');
  const [demo, setDemo] = useState<Demo>('normal');
  const [confirmFrom, setConfirmFrom] = useState<'found' | 'location'>('found');
  const [location, setLocation] = useState('默认配置');
  const [notice, setNotice] = useState('');
  const content = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const detail = records.find(record => record.id === selected);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { onConfigured(records[0]?.health ?? null); }, [records, onConfigured]);
  useEffect(() => { if (visible) content.current?.focus({ preventScroll: true }); }, [step, visible]);
  function stop(next: Step = 'overview') { clearTimeout(timer.current); setStep(next); }
  function scan() { stop('searching'); setNotice(''); timer.current = setTimeout(() => setStep('found'), 900); }
  function reset(value: Demo) {
    stop(); setDemo(value); setNotice(''); setLocation('默认配置'); setSelected(initial.id);
    setRecords(value === 'empty' || value === 'missing' ? [] : [{ ...initial, lastState: value === 'normal' ? initial.lastState : null, health: value === 'waiting' ? 'waiting' : value === 'error' ? 'error' : 'online' }]);
  }
  function check(adding: boolean) {
    stop(adding ? 'checking' : 'rechecking'); setNotice('');
    timer.current = setTimeout(() => {
      const health: Health = demo === 'waiting' ? 'waiting' : demo === 'error' ? 'error' : 'online';
      const record = { ...initial, location, health, lastState: null };
      setRecords(current => adding ? [...current.filter(item => item.id !== record.id), record] : current.map(item => item.id === selected ? { ...item, health } : item));
      setSelected(record.id); setStep(adding ? 'result' : 'overview');
      if (!adding) setNotice(health === 'online' ? '检查完成，已收到 pi 的连接信号。' : health === 'waiting' ? '配置已保留，暂未收到启动信号。' : '暂未收到连接信号，请按下方步骤检查。');
    }, 1100);
  }
  const adding = step !== 'overview' && step !== 'remove' && step !== 'rechecking';
  return <section className="connections-page" hidden={!visible} aria-label="Agent 连接管理">
    <div className="connection-demo"><span>原型演示 · 不读取或修改本机</span><select aria-label="连接演示情境" value={demo} onChange={event => reset(event.target.value as Demo)}><option value="normal">已有连接</option><option value="empty">首次添加</option><option value="missing">未找到 Agent</option><option value="waiting">等待启动</option><option value="error">连接异常</option></select></div>
    <header className="connections-heading"><div><h1>连接 Agent</h1><p>接收本机 Agent 的工作状态。</p></div><button className="connection-primary" onClick={scan}><Icon name="plus" />添加 Agent</button></header>
    <div className="connections-layout"><aside className="configured-connection-list" aria-label="已添加的连接"><header><h2>已添加</h2><span>{records.length}</span></header>{records.map(record => <button className="connection-row" key={record.id} aria-pressed={!adding && selected === record.id} onClick={() => { stop(); setSelected(record.id); setNotice(''); }}><span className="provider-logo">π</span><span><strong>{record.name}</strong><small>{record.location}</small></span><i className={`health-dot ${record.health}`} /><span className="sr-only">{labels[record.health]}</span></button>)}{!records.length && <div className="configured-connection-list-empty"><Icon name="link" /><p>还没有连接</p><small>添加后，工作状态会显示在首页。</small></div>}<div className="connection-support"><small>当前支持</small><strong>pi</strong><p>其他 Agent 的接入正在规划中。</p></div></aside>
    <article ref={content} tabIndex={-1} className="connection-content" aria-label="连接操作与详情" aria-live="polite" aria-busy={step === 'searching' || step === 'checking' || step === 'rechecking'}>
      {adding && <header className="connection-flow-heading"><span>添加 Agent <small> / {step === 'confirm' ? '确认接入' : step === 'checking' ? '检查连接' : step === 'result' ? '接入结果' : '查找与选择'}</small></span><button className="connection-icon" aria-label="取消添加" title="取消添加" onClick={() => stop()}><Icon name="close" /></button></header>}
      {step === 'overview' && !detail && <div className="connection-empty"><span className="connection-emblem"><Icon name="link" /></span><h2>添加你的第一个 Agent</h2><p>先查找已安装的程序，再确认接入。<br />我们会带你完成连接检查。</p><button className="connection-primary" onClick={scan}>查找本机 Agent<Icon name="right" /></button><button className="connection-text" onClick={() => setStep('location')}>自己选择位置</button></div>}
      {step === 'overview' && detail && <><div className="connection-detail-title"><span className="provider-logo large">π</span><div><h2>{detail.name}</h2><p>{detail.location}</p></div><span className={`connection-status ${detail.health}`}><i className={`health-dot ${detail.health}`} />{labels[detail.health]}</span></div><div className="connection-facts"><div><span>接入配置</span><strong>已配置</strong></div><div><span>最近收到的状态</span><strong>{detail.lastState ?? '尚未收到工作状态'}</strong></div><div><span>最近通信</span><strong>{detail.health === 'online' ? '刚刚（演示）' : '等待信号'}</strong></div></div>{detail.health !== 'online' && <div className="connection-guidance"><h3>{detail.health === 'waiting' ? '打开 pi 后，连接会自动检查' : '先确认 pi 正在运行'}</h3><p>{detail.health === 'waiting' ? '配置已经完成。还没有启动信号，不代表接入失败。' : '如果 pi 已打开，请在 pi 中重新加载扩展，再检查连接。你的接入配置会保留。'}</p></div>}{notice && <p className="connection-notice" role="status">{notice}</p>}<div className="connection-actions"><button className="connection-secondary" onClick={() => check(false)}><Icon name="replay" />重新检查</button><button className="connection-text" onClick={() => setStep('remove')}>移除连接</button></div><details className="connection-technical"><summary>连接详情</summary><p>接入方式：本地状态扩展</p><p>这里只演示配置与连接状态；真实版本将显示检查结果和可操作的故障原因。</p></details></>}
      {(step === 'searching' || step === 'checking' || step === 'rechecking') && <div className="connection-empty"><span className="connection-spinner" /><h2>{step === 'searching' ? '正在查找 Agent' : '正在检查连接'}</h2><p>{step === 'searching' ? '查找已安装的程序，不会自动更改配置。' : '确认接入配置，并等待 Agent 的连接信号。'}</p><button className="connection-text" onClick={() => stop()}>取消</button></div>}
      {step === 'found' && <><h2>{demo === 'missing' ? '暂时没有找到 Agent' : '找到 pi'}</h2><p className="connection-description">{demo === 'missing' ? '可能安装在其他位置。可以重新查找，或选择你安装 pi 的位置。' : '找到安装程序后，还需要确认配置并检查连接。'}</p>{demo !== 'missing' && <div className="connection-candidate"><span className="provider-logo">π</span><div><strong>pi</strong><small>默认配置 · 已找到安装程序</small></div>{records.length ? <span>已添加</span> : <button className="connection-secondary" onClick={() => { setLocation('默认配置'); setConfirmFrom('found'); setStep('confirm'); }}>选择<Icon name="right" /></button>}</div>}<div className="connection-actions">{records.length > 0 && demo !== 'missing' ? <button className="connection-secondary" onClick={() => stop()}>查看已有连接</button> : <button className="connection-secondary" onClick={scan}>重新查找</button>}<button className="connection-text" onClick={() => setStep('location')}>选择其他位置</button></div></>}
      {step === 'location' && <><h2>选择 pi 的位置</h2><p className="connection-description">正式版会打开系统选择器，帮助你选择安装或配置位置。这里使用演示位置，不读取文件。</p><label className="connection-location">演示位置<select aria-label="演示位置" value={location} onChange={event => setLocation(event.target.value)}><option>默认配置</option><option>自己选择的配置</option></select></label>{records.length ? <p className="connection-guidance">当前原型只演示一个 pi 连接。请先移除已有连接，或切换“首次添加”情境。</p> : <button className="connection-primary" onClick={() => { setConfirmFrom('location'); setStep('confirm'); }}>检查这个位置<Icon name="right" /></button>}<button className="connection-text" onClick={() => setStep('found')}>返回查找结果</button></>}
      {step === 'confirm' && <><h2>确认接入 pi</h2><p className="connection-description">允许 Agent Pet 接收这个 Agent 的工作状态。</p><div className="connection-guidance"><h3>{location}</h3><p>将为这个位置添加状态扩展。不会自动开始任务。</p><p>正式版会在这里列出实际要修改的文件与生效条件，确认后才执行。</p></div><div className="connection-actions"><button className="connection-primary" onClick={() => check(true)}>确认接入<Icon name="right" /></button><button className="connection-text" onClick={() => setStep(confirmFrom)}>返回</button></div></>}
      {step === 'result' && <><span className="connection-emblem"><Icon name={detail?.health === 'online' ? 'check' : 'link'} /></span><h2>{detail?.health === 'online' ? '连接正常' : detail?.health === 'waiting' ? '已配置，等待 pi 启动' : '已配置，连接还需检查'}</h2><p className="connection-description">{detail?.health === 'online' ? '已收到连接信号。开始任务后，这里会收到工作状态。' : detail?.health === 'waiting' ? '打开 pi 后，我们会继续接收连接信号。无需重复添加。' : '接入配置已保留。请确认 pi 正在运行，再重新检查。'}</p><button className="connection-primary" onClick={() => stop()}>查看连接<Icon name="right" /></button></>}
      {step === 'remove' && <><h2>移除 pi 连接？</h2><p className="connection-description">移除后，这个连接将不再显示在 Agent Pet 中。正式版需要明确说明停止接收与扩展撤回的实际结果。</p><div className="connection-actions"><button className="connection-secondary" onClick={() => stop()}>保留连接</button><button className="connection-danger" onClick={() => { setRecords(current => current.filter(item => item.id !== selected)); setNotice(''); stop(); }}>移除演示连接</button></div></>}
    </article></div>
  </section>;
}

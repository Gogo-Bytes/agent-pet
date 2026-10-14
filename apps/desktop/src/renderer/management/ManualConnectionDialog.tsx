import { useEffect, useRef, useState } from 'react';
import type { AgentConfiguration, ConfigurationProvider, ConfigurationsState } from '../../shared/configurations.js';
import type { ManagementBridge } from './management-store.js';
import type { Inspection } from '../../shared/pi-preflight.js';
import { findingText } from '../../shared/pi-preflight.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';
import { providerLabels } from './home-projection.js';

export function ManualConnectionDialog({ existing, records, bridge, onClose, onSaved, run, busy, error }: {
  existing: AgentConfiguration | null; records: AgentConfiguration[]; bridge: ManagementBridge;
  onClose: () => void; onSaved: (id: string) => void; run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>; busy: boolean; error: string;
}) {
  const [step, setStep] = useState(0);
  const [path, setPath] = useState(existing?.targetPath ?? '');
  const [approved, setApproved] = useState(false);
  const [provider, setProvider] = useState<ConfigurationProvider | ''>(existing?.provider ?? '');
  const [name, setName] = useState(existing?.name ?? '个人配置');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState('');
  const generation = useRef(0);
  const savedId = useRef(existing?.id ?? '');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  const duplicate = records.some(record => record.id !== existing?.id && record.provider === provider && record.targetPath === path);
  const ready = approved && !!provider && !duplicate && (provider !== 'pi' || !!inspection);
  async function choose() {
    const request = ++generation.current; setLocalError('');
    try { const chosen = await bridge.locations.choose(); if (request !== generation.current || !chosen) return; setPath(chosen); setApproved(true); setInspection(null); }
    catch { if (request === generation.current) setLocalError('无法打开选择器，请重试。'); }
  }
  async function validate() {
    const request = ++generation.current; setChecking(true); setLocalError('');
    try {
      const selected = approved ? path : await bridge.locations.authorize(path);
      if (request !== generation.current || !selected) return;
      setPath(selected); setApproved(true); setStep(1);
      if (provider) {
        const result = await bridge.locations.inspect(selected, provider);
        if (request === generation.current) setInspection(result);
      }
    } catch { if (request === generation.current) setLocalError('无法检查此位置。请检查权限，或返回选择其他位置。'); }
    finally { if (request === generation.current) setChecking(false); }
  }
  const labels = ['选择位置', '验证配置', '命名与确认'];
  return <Dialog label={existing ? '更换配置位置' : '手动添加'} className="cfg-page cfg-dialog" onClose={onClose}>
    <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="folder" /></span><h2>{existing ? '更换配置位置' : '手动添加'}</h2></div><button className="cfg-dialog-close" aria-label="关闭手动配置" onClick={onClose}><Icon name="close" /></button></header>
      <ol className="cfg-dialog-steps" aria-label="配置步骤">{labels.map((label, index) => <li key={label} className={index === step ? 'is-current' : index < step ? 'is-finished' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
      <section className="cfg-dialog-body"><h3 ref={heading} tabIndex={-1}>{step === 0 ? '选择你的配置位置' : step === 1 ? '确认配置可用' : labels[step]}</h3>
        {step === 0 && <><label className="cfg-path-label" htmlFor="manual-path">配置文件夹</label><div className="cfg-path-input"><Icon name="folder" /><input id="manual-path" value={path} placeholder="选择位置，或粘贴完整路径" onChange={event => { generation.current++; setChecking(false); setPath(event.target.value); setApproved(false); setInspection(null); }} /><button className="co-secondary" disabled={checking} onClick={() => void choose()}>选择位置</button></div>
          <details className="cfg-location-help"><summary>这个位置怎么选？<Icon name="down" /></summary><div><p>选择 Agent 的配置目录，不是程序或 sessions 目录。例如 pi 的 agentDir；项目配置请选择对应位置。</p><p>验证只读检查所选位置，不写文件或启动 Agent。粘贴路径还需在系统确认窗中允许检查。</p></div></details></>}
        {step === 1 && <><p className="cfg-dialog-path">{path}</p>
          <label className="cfg-path-label" htmlFor="manual-provider">Agent 类型</label><select id="manual-provider" value={provider} disabled={!!existing || checking} onChange={event => { setProvider(event.target.value as ConfigurationProvider); setInspection(null); }}><option value="">选择 Agent 类型</option>{Object.entries(providerLabels).map(([id, label]) => <option key={id} value={id}>{label}{id !== 'pi' ? '（接入尚未支持）' : ''}</option>)}</select>
          {checking ? <p role="status">正在识别并验证…</p> : duplicate ? <p role="alert">这个配置已添加，请返回选择其他位置。</p> : !provider ? <p>未能可靠识别类型，请选择 Agent 类型再验证。</p> : provider !== 'pi' ? <p role="status">此类型接入尚未支持。可以保存位置与名称，但无法接收 Agent 状态。</p> : inspection ? <div className="cfg-dialog-check"><strong>pi</strong><div>{inspection.findings.length ? inspection.findings.map(finding => <p key={finding}>{findingText[finding]}</p>) : <p>配置位置可用。是否在线需要完成接入并收到通信证据。</p>}<p>有问题的位置也可以保存，修正后刷新检查。</p></div></div> : <p>已选择 pi。点击重新检查验证配置位置。</p>}
          <button className="co-secondary" disabled={checking || !provider} onClick={() => void validate()}>重新检查</button>
        </>}
        {step === 2 && <><dl className="cfg-dialog-summary"><div><dt>Agent 类型</dt><dd>{provider && providerLabels[provider]}</dd></div><div><dt>配置位置</dt><dd>{path}</dd></div></dl><div className="cfg-name-field"><label htmlFor="manual-name">配置名称</label><input id="manual-name" maxLength={40} value={name} onChange={event => setName(event.target.value)} /><p>{name.trim() ? '用于区分不同安装或项目，之后也可以修改。' : '请输入配置名称，最多 40 个字。'}</p></div></>}
        {(localError || error) && <p role="alert">{localError || error}</p>}
      </section>
      <footer className="cfg-dialog-footer"><div>{step > 0 && <button className="co-secondary" disabled={busy || checking} onClick={() => { generation.current++; setChecking(false); setStep(value => value - 1); }}>上一步</button>}
        <button className="co-primary" disabled={busy || checking || (step === 0 ? !path.trim() : step === 1 ? !ready : !ready || !name.trim())} onClick={() => {
          if (step === 0) void validate(); else if (step === 1) setStep(2); else void run(async () => {
            if (existing) { const result = await bridge.configurations.changeTarget(existing.id, path); if (result.notice !== 'none') return result; return bridge.configurations.rename(existing.id, name); }
            const result = await bridge.configurations.create({ name, provider: provider as ConfigurationProvider, targetPath: path });
            savedId.current = result.records.find(record => record.provider === provider && record.targetPath === path)?.id ?? '';
            return result;
          }).then(saved => { if (saved) onSaved(savedId.current); });
        }}>{step === 0 ? '验证配置' : step === 1 ? '下一步' : existing ? '保存配置' : '添加配置'}<Icon name={step === 2 ? 'check' : 'right'} /></button>
      </div></footer>
    </div>
  </Dialog>;
}

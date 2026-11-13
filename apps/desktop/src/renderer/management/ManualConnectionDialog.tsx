import { useEffect, useRef, useState } from 'react';
import type { AgentConfiguration, ConfigurationProvider, ConfigurationsState } from '../../shared/configurations.js';
import type { ManagementBridge } from './management-store.js';
import type { Inspection } from '../../shared/pi-preflight.js';
import { findingSummary } from './connection-copy.js';
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
      // Whitespace before the leading slash cannot belong to an absolute path.
      // Keep trailing spaces: they can be part of a real folder name.
      const candidate = path.trimStart();
      if (!candidate.startsWith('/')) { setLocalError('请输入以 / 开头的完整路径，或点击「选择位置」。'); return; }
      const selected = approved ? path : await bridge.locations.authorize(candidate);
      if (request !== generation.current || !selected) return;
      setPath(selected); setApproved(true); setStep(1);
      if (provider === 'pi') {
        const result = await bridge.locations.inspect(selected, provider);
        if (request === generation.current) setInspection(result);
      }
    } catch { if (request === generation.current) setLocalError('无法检查此位置。请检查权限，或返回选择其他位置。'); }
    finally { if (request === generation.current) setChecking(false); }
  }
  const labels = ['选择配置文件夹', '选择 Agent', '命名连接'];
  return <Dialog label={existing ? '更换配置位置' : '手动添加'} className="cfg-page cfg-dialog" onClose={onClose}>
    <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="folder" /></span><h2 id="manual-step-title" ref={heading} tabIndex={-1}>{labels[step]}</h2></div><button className="cfg-dialog-close" aria-label="关闭手动配置" onClick={onClose}><Icon name="close" /></button></header>
      <section className="cfg-dialog-body">
        {step === 0 && <><div className="cfg-path-input"><Icon name="folder" /><input id="manual-path" aria-labelledby="manual-step-title" value={path} placeholder="选择位置，或粘贴完整路径" onChange={event => { generation.current++; setChecking(false); setPath(event.target.value); setApproved(false); setInspection(null); }} /><button className="co-secondary" disabled={checking} onClick={() => void choose()}>选择位置</button></div>
          <details className="cfg-location-help"><summary>这个位置怎么选？<Icon name="down" /></summary><div><dl className="cfg-dialog-summary"><div><dt>pi</dt><dd><code>~/.pi/agent</code></dd></div><div><dt>Claude Code</dt><dd><code>~/.claude</code> 或项目的 <code>.claude</code>（仅对此项目生效）</dd></div><div><dt>Codex</dt><dd><code>~/.codex</code> 或 CODEX_HOME，不支持项目的 <code>.codex</code></dd></div></dl><p>选择设置文件夹，而非程序或会话记录。读取前需在系统弹窗中允许访问。</p></div></details></>}
        {step === 1 && <><p className="cfg-dialog-path">{path}</p>
          <select id="manual-provider" aria-labelledby="manual-step-title" value={provider} disabled={!!existing || checking} onChange={event => { setProvider(event.target.value as ConfigurationProvider); setInspection(null); }}><option value="">选择 Agent 类型</option>{Object.entries(providerLabels).map(([id, label]) => <option key={id} value={id}>{label}{!['pi', 'claude', 'codex'].includes(id) ? '（暂不支持）' : ''}</option>)}</select>
          {checking ? <p role="status">正在识别并验证…</p> : duplicate ? <p role="alert">这个配置已添加，请返回选择其他位置。</p> : !provider ? null : provider === 'codex' ? <p role="status">使用 ~/.codex 或 CODEX_HOME，不支持项目的 .codex。</p> : provider === 'claude' ? <p role="status">使用 ~/.claude；项目内的 .claude 仅对此项目生效。</p> : provider !== 'pi' ? <p role="status">这类 Agent 暂时还不能连接。你可以先保存名称和位置。</p> : inspection ? <div className="cfg-dialog-check"><div>{inspection.findings.length ? <>{inspection.findings.map(finding => <p key={finding}>{findingSummary[finding]}</p>)}<details><summary>查看检查详情</summary>{inspection.findings.map(finding => <p key={finding}>{findingText[finding]}</p>)}</details></> : <p>这个文件夹可以使用。添加后，还需要完成连接设置。</p>}</div></div> : null}
          {provider !== 'claude' && provider !== 'codex' && <button className="co-secondary" disabled={checking || !provider} onClick={() => void validate()}>{inspection ? '重新检查' : '检查位置'}</button>}
        </>}
        {step === 2 && <><dl className="cfg-dialog-summary"><div><dt>Agent 类型</dt><dd>{provider && providerLabels[provider]}</dd></div><div><dt>配置位置</dt><dd>{path}</dd></div></dl><div className="cfg-name-field"><label htmlFor="manual-name">配置名称</label><input id="manual-name" maxLength={40} value={name} onChange={event => setName(event.target.value)} />{!name.trim() && <p>请输入配置名称，最多 40 个字。</p>}</div></>}
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
        }}>{step < 2 ? '下一步' : existing ? '保存' : '添加连接'}<Icon name={step === 2 ? 'check' : 'right'} /></button>
      </div></footer>
    </div>
  </Dialog>;
}

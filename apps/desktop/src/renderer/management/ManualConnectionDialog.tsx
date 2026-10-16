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
  const labels = ['选择位置', '验证配置', '命名与确认'];
  return <Dialog label={existing ? '更换配置位置' : '手动添加'} className="cfg-page cfg-dialog" onClose={onClose}>
    <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="folder" /></span><h2>{existing ? '更换配置位置' : '手动添加'}</h2></div><button className="cfg-dialog-close" aria-label="关闭手动配置" onClick={onClose}><Icon name="close" /></button></header>
      <ol className="cfg-dialog-steps" aria-label="配置步骤">{labels.map((label, index) => <li key={label} className={index === step ? 'is-current' : index < step ? 'is-finished' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
      <section className="cfg-dialog-body"><h3 ref={heading} tabIndex={-1}>{step === 0 ? '选择你的配置位置' : step === 1 ? provider === 'claude' ? '确认 Agent 类型' : '确认配置可用' : labels[step]}</h3>
        {step === 0 && <><label className="cfg-path-label" htmlFor="manual-path">配置文件夹</label><div className="cfg-path-input"><Icon name="folder" /><input id="manual-path" value={path} placeholder="选择位置，或粘贴完整路径" onChange={event => { generation.current++; setChecking(false); setPath(event.target.value); setApproved(false); setInspection(null); }} /><button className="co-secondary" disabled={checking} onClick={() => void choose()}>选择位置</button></div>
          <details className="cfg-location-help"><summary>这个位置怎么选？<Icon name="down" /></summary><div><p>选择 Agent 存放设置的文件夹，不要选择程序文件或会话记录。pi 通常使用 ~/.pi/agent。Claude Code 通常选择 ~/.claude；选择项目内的 .claude 时，仅对该项目生效。</p><p>pi 会检查文件夹；Claude Code 添加后再选择程序、检查 settings.json 并查看连接预览。这一步不改动文件，不改变 Claude 的环境，也不会启动 Agent。粘贴路径后，还需要在系统弹窗中允许访问。</p></div></details></>}
        {step === 1 && <><p className="cfg-dialog-path">{path}</p>
          <label className="cfg-path-label" htmlFor="manual-provider">Agent 类型</label><select id="manual-provider" value={provider} disabled={!!existing || checking} onChange={event => { setProvider(event.target.value as ConfigurationProvider); setInspection(null); }}><option value="">选择 Agent 类型</option>{Object.entries(providerLabels).map(([id, label]) => <option key={id} value={id}>{label}{id === 'claude' ? '（支持 CLI 连接）' : id !== 'pi' ? '（暂不支持连接）' : ''}</option>)}</select>
          {checking ? <p role="status">正在识别并验证…</p> : duplicate ? <p role="alert">这个配置已添加，请返回选择其他位置。</p> : !provider ? <p>请选择你使用的 Agent，再检查一次。</p> : provider === 'claude' ? <p role="status">支持 CLI 连接。请选择实际使用的配置文件夹：通常为 ~/.claude，项目内的 .claude 仅对该项目生效。添加后再选择 Claude Code 程序，检查此文件夹的 settings.json 并预览要追加的连接 hook；现在不读取或改动设置。</p> : provider !== 'pi' ? <p role="status">这类 Agent 暂时还不能连接。你可以先保存名称和位置。</p> : inspection ? <div className="cfg-dialog-check"><strong>pi</strong><div>{inspection.findings.length ? <>{inspection.findings.map(finding => <p key={finding}>{findingSummary[finding]}</p>)}<details><summary>查看检查详情</summary>{inspection.findings.map(finding => <p key={finding}>{findingText[finding]}</p>)}</details></> : <p>这个文件夹可以使用。添加后，还需要完成连接设置。</p>}<p>文件夹有问题时也可以先保存，之后再处理。</p></div></div> : <p>已选择 pi。点击重新检查验证配置位置。</p>}
          {provider !== 'claude' && <button className="co-secondary" disabled={checking || !provider} onClick={() => void validate()}>重新检查</button>}
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

import { useEffect, useRef, useState } from 'react';
import type { AgentConfiguration, ConfigurationsState } from '../../shared/configurations.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
import { findingText } from '../../shared/pi-preflight.js';
import type { ManagementBridge } from './management-store.js';
import { Icon, type IconName } from './components/icons.js';
import { GlassButton } from './components/glass.js';
import { ManualConnectionDialog } from './ManualConnectionDialog.js';
import { DeploymentControls } from './DeploymentControls.js';
import { providerLabels } from './home-projection.js';
import './connections.css';
const marks: Record<AgentConfiguration['provider'], IconName> = { pi: 'pi', codex: 'command', claude: 'flower', opencode: 'code', gemini: 'sparkles', cursor: 'diagonal' };
export function AgentMark({ record }: { record: Pick<AgentConfiguration, 'provider'> }) { return <span className={`menu-agent-mark agent-${record.provider}`} aria-hidden="true"><Icon name={marks[record.provider]} /></span>; }
const labels = { available: '配置可用', unchecked: '尚未检查', attention: '需要处理', unsupported: '接入尚未支持' };

function Identity({ record, onRename, busy }: { record: AgentConfiguration; onRename: (name: string) => Promise<boolean>; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(record.name);
  const trigger = useRef<HTMLButtonElement>(null);
  function cancel() { setEditing(false); requestAnimationFrame(() => trigger.current?.focus()); }
  return <div className={`cfg-identity ${editing ? 'is-editing' : ''} ${record.name.length > 18 ? 'is-long' : ''}`}><AgentMark record={record} /><div className="cfg-identity-name"><span className="cfg-type">{providerLabels[record.provider]}</span>
    {editing ? <form className="cfg-inline-name" onSubmit={event => { event.preventDefault(); if (name.trim()) void onRename(name).then(saved => { if (saved) cancel(); }); }}>
      <label className="cfg-sr-only" htmlFor="config-name">配置名称</label><input autoFocus id="config-name" maxLength={40} value={name} aria-invalid={!name.trim()} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancel(); } }} />
      {!name.trim() && <p className="cfg-rename-error">请输入配置名称，最多 40 个字。</p>}<div className="cfg-inline-actions"><button className="cfg-name-save" disabled={busy || !name.trim()}>保存</button><button type="button" className="cfg-name-cancel" onClick={cancel}>取消</button></div>
    </form> : <h2 tabIndex={-1}>{record.name}</h2>}</div><button ref={trigger} className="cfg-icon-button" aria-label="重命名" disabled={busy} onClick={() => { setName(record.name); setEditing(true); }}><Icon name="edit" /></button></div>;
}

export function ConnectionsView({ visible, state, bridge, run, busy, error }: {
  visible: boolean; state: ConfigurationsState | null; bridge: ManagementBridge;
  run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>; busy: boolean; error: string;
}) {
  const [page, setPage] = useState<'library' | 'agent' | 'discover' | 'remove'>('library');
  const [selected, setSelected] = useState<string | null>(null);
  const [manual, setManual] = useState<AgentConfiguration | null | undefined>(undefined);
  const [scan, setScan] = useState<PreflightState | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const generation = useRef(0);
  const main = useRef<HTMLElement>(null);
  const records = state?.records ?? [];
  const current = records.find(record => record.id === selected) ?? (page === 'library' ? records[0] : undefined);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (!visible) setManual(undefined); }, [visible]);
  useEffect(() => { if (visible) main.current?.querySelector<HTMLElement>('h1,h2')?.focus({ preventScroll: true }); }, [page, visible]);
  async function detect() {
    const request = ++generation.current; setScanning(true); setScanError(''); setPage('discover');
    try { const value = await bridge.piPreflight.detect(); if (request === generation.current) { setScan(value); if (value.notice === 'failed') setScanError('扫描未完成，请重试或手动选择。'); } }
    catch { if (request === generation.current) setScanError('扫描失败，请重试或手动选择配置位置。'); }
    finally { if (request === generation.current) setScanning(false); }
  }
  function cancelScan() { generation.current++; setScanning(false); setPage('library'); }
  const browsing = page === 'library' || page === 'agent';
  return <section hidden={!visible} className="cfg-page co-embedded" aria-label="Agent 配置管理" data-page={page}>
    <article ref={main} className="cfg-menu">
      {browsing ? <>
        <header className="cfg-library-head"><div><h1 tabIndex={-1}>我的连接 <span>{records.length.toString().padStart(2, '0')}</span></h1><p>选择一个配置，查看或修改。</p></div><div className="cfg-add-actions"><button className="cfg-scan-button" disabled={busy} onClick={() => void detect()}><Icon name="scan" />自动扫描</button><GlassButton className="cfg-manual-button" aria-label="手动添加" disabled={busy} onClick={() => setManual(null)}><Icon name="plus" size={23} /></GlassButton></div></header>
        <div className="cfg-library-body"><nav className="cfg-index" aria-label="已添加配置"><span className="cfg-index-label">已添加配置</span>{records.map(record => <button key={record.id} data-config={record.id} aria-label={`${record.name} ${providerLabels[record.provider]}，${labels[record.availability]}`} aria-pressed={current?.id === record.id} onClick={() => { setSelected(record.id); setPage('agent'); }}><AgentMark record={record} /><span><strong>{record.name}</strong><small>{providerLabels[record.provider]}</small></span>{record.availability !== 'available' && <span className={`cfg-index-state ${record.availability === 'unchecked' ? 'cfg-unchecked' : ''}`}>{record.availability === 'unchecked' ? '未检查' : record.availability === 'unsupported' ? '未支持' : '需处理'}</span>}</button>)}</nav>
          <div className="cfg-content-scroll">{current ? <section className="cfg-detail" key={current.id}><button className="cfg-text-button cfg-mobile-back" onClick={() => setPage('library')}><Icon name="left" />我的连接</button><div className="cfg-detail-panel">
            <Identity record={current} busy={busy} onRename={name => run(() => bridge.configurations.rename(current.id, name))} />
            <div className={`cfg-check ${current.availability === 'available' ? 'cfg-usable' : 'cfg-unchecked'}`} aria-busy={busy}><div className="cfg-check-heading"><div><span className="cfg-section-label">配置检查</span><strong>{busy ? '检查中…' : labels[current.availability]}</strong></div><button className="cfg-refresh-button" disabled={busy || current.provider !== 'pi'} onClick={() => void run(() => bridge.configurations.inspect(current.id))}><Icon name="replay" /><span>刷新检查</span></button></div>
              {current.inspection?.findings.length ? current.inspection.findings.map(finding => <p key={finding}>{findingText[finding]}</p>) : <p>{current.availability === 'available' ? '位置可读取，配置检查未发现阻碍。' : current.availability === 'unsupported' ? '配置已保存，此类型接入尚未支持。' : '刷新检查此配置位置；检查通过不表示通信在线。'}</p>}</div>
            <div className="cfg-location"><span className="cfg-section-label">配置位置</span><button className="cfg-location-control" aria-label="更换位置" disabled={busy} onClick={() => setManual(current)}><span className="cfg-folder-emblem"><Icon name="folder" size={23} /></span><code>{current.targetPath}</code><span className="cfg-location-action"><span>更换位置</span><Icon name="right" /></span></button>
              {(current.connection?.deployedPath || current.id === 'legacy-pi') && <p className="cfg-notice">此位置有已保存的部署关系。更换前需选择性撤回并移除，再添加新位置。</p>}
              <DeploymentControls record={current} api={bridge.configurations} run={run} busy={busy} /></div>
          </div><div className="cfg-detail-end"><div><strong>移除配置</strong><span>Agent 程序和用户文件都会保留</span></div><button className="cfg-delete" disabled={busy} aria-label="移除配置" onClick={() => { setSelected(current.id); setPage('remove'); }}><Icon name="trash" />移除</button></div></section> : <div className="cfg-empty"><Icon name="folder" /><h2 tabIndex={-1}>从第一个连接开始</h2><p>{state ? '自动扫描本机，或选择已有配置位置。' : '正在读取连接配置…'}</p></div>}
            {error && <p className="cfg-notice" role="alert">{error}</p>}
          </div></div>
      </> : <>
        <header className="cfg-subpage-head"><button className="cfg-text-button" onClick={() => page === 'discover' ? cancelScan() : setPage('agent')}><Icon name="left" />{page === 'remove' ? '配置详情' : '我的连接'}</button><span>{page === 'discover' ? '自动扫描' : '移除配置'}</span></header>
        <div className="cfg-content-scroll">{page === 'discover' ? <section className="cfg-discovery"><div className="cfg-discovery-heading"><div><h1 tabIndex={-1}>自动扫描</h1><p>{scanning ? '正在查找支持的 pi 安装…' : scan ? `找到 ${scan.installations.length} 个安装。选择配置位置继续。` : '查找本机支持的 Agent。'}</p></div><button className="cfg-secondary" disabled={scanning} onClick={() => void detect()}><Icon name="replay" />重新扫描</button></div>
          {scanning ? <div className="cfg-scan-stage" role="status"><div className="cfg-scan-art"><Icon name="scan" /></div><strong>正在查找安装</strong><p>只查找当前支持的 pi，不扫描会话或对话。</p><button className="cfg-secondary" onClick={cancelScan}>取消扫描</button></div> : <>
            <div className="cfg-results">{scan?.installations.map(installation => <div className="cfg-result" key={installation.id}><AgentMark record={{ provider: 'pi' }} /><div><strong>pi <span>{installation.version ?? '版本未确认'}</span></strong><code>{installation.path}</code><small>{installation.compatibility === 'unverified' ? '此版本兼容性尚未验证' : '已验证版本'}</small></div><button className="cfg-secondary" onClick={() => setManual(null)}>选择配置位置<Icon name="plus" /></button></div>)}</div>
            {!scan?.installations.length && <div className="cfg-empty"><Icon name="scan" /><h2>未找到安装</h2><p>可以手动选择已有配置位置。</p></div>}
            <p className="cfg-notice">扫描结果是安装候选，尚未读取配置或建立连接。项目配置请手动选择对应目录。</p><button className="cfg-text-button" onClick={() => setManual(null)}><Icon name="folder" />手动添加<Icon name="right" /></button>{scanError && <p role="alert">{scanError}</p>}
          </>}
        </section> : current ? <section className="cfg-form-page cfg-removal"><span className="cfg-form-sign"><Icon name="trash" /></span><h1 tabIndex={-1}>移除配置</h1><p className="cfg-form-intro">只处理 Agent Pet 中的这条配置。Agent 程序和用户文件都会保留。</p><div className="cfg-form-target"><AgentMark record={current} /><div><strong>{current.name}</strong><code>{current.targetPath}</code></div></div>
          {current.connection?.deployedPath && <p>会先停用接收并保存停用状态，再仅移除仍匹配本应用所有权、身份与内容的扩展。用户修改或未知文件保留，未完成撤回会保留配置供处理。运行中的扩展不会因此卸载，请自行安全重载或关闭 pi。</p>}
          <div className="cfg-form-actions"><button className="cfg-secondary" disabled={busy} onClick={() => setPage('agent')}>取消</button><button className="cfg-primary cfg-danger" disabled={busy} onClick={() => void run(() => bridge.configurations.remove(current.id)).then(removed => { if (removed) { setSelected(null); setPage('library'); } })}>确认移除<Icon name="trash" /></button></div>{error && <p role="alert">{error}</p>}
        </section> : <div className="cfg-empty"><h2>配置未找到</h2><button onClick={() => setPage('library')}>返回列表</button></div>}</div>
      </>}
    </article>
    {manual !== undefined && visible && <ManualConnectionDialog existing={manual} records={records} bridge={bridge} run={run} busy={busy} error={error} onClose={() => setManual(undefined)} onSaved={id => { setManual(undefined); setSelected(id || null); setPage('agent'); }} />}
  </section>;
}

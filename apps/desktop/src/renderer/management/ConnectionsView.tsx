import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsState } from '../../shared/configurations.js';
import type { ClaudeDiscoveryState } from '../../shared/claude-discovery.js';
import { DetectedClaudeResult } from './DetectedClaudeResult.js';
import type { PreflightState } from '../../shared/pi-preflight.js';
import { findingText } from '../../shared/pi-preflight.js';
import { connectionSummary, findingSummary } from './connection-copy.js';
import type { ManagementBridge } from './management-store.js';
import { Icon, type IconName } from './components/icons.js';
import { GlassButton } from '../shared/ui/Glass.js';
import { ManualConnectionDialog } from './ManualConnectionDialog.js';
import { DeploymentControls } from './DeploymentControls.js';
import { ClaudeConnectionControls, claudeConnectionSummary } from './ClaudeConnectionControls.js';
import { DetectedSetupDialog } from './DetectedSetupDialog.js';
import { RemoveConnectionDialog } from './RemoveConnectionDialog.js';
import { TextField } from './components/TextField.js';
import { providerLabels } from './home-projection.js';
import './connections.css';
const marks: Record<AgentConfiguration['provider'], IconName> = { pi: 'pi', codex: 'command', claude: 'flower', opencode: 'code', gemini: 'sparkles', cursor: 'diagonal' };
export function AgentMark({ record }: { record: Pick<AgentConfiguration, 'provider'> }) { return <span className={`menu-agent-mark agent-${record.provider}`} aria-hidden="true"><Icon name={marks[record.provider]} /></span>; }
const labels = { available: '位置可用', unchecked: '未检查', attention: '需要处理', unsupported: '暂不支持' };

/** The configuration owns the action; expanding installations never moves that action. */
function DetectedPiResult({ path, installations, existing, busy, onSelect }: {
  path: string; installations: PreflightState['installations']; existing: boolean; busy: boolean; onSelect: () => void;
}) {
  return <article className="cfg-detected" aria-label="pi 默认配置">
    <div className="cfg-detected-header">
      <AgentMark record={{ provider: 'pi' }} />
      <div className="cfg-detected-identity"><h2>pi 默认配置</h2><code>{path}</code></div>
      <button className="cfg-primary" disabled={busy} onClick={onSelect}>{existing ? '查看配置' : '一键配置'}<Icon name={existing ? 'right' : 'plus'} /></button>
    </div>
    <details className="cfg-installations">
      <summary><span>程序安装详情</span><span className="cfg-installation-count">{installations.length} 处安装 · 共用此配置</span><Icon name="down" /></summary>
      <ul aria-label="检测到的程序安装">{installations.map(installation => <li key={installation.id}><span className="cfg-installation-version">pi {installation.version}</span><code>{installation.path}</code></li>)}</ul>
    </details>
  </article>;
}

function Identity({ record, onRename, busy, statusRef }: { record: AgentConfiguration; onRename: (name: string) => Promise<boolean>; busy: boolean; statusRef: RefObject<HTMLHeadingElement | null> }) {
  const [editing, setEditing] = useState(false);
  const summary = record.provider === 'claude' ? claudeConnectionSummary(record.claude) : connectionSummary(record.connection);
  const [name, setName] = useState(record.name);
  const trigger = useRef<HTMLButtonElement>(null);
  function cancel() { setEditing(false); requestAnimationFrame(() => trigger.current?.focus()); }
  return <div className={`cfg-identity ${editing ? 'is-editing' : ''} ${record.name.length > 18 ? 'is-long' : ''}`}>
    <AgentMark record={record} /><div className="cfg-identity-name"><h2 tabIndex={-1}>{editing ? '修改名称' : record.name}</h2></div>
    <button ref={trigger} hidden={editing} className="cfg-icon-button" aria-label="重命名" disabled={busy} onClick={() => { setName(record.name); setEditing(true); }}><Icon name="edit" /></button>
    <div className="cfg-identity-meta"><span className="cfg-type">{providerLabels[record.provider]}</span><h3 ref={statusRef} tabIndex={-1} className={`cfg-status-badge cfg-connection-${summary.tone}`}><span className="cfg-status-dot" aria-hidden="true" />{summary.title}</h3></div>
    {editing && <form className="cfg-inline-name" onSubmit={event => { event.preventDefault(); if (name.trim() && !busy) void onRename(name).then(saved => { if (saved) cancel(); }); }}>
      <TextField autoFocus id="config-name" label="配置名称" maxLength={40} value={name} error={!name.trim() ? '请输入名称，最多 40 个字。' : undefined} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); cancel(); } }} />
      <div className="cfg-inline-actions"><button type="button" className="cfg-name-cancel" onClick={cancel}>取消</button><button className="cfg-name-save" disabled={busy || !name.trim()}>保存</button></div>
    </form>}
  </div>;
}

export function ConnectionsView({ visible, state, bridge, run, busy, error }: {
  visible: boolean; state: ConfigurationsState | null; bridge: ManagementBridge;
  run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>; busy: boolean; error: string;
}) {
  const [page, setPage] = useState<'library' | 'agent' | 'discover'>('library');
  const [removalId, setRemovalId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [manual, setManual] = useState<AgentConfiguration | null | undefined>(undefined);
  const [scan, setScan] = useState<PreflightState | null>(null);
  const [claudeScan, setClaudeScan] = useState<ClaudeDiscoveryState | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [setupConsent, setSetupConsent] = useState<{ installationId: string; targetPath: string; provider?: 'pi' | 'claude' } | null>(null);
  const generation = useRef(0);
  const claudeScanRequest = useRef<string | null>(null);
  const main = useRef<HTMLElement>(null);
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);
  const removedFocus = useRef(false);
  const records = state?.records ?? [];
  const detected = scan?.installations.filter(value => value.compatibility === 'verified-0.85.1') ?? [];
  const automatic = detected.length ? scan?.automaticTarget : undefined;
  const existingDetected = automatic ? records.find(record => record.provider === 'pi' && record.targetPath === automatic.path) : undefined;
  const existingClaude = claudeScan ? records.find(record => record.provider === 'claude' && record.targetPath === claudeScan.targetPath) : undefined;
  const removing = records.find(record => record.id === removalId);
  const current = records.find(record => record.id === selected) ?? (page === 'library' ? records[0] : undefined);
  useEffect(() => () => { generation.current++; cancelClaudeScan(); }, []);
  useEffect(() => { if (!visible) { setManual(undefined); setSetupConsent(null); setRemovalId(null); } }, [visible]);
  useEffect(() => { if (visible) main.current?.querySelector<HTMLElement>('h1,h2')?.focus({ preventScroll: true }); }, [page, visible]);
  useEffect(() => {
    if (!visible || !removedFocus.current) return;
    const frame = requestAnimationFrame(() => { main.current?.querySelector<HTMLElement>('h1,h2')?.focus({ preventScroll: true }); removedFocus.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [removalId, visible]);
  async function detect() {
    cancelClaudeScan(); const scanId = crypto.randomUUID(); claudeScanRequest.current = scanId;
    const request = ++generation.current; setScanning(true); setScanError(''); setPage('discover');
    try {
      const results = await Promise.allSettled([bridge.piPreflight.detect(), bridge.configurations.detectClaude(scanId)]);
      if (request !== generation.current) return;
      const [pi, claude] = results;
      setScan(pi.status === 'fulfilled' ? pi.value : null);
      setClaudeScan(claude.status === 'fulfilled' ? claude.value : null);
      if (results.some(value => value.status === 'rejected' || ['failed', 'busy'].includes(value.value.notice))) setScanError('部分扫描未完成，可以重试或手动添加。');
    }
    catch { if (request === generation.current) setScanError('扫描失败，请重试或手动选择配置位置。'); }
    finally { if (request === generation.current) setScanning(false); if (claudeScanRequest.current === scanId) claudeScanRequest.current = null; }
  }
  function cancelClaudeScan() {
    const id = claudeScanRequest.current; claudeScanRequest.current = null;
    if (id) void bridge.configurations.cancelClaudeScan(id).catch(() => setScanError('取消扫描未确认，可以重新扫描。'));
  }
  function cancelScan() { cancelClaudeScan(); generation.current++; setScanning(false); setPage('library'); }
  async function prepareDetected() {
    if (!detected[0] || busy || !state) return;
    if (automatic) setSetupConsent({ installationId: detected[0].id, targetPath: automatic.path });
  }
  const browsing = page === 'library' || page === 'agent';
  return <section hidden={!visible} className="cfg-page co-embedded" aria-label="Agent 配置管理" data-page={page}>
    <article ref={main} className="cfg-menu">
      {browsing ? <>
        <header className="cfg-library-head"><div><h1 tabIndex={-1}>我的连接 <span>{records.length.toString().padStart(2, '0')}</span></h1><p>添加或管理你的 Agent。</p></div><div className="cfg-add-actions"><button className="cfg-scan-button" disabled={busy} onClick={() => void detect()}><Icon name="scan" />自动扫描</button><GlassButton className="cfg-manual-button" aria-label="手动添加" disabled={busy} onClick={() => setManual(null)}><Icon name="plus" size={23} /></GlassButton></div></header>
        <div className="cfg-library-body"><nav className="cfg-index" aria-label="已添加连接"><span className="cfg-index-label">已添加</span>{records.map(record => <button key={record.id} data-config={record.id} aria-label={`${record.name} ${providerLabels[record.provider]}，${labels[record.availability]}`} aria-pressed={current?.id === record.id} onClick={() => { setSelected(record.id); setPage('agent'); }}><AgentMark record={record} /><span><strong>{record.name}</strong><small>{providerLabels[record.provider]}</small></span>{['attention', 'unsupported'].includes(record.availability) && <span className={`cfg-index-state ${record.availability === 'unchecked' ? 'cfg-unchecked' : ''}`}>{record.availability === 'unsupported' ? '未支持' : '需处理'}</span>}</button>)}</nav>
          <div className="cfg-content-scroll">{current ? <section className="cfg-detail" key={current.id}><button className="cfg-text-button cfg-mobile-back" onClick={() => setPage('library')}><Icon name="left" />我的连接</button>
            <Identity record={current} statusRef={statusHeadingRef} busy={busy} onRename={name => run(() => bridge.configurations.rename(current.id, name))} />
            <section className="cfg-receiving" aria-label="连接状态">{current.provider === 'claude' ? <ClaudeConnectionControls statusHeadingRef={statusHeadingRef} visible={visible} record={current} api={bridge.configurations} run={run} busy={busy} error={error} /> : <DeploymentControls statusHeadingRef={statusHeadingRef} visible={visible} record={current} api={bridge.configurations} run={run} busy={busy} />}</section>
            <section className="cfg-location" aria-label="配置位置"><span className="cfg-section-label">配置文件夹</span><div className="cfg-location-path"><span className="cfg-folder-emblem"><Icon name="folder" size={20} /></span><code id="config-target-path" title={current.targetPath}>{current.targetPath}</code></div></section>
            <details className="cfg-more-options" open={current.availability === 'attention' || current.connection?.status === 'failed' || current.claude?.status === 'failed'}>
              <summary>更多操作<Icon name="down" /></summary>
              <div className="cfg-options-body">
                {current.provider === 'claude' && current.claude?.configured && !current.claude.canResume && current.claude.status !== 'disabled' && <div className="cfg-option-row"><div><strong>暂停连接</strong><p>连接文件会保留，不影响 Claude Code 运行。</p></div><button className="cfg-secondary" disabled={busy || current.claude.busy} onClick={() => { void run(() => bridge.configurations.disable(current.id)).then(saved => { if (saved) requestAnimationFrame(() => statusHeadingRef.current?.focus({ preventScroll: true })); }); }}>暂停连接</button></div>}
                {current.connection?.canRemove && current.connection.receiving !== 'stopped' && <div className="cfg-option-row"><div><strong>暂停连接</strong><p>不影响 pi 运行，连接文件会保留。</p></div><button className="cfg-secondary" disabled={busy || current.connection.busy} onClick={() => void run(() => bridge.configurations.disable(current.id))}>{current.connection.receiving === 'unknown' ? '尝试暂停连接' : '暂停连接'}</button></div>}
                {current.provider !== 'claude' && <section className="cfg-position-check" aria-label="配置检查"><div className="cfg-option-row"><div><strong>位置检查<span className={`cfg-position-result cfg-result-${current.availability}`}>{labels[current.availability]}</span></strong><p>{current.availability === 'unsupported' ? '这类 Agent 暂时还不能连接，你可以先保留这条记录。' : '检查这个文件夹是否可以使用，不会建立连接。'}</p></div><button className="cfg-secondary" disabled={busy || current.provider !== 'pi'} onClick={() => void run(() => bridge.configurations.inspect(current.id))}>检查位置</button></div>
                  {current.inspection?.findings.length ? <div className="cfg-position-findings">{current.inspection.findings.map(finding => <p key={finding}>{findingSummary[finding]}</p>)}<details className="cfg-operation-help"><summary>查看检查结果</summary>{current.inspection.findings.map(finding => <p key={finding}>{findingText[finding]}</p>)}</details></div> : null}
                </section>}
                <div className="cfg-option-row"><div><strong>更换位置</strong><p>{current.connection?.deployedPath || current.claude?.configured || current.id === 'legacy-pi' ? '请先移除此连接，再重新添加新的文件夹。' : '选择这个 Agent 使用的其他配置文件夹。'}</p></div><button className="cfg-secondary" aria-label="更换位置" aria-describedby="config-target-path" disabled={busy || !!current.connection?.deployedPath || current.claude?.configured || current.id === 'legacy-pi'} onClick={() => setManual(current)}>更换位置</button></div>
                <div className="cfg-detail-end"><div><strong>移除此连接</strong><span>不会删除 Agent 程序或你的文件</span></div><button className="cfg-delete" disabled={busy} aria-label="移除连接" onClick={() => setRemovalId(current.id)}><Icon name="trash" />移除</button></div>
              </div>
            </details></section> : <div className="cfg-empty"><Icon name="folder" /><h2 tabIndex={-1}>从第一个连接开始</h2><p>{state ? '自动扫描，或手动添加你的 Agent。' : '正在读取已保存的连接…'}</p></div>}
            {(error || scanError) && <p className="cfg-notice" role="alert">{error || scanError}</p>}
          </div></div>
      </> : <>
        <header className="cfg-subpage-head"><button className="cfg-text-button" onClick={cancelScan}><Icon name="left" />我的连接</button><span>自动扫描</span></header>
        <div className="cfg-content-scroll"><section className="cfg-discovery">{!scanning && <div className="cfg-discovery-heading"><div><h1 tabIndex={-1}>自动扫描</h1><p>查找本机的 pi 和 Claude Code。</p></div><button className="cfg-secondary" disabled={scanning || busy} onClick={() => void detect()}><Icon name="replay" />重新扫描</button></div>}
          {scanning ? <div className="cfg-scan-stage" role="status"><div className="cfg-radar" aria-hidden="true"><span className="cfg-radar-sweep" /><span className="cfg-radar-dot dot-one" /><span className="cfg-radar-dot dot-two" /><span className="cfg-radar-core"><Icon name="scan" /></span></div><h1 tabIndex={-1}>正在查找安装</h1><p>查找 pi 和 Claude Code，不读取会话或对话。</p><button className="cfg-secondary" onClick={cancelScan}>取消扫描</button></div> : <>
            <div className="cfg-results">{claudeScan && claudeScan.installations.length > 0 && <DetectedClaudeResult state={claudeScan} existing={!!existingClaude} busy={busy} onSelect={installationId => existingClaude ? (setSelected(existingClaude.id), setPage('agent')) : setSetupConsent({ provider: 'claude', installationId, targetPath: claudeScan.targetPath })} />}{automatic && <DetectedPiResult path={automatic.path} installations={detected} existing={!!existingDetected} busy={busy} onSelect={() => existingDetected ? (setSelected(existingDetected.id), setPage('agent')) : void prepareDetected()} />}
              {scan?.installations.filter(installation => installation.compatibility === 'unverified').map(installation => <div className="cfg-result" key={installation.id}><AgentMark record={{ provider: 'pi' }} /><div><strong>pi <span>{installation.version ?? '版本未确认'}</span></strong><code>{installation.path}</code><small>此版本暂不支持一键配置，兼容性尚未验证。</small></div></div>)}</div>
            {!scan?.installations.length && !claudeScan?.installations.length && <div className="cfg-empty"><Icon name="scan" /><h2>未找到安装</h2><p>可以手动选择已有配置位置。</p></div>}
            {claudeScan?.notice === 'cancelled' && <p className="cfg-notice" role="status">Claude 扫描已取消，可以重新扫描。</p>}
            {(scan?.scan === 'limited' || claudeScan?.scan === 'limited') && <p className="cfg-notice" role="status">扫描范围受限，结果可能不完整。可以重新扫描或手动选择配置位置。</p>}
            {automatic && <p className="cfg-discovery-note">{existingDetected ? '可以查看或管理已有连接。' : '先查看需要添加的文件，由你确认后再添加。'}<span>完成设置后，还需要让 pi 加载连接组件。</span></p>}
            <div className="cfg-discovery-manual"><div><strong>使用项目或自定义配置？</strong><p>选择已有配置文件夹，单独添加。</p></div><button className="cfg-text-button" disabled={busy} onClick={() => setManual(null)}>手动添加<Icon name="right" /></button></div>{(scanError || error) && <p role="alert">{scanError || error}</p>}
          </>}
        </section></div>
      </>}
    </article>
    {removing && visible && <RemoveConnectionDialog record={removing} busy={busy} error={error} onClose={() => setRemovalId(null)} onRemove={() => void run(() => bridge.configurations.remove(removing.id)).then(removed => { if (removed) { removedFocus.current = true; setRemovalId(null); setSelected(null); setPage('library'); } })} />}
    {manual !== undefined && visible && <ManualConnectionDialog existing={manual} records={records} bridge={bridge} run={run} busy={busy} error={error} onClose={() => setManual(undefined)} onSaved={id => { setManual(undefined); setSelected(id || null); setPage('agent'); }} />}
    {setupConsent && state && visible && <DetectedSetupDialog {...setupConsent} state={state} bridge={bridge} run={run} onCancelError={setScanError} onClose={() => setSetupConsent(null)} onPrepared={id => { setSetupConsent(null); setSelected(id); setPage('agent'); }} />}
  </section>;
}

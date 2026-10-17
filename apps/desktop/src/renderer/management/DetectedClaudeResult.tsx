import { useState } from 'react';
import type { ClaudeDiscoveryState } from '../../shared/claude-discovery.js';
import { Icon } from './components/icons.js';

const kinds = { npm: 'npm', native: '官方安装', homebrew: 'Homebrew', unknown: '安装方式未确认' };
export function DetectedClaudeResult({ state, existing, busy, onSelect }: {
  state: ClaudeDiscoveryState; existing: boolean; busy: boolean; onSelect(id: string): void;
}) {
  const verified = state.installations.filter(value => value.compatibility === 'verified');
  const [selectedId, setSelectedId] = useState('');
  const selected = verified.find(value => value.id === selectedId) ?? verified[0];
  return <article className="cfg-detected" aria-label="Claude Code 默认配置">
    <div className="cfg-detected-header">
      <span className="menu-agent-mark agent-claude" aria-hidden="true"><Icon name="flower" /></span>
      <div className="cfg-detected-identity"><h2>Claude Code</h2><code title={state.targetPath}>{state.targetPath}</code></div>
      <button className="cfg-primary" disabled={busy || (!existing && !selected)} onClick={() => onSelect(selected?.id ?? '')}>{existing ? '查看配置' : '一键配置'}<Icon name={existing ? 'right' : 'plus'} /></button>
    </div>
    {!existing && verified.length > 1 && <label className="cfg-installation-choice">连接哪个安装？<select aria-label="Claude 程序安装" value={selected?.id} onChange={event => setSelectedId(event.target.value)}>{verified.map(value => <option key={value.id} value={value.id}>{kinds[value.kind]} {value.version} · {value.entryPath}</option>)}</select></label>}
    {!verified.length && !existing && <p className="cfg-discovery-note">已找到 Claude，当前安装的兼容性尚未确认。</p>}
    <details className="cfg-installations"><summary><span>程序安装详情</span><span className="cfg-installation-count">{state.installations.length} 处安装</span><Icon name="down" /></summary>
      <ul aria-label="检测到的 Claude 安装">{state.installations.map(value => <li key={value.id}><span className="cfg-installation-version">{kinds[value.kind]} {value.version}<small>{value.compatibility === 'unverified' ? '待验证' : '可接入'}</small></span><code title={value.entryPath}>{value.entryPath}</code></li>)}</ul>
    </details>
  </article>;
}

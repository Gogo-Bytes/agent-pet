import { useRef } from 'react';
import type { AgentConfiguration } from '../../shared/configurations.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';

export function RemoveConnectionDialog({ record, busy, error, onClose, onRemove }: {
  record: AgentConfiguration; busy: boolean; error: string; onClose(): void; onRemove(): void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <Dialog label="移除此连接？" initialFocusRef={cancel} className="cfg-page cfg-dialog cfg-compact-dialog cfg-removal" onClose={() => { if (!busy) onClose(); }}>
    <div className="cfg-dialog-shell">
      <header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="trash" /></span><h2>移除此连接？</h2></div><button className="cfg-dialog-close" aria-label="取消移除" disabled={busy} onClick={onClose}><Icon name="close" /></button></header>
      <section className="cfg-dialog-body">
        <div className="cfg-remove-target"><strong>{record.name}</strong><code title={record.targetPath}>{record.targetPath}</code></div>
        {record.connection?.deployedPath && <code className="cfg-file-path">{record.connection.deployedPath}</code>}
        {error && <p role="alert">{error}</p>}
      </section>
      <footer className="cfg-dialog-footer"><div><button ref={cancel} className="cfg-secondary" disabled={busy} onClick={onClose}>取消</button><button className="cfg-primary cfg-danger" disabled={busy} onClick={onRemove}>{busy ? '正在移除…' : '确认移除'}</button></div></footer>
    </div>
  </Dialog>;
}

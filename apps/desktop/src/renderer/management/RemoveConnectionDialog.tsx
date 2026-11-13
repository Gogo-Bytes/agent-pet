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
        <p>{record.provider === 'codex' ? '撤回 Agent Pet 添加且未改动的通知，保留其他设置和连接文件，不影响 Codex 运行。' : record.provider === 'claude' ? record.claude?.mode === 'normal-start' ? '撤回 Agent Pet 添加的 hook，保留其他设置和连接文件，不影响 Claude Code 运行。' : '停止观察并移除此记录，保留连接文件，不影响 Claude Code 运行。' : record.connection?.deployedPath ? '暂停连接并删除本应用添加且未改动的连接文件，保留其他文件，不影响 pi 运行。' : '仅移除此记录，不会删除 Agent 程序或你的文件。'}</p>
        {record.connection?.deployedPath && <>
          <p>正在运行的 pi 请在空闲时输入 <code>/reload</code> 或正常退出。</p>
          <details className="cfg-operation-help"><summary>待移除文件</summary><code className="cfg-file-path" title={record.connection.deployedPath}>{record.connection.deployedPath}</code><p>被修改或来源不明的文件会保留。移除未完成时保留记录，可稍后重试。</p></details>
        </>}
        {error && <p role="alert">{error}</p>}
      </section>
      <footer className="cfg-dialog-footer"><div><button ref={cancel} className="cfg-secondary" disabled={busy} onClick={onClose}>取消</button><button className="cfg-primary cfg-danger" disabled={busy} onClick={onRemove}>{busy ? '正在移除…' : '确认移除'}</button></div></footer>
    </div>
  </Dialog>;
}

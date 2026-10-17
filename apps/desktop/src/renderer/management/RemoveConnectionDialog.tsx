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
        <p>不会删除 Agent 程序或你的文件。</p>
        <details className="cfg-operation-help"><summary>会移除什么？</summary><p>{record.provider === 'claude' ? record.claude?.mode === 'normal-start' ? '停用观察并移除 Agent Pet 中的这条记录，只撤回本应用添加的 hook 条目，保留原有 hooks、其他设置和用户文件。正在运行的 Claude Code 不受影响；已加载的配置仍可能调用观察助手，因此私有运行材料会保留。' : '只移除 Agent Pet 中的这条记录并停用观察。运行材料会保留，不影响正在运行的 Claude Code；不会删除用户文件。' : <>移除 Agent Pet 中的这条记录。{record.connection?.deployedPath ? '会先暂停连接，再删除本应用添加且未改动的连接文件：' : '没有本应用保存的连接文件需要清理。'}</>}</p>
          {record.connection?.deployedPath && <><code className="cfg-file-path" title={record.connection.deployedPath}>{record.connection.deployedPath}</code><p>被修改过或不能确认来源的文件会保留。移除未完成时，记录也会保留，方便重试。正在运行的 pi 不会自动重新加载；请在空闲时输入 /reload 或正常退出。</p></>}
        </details>
        {error && <p role="alert">{error}</p>}
      </section>
      <footer className="cfg-dialog-footer"><div><button ref={cancel} className="cfg-secondary" disabled={busy} onClick={onClose}>取消</button><button className="cfg-primary cfg-danger" disabled={busy} onClick={onRemove}>{busy ? '正在移除…' : '确认移除'}</button></div></footer>
    </div>
  </Dialog>;
}

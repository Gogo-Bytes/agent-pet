import { useEffect, useRef, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsState, ConfigurationsApi } from '../../shared/configurations.js';
import { connectionNoticeText, connectionSummary, findingSummary } from './connection-copy.js';
import { Dialog } from './components/Dialog.js';
import { FileChanges } from './components/FileChanges.js';
import { Icon } from './components/icons.js';

export function DeploymentControls({ record, api, run, busy, visible = true, statusHeadingRef, error }: { error: string; statusHeadingRef: RefObject<HTMLHeadingElement | null>; visible?: boolean; record: AgentConfiguration; api: ConfigurationsApi; run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>; busy: boolean }) {
  const state = record.connection;
  const preview = state?.preview;
  const summary = connectionSummary(state);
  const disabled = busy || !!state?.busy;
  const configureButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const previousPreview = useRef<string | null>(null);
  const pendingFocus = useRef<'preview' | 'return' | null>(null);
  const previewId = preview?.id ?? null;
  useEffect(() => {
    if (previewId !== previousPreview.current) {
      pendingFocus.current = previewId ? 'preview' : previousPreview.current ? 'return' : null;
      previousPreview.current = previewId;
    }
    const target = pendingFocus.current === 'preview' ? cancelButton.current
      : pendingFocus.current === 'return' ? configureButton.current ?? statusHeadingRef.current : null;
    if (!visible || !target || (target instanceof HTMLButtonElement && target.disabled)) return;
    const frame = requestAnimationFrame(() => {
      if (target.isConnected) { target.focus(); if (document.activeElement === target) pendingFocus.current = null; }
    });
    return () => cancelAnimationFrame(frame);
  }, [previewId, visible, disabled]);
  const resumeLabel = state?.saved === 'disabled' ? '继续连接' : '重新连接';
  const routineNotice = !state || ['none', 'resume-required', 'disabled', 'stopped'].includes(state.notice);
  const quiet = summary.tone === 'online' && routineNotice && !state?.canResume && !state?.canConfigure && !preview;
  return <div className="cfg-deployment" data-quiet={quiet}>
    <div className={`cfg-connection-status cfg-connection-${summary.tone}`}>
      {state?.canResume && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.resume(record.id))}>{disabled ? '请稍候…' : resumeLabel}</button>}
      {state?.canConfigure && !preview && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>设置连接</button>}
    </div>
    {state?.receiving === 'active' && state.status !== 'connected' && <code>/reload</code>}
    {state && !preview && !routineNotice && <div className="cfg-connection-notice" role={summary.tone === 'error' ? 'alert' : 'status'}><p>{connectionNoticeText[state.notice]}</p></div>}
    {preview && visible && <Dialog label={`连接 ${record.name}`} className="cfg-page cfg-dialog cfg-compact-dialog" initialFocusRef={cancelButton} onClose={() => { if (!disabled) void run(() => api.cancel(record.id)); }}>
      <div className="cfg-dialog-shell">
        <header className="cfg-dialog-header"><h2>{preview.action === 'create' ? `连接「${record.name}」` : preview.findings[0] ? findingSummary[preview.findings[0]] : '暂时无法连接'}</h2><button className="cfg-dialog-close" aria-label="取消连接设置" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}><Icon name="close" /></button></header>
        <section className="cfg-dialog-body">
          <FileChanges root={preview.target.path} paths={[...preview.createDirectories.map(path => `${path}/`), preview.path]} />
          {(error || (state && !routineNotice)) && <p role="alert">{error || (state && connectionNoticeText[state.notice])}</p>}
        </section>
        <footer className="cfg-dialog-footer"><div><button ref={cancelButton} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>{preview.action === 'create' ? '取消' : '返回'}</button>
          {preview.action === 'create' && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.confirm(record.id, preview.id))}>连接</button>}
        </div></footer>
      </div>
    </Dialog>}
  </div>;
}

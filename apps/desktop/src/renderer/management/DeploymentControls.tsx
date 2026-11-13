import { useEffect, useRef, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsState, ConfigurationsApi } from '../../shared/configurations.js';
import { type Finding, findingText } from '../../shared/pi-preflight.js';
import { connectionNoticeText, connectionSummary } from './connection-copy.js';
import { Dialog } from './components/Dialog.js';
import { FileChanges } from './components/FileChanges.js';
import { Icon } from './components/icons.js';

const previewProblems: Record<Finding, string> = {
  unsafe: '文件权限需要处理', unreadable: '无法读取配置', 'missing-target': '配置文件夹不存在',
  'root-entry': '暂不支持这个扩展入口', 'root-manifest': '暂不支持这个扩展入口',
  'manifest-unknown': '无法识别扩展设置', 'existing-extension': '已有同名文件',
  'ignore-unknown': '需要检查忽略规则', 'settings-unknown': '无法识别扩展设置',
  budget: '检查未完成', 'platform-unknown': '暂不支持这个系统',
};

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
      {routineNotice && !preview && summary.description && <p>{summary.description}</p>}
      {state?.canResume && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.resume(record.id))}>{disabled ? '请稍候…' : resumeLabel}</button>}
      {state?.canConfigure && !preview && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>设置连接</button>}
    </div>
    {state && !routineNotice && <div className="cfg-connection-notice" role={summary.tone === 'error' ? 'alert' : 'status'}><p>{connectionNoticeText[state.notice]}</p></div>}
    {state?.canConfigure && !preview && <details className="cfg-operation-help"><summary>访问范围</summary><p>检查配置文件夹及上级目录，读取 settings.json、extensions/package.json、扩展入口和忽略规则。不读取登录信息或对话；添加文件前会再次确认。</p></details>}
    {preview && visible && <Dialog label={`连接 ${record.name}`} className="cfg-page cfg-dialog cfg-compact-dialog" initialFocusRef={cancelButton} onClose={() => { if (!disabled) void run(() => api.cancel(record.id)); }}>
      <div className="cfg-dialog-shell">
        <header className="cfg-dialog-header"><h2>{preview.action === 'create' ? `连接「${record.name}」` : preview.findings[0] ? previewProblems[preview.findings[0]] : '暂时无法连接'}</h2><button className="cfg-dialog-close" aria-label="取消连接设置" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}><Icon name="close" /></button></header>
        <section className="cfg-dialog-body">
          <p>{preview.action === 'create' ? '新增以下扩展及所需文件夹，原有文件和 pi 设置不变。' : preview.findings.includes('existing-extension') ? '已有同名文件，未覆盖。请确认来源或选择其他位置。' : '未添加文件，请处理以下问题。'}</p>
          <FileChanges root={preview.target.path} paths={[...preview.createDirectories.map(path => `${path}/`), preview.path]} />
          {preview.action === 'create' && <p>pi 已在运行时，请在空闲时输入 <code>/reload</code>。</p>}
          <details className="cfg-operation-help"><summary>{preview.action === 'blocked' ? '原因与处理方式' : '改动明细'}</summary>
            {preview.findings.map(finding => <p key={finding}>{findingText[finding]}</p>)}
            {record.installation && preview.action === 'blocked' && preview.findings.some(value => ['unsafe', 'missing-target', 'unreadable'].includes(value)) && <p>首次使用 pi，请先打开一次；否则请检查文件夹权限或选择其他位置。</p>}
            <p>不会自动启动或重新加载 pi。需允许 pi 加载扩展，并信任配置文件夹和项目。重开 Agent Pet 后需重新连接。</p>
            <p>移除连接时，仅删除本应用添加且未改动的连接文件。</p>
          </details>
          {(error || (state && !routineNotice)) && <p role="alert">{error || (state && connectionNoticeText[state.notice])}</p>}
        </section>
        <footer className="cfg-dialog-footer"><div><button ref={cancelButton} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>{preview.action === 'create' ? '取消' : '返回'}</button>
          {preview.action === 'create' && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.confirm(record.id, preview.id))}>连接</button>}
        </div></footer>
      </div>
    </Dialog>}
  </div>;
}

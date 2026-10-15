import { useEffect, useRef } from 'react';
import type { AgentConfiguration, ConfigurationsState, ConfigurationsApi } from '../../shared/configurations.js';
import { type Finding, findingText } from '../../shared/pi-preflight.js';
import { connectionNoticeText, connectionSummary, findingSummary, noticeText } from './connection-copy.js';

const previewProblems: Record<Finding, string> = {
  unsafe: '文件权限需要处理', unreadable: '无法读取配置', 'missing-target': '配置文件夹不存在',
  'root-entry': '暂不支持这个扩展入口', 'root-manifest': '暂不支持这个扩展入口',
  'manifest-unknown': '无法识别扩展设置', 'existing-extension': '已有同名文件',
  'ignore-unknown': '需要检查忽略规则', 'settings-unknown': '无法识别扩展设置',
  budget: '检查未完成', 'platform-unknown': '暂不支持这个系统',
};

export function DeploymentControls({ record, api, run, busy, visible = true }: { visible?: boolean; record: AgentConfiguration; api: ConfigurationsApi; run: (action: () => Promise<ConfigurationsState>) => Promise<boolean>; busy: boolean }) {
  const state = record.connection;
  const summary = connectionSummary(state);
  const disabled = busy || !!state?.busy;
  const configureButton = useRef<HTMLButtonElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  const previousPreview = useRef<string | null>(null);
  const previewId = state?.preview?.id ?? null;
  const pendingFocus = useRef<'preview' | 'return' | null>(null);
  useEffect(() => {
    if (previewId !== previousPreview.current) {
      pendingFocus.current = previewId ? 'preview' : previousPreview.current ? 'return' : null;
      previousPreview.current = previewId;
    }
    const target = pendingFocus.current === 'preview' ? previewHeading.current
      : pendingFocus.current === 'return' ? configureButton.current ?? statusHeading.current : null;
    if (!visible || !target || (target instanceof HTMLButtonElement && target.disabled)) return;
    const frame = requestAnimationFrame(() => {
      if (target.isConnected) { target.focus(); if (document.activeElement === target) pendingFocus.current = null; }
    });
    return () => cancelAnimationFrame(frame);
  }, [previewId, visible, disabled]);
  const resumeLabel = state?.saved === 'disabled' ? '继续连接' : '重新连接';
  const routineNotice = !state || ['none', 'resume-required', 'disabled', 'stopped'].includes(state.notice);
  return <div className="cfg-deployment">
    <div className={`cfg-connection-status cfg-connection-${summary.tone}`}>
      <div><h3 ref={statusHeading} tabIndex={-1}><span className="cfg-status-dot" aria-hidden="true" />{summary.title}</h3><p className={summary.tone === 'online' || state?.preview ? 'cfg-sr-only' : undefined}>{summary.description}</p></div>
      {state?.canResume && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.resume(record.id))}>{disabled ? '请稍候…' : resumeLabel}</button>}
      {state?.canConfigure && !state.preview && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.preview(record.id))}>设置连接</button>}
    </div>
    {state && !routineNotice && <div className="cfg-connection-notice" role={summary.tone === 'error' ? 'alert' : 'status'}><p>{connectionNoticeText[state.notice]}</p><details><summary>查看详细原因</summary><p>{noticeText[state.notice]}</p></details></div>}
    {state?.canConfigure && !state.preview && <>
      <details className="cfg-operation-help"><summary>会读取或改动哪些内容？</summary><p>会检查所选文件夹及上级文件夹的安全性，读取 settings.json、extensions/package.json，并检查扩展入口和忽略规则。不读取登录信息、会话或对话。确认后只新建 extensions/agent-pet.ts，不更改你原有的 pi 设置，不会自动启动或重新加载 pi。</p><p>连接所需的信息保存在本应用的专用文件夹。退出后会保留，下次打开需要你点击重新连接。</p></details>
    </>}
    {state?.preview && <section className={`cfg-preview ${state.preview.action === 'blocked' ? 'is-blocked' : ''}`} aria-label="连接设置预览">
      <h3 ref={previewHeading} tabIndex={-1}>{state.preview.action === 'create' ? '确认连接设置' : state.preview.findings[0] ? previewProblems[state.preview.findings[0]] : '暂时无法连接'}</h3>
      <p>{state.preview.action === 'create' ? '只添加以下文件，不覆盖文件或改动 pi 设置。' : state.preview.findings.includes('existing-extension') ? '原文件会保留，请先确认它的来源。' : '本次没有添加文件。请查看原因后处理，或返回选择其他位置。'}</p>
      <code className="cfg-file-path" title={state.preview.path}>{state.preview.path}</code>
      {state.preview.createDirectories.length > 0 && <div className="cfg-preview-directories"><span>还会新建文件夹：</span>{state.preview.createDirectories.map(path => <code className="cfg-file-path" key={path} title={path}>{path}</code>)}</div>}
      {state.preview.action === 'create' && <p className="cfg-preview-hint">pi 已在运行？连接后请在空闲时输入 /reload。</p>}
      <details className="cfg-operation-help"><summary>{state.preview.action === 'blocked' ? '查看原因与处理方式' : '文件与权限说明'}</summary>
        {state.preview.findings.map(finding => <div key={finding}><p>{findingSummary[finding]}</p><p>{findingText[finding]}</p></div>)}
        {record.installation && state.preview.action === 'blocked' && state.preview.findings.some(value => ['unsafe', 'missing-target', 'unreadable'].includes(value)) && <p>首次使用 pi，请先打开一次。否则请检查文件夹权限，或返回后选择其他文件夹。</p>}
        <p>只会新建上述连接文件（权限 0600），连接信息保存在本应用专用目录（目录 0700、文件 0600）。退出后保留，下次打开不会自动连接。如果原临时目录丢失，或连接地址被占用，会停止连接并提示你，不会自动删除或重建。</p>
        <p>连接后，请在方便时打开 pi；已经运行的 pi 需要在空闲时输入 /reload。pi 需要允许加载扩展，并信任你使用的配置文件夹和项目。Agent Pet 不会替你更改这些设置，也不会自动启动或重新加载 pi。</p>
      </details>
      <div className="cfg-form-actions"><button className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>{state.preview.action === 'create' ? '取消' : '返回详情'}</button>
        {state.preview.action === 'create' && <button className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.confirm(record.id, state.preview!.id))}>确认并连接</button>}</div>
    </section>}

  </div>;
}

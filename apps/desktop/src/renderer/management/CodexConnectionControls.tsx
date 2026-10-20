import { useEffect, useRef, type RefObject } from 'react';
import type { AgentConfiguration, ConfigurationsApi, ConfigurationsState } from '../../shared/configurations.js';
import type { CodexConnectionState } from '../../shared/codex-connection.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';
export function codexConnectionSummary(state: CodexConnectionState | undefined): { title: string; description: string; tone: 'online' | 'waiting' | 'quiet' | 'error' } {
  switch (state?.status) {
    case 'observing': return { title: '已连接', description: '已收到 Codex 会话，宠物可以跟随支持的操作作出反应。', tone: 'online' };
    case 'waiting': return { title: '等待首次任务', description: '照常打开 codex，在 /hooks 中审核 Agent Pet 通知，再发送任务。仅打开空会话暂不会显示宠物。', tone: 'waiting' };
    case 'disabled': return { title: '已暂停', description: '不影响 Codex 运行，连接文件会保留。', tone: 'quiet' };
    case 'failed': return { title: '连接需要处理', description: '请查看提示，已有文件会保留。', tone: 'error' };
    default: return { title: '还未连接', description: '设置一次后，照常使用 Codex CLI。', tone: 'quiet' };
  }
}
const notices: Record<CodexConnectionState['notice'], string> = {
  none: '', 'unsupported-installation': '请选择已验证的 Codex standalone 0.163.0 程序。其他安装方式仍待验证。',
  'preview-failed': '无法检查连接设置。请检查文件夹权限后重试。', 'stale-preview': '预览已失效，请重新查看设置。',
  'save-failed': '未能确认保存成功。已有文件会保留，请重新打开应用后检查。',
  'saved-invalid': '原连接文件发生变化或无法读取。请检查原文件，本应用不会覆盖。',
  retained: '未能完整移除连接。原文件和记录已保留，请检查是否修改过通知条目。',
};
export function CodexConnectionControls({ record, api, run, busy, visible, error, statusHeadingRef }: {
  record: AgentConfiguration; api: ConfigurationsApi; run(action: () => Promise<ConfigurationsState>): Promise<boolean>;
  busy: boolean; visible: boolean; error: string; statusHeadingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const state = record.codex, preview = state?.preview;
  const summary = codexConnectionSummary(state), disabled = busy || !!state?.busy;
  const cancelButton = useRef<HTMLButtonElement>(null), configureButton = useRef<HTMLButtonElement>(null);
  const previousPreview = useRef<string | null>(null), pendingFocus = useRef<'preview' | 'return' | null>(null);
  useEffect(() => {
    const id = preview?.id ?? null;
    if (id !== previousPreview.current) pendingFocus.current = id ? 'preview' : previousPreview.current ? 'return' : null;
    previousPreview.current = id;
    if (!visible || disabled || !pendingFocus.current) return;
    const target = pendingFocus.current === 'preview' ? cancelButton.current : configureButton.current ?? statusHeadingRef.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => { if (target.isConnected) { target.focus(); pendingFocus.current = null; } });
    return () => cancelAnimationFrame(frame);
  }, [preview?.id, visible, disabled, statusHeadingRef]);
  // Revoking a transient preview never stops an already configured Codex session.
  const apiRef = useRef(api); apiRef.current = api;
  const latestState = useRef(state); latestState.current = state;
  const openingPreview = useRef(false);
  const revokePreview = () => {
    if (openingPreview.current || latestState.current?.preview || latestState.current?.busy)
      void apiRef.current.cancel(record.id).catch(() => {});
  };
  useEffect(() => { if (!visible) revokePreview(); }, [visible, record.id]);
  useEffect(() => () => { revokePreview(); }, [record.id]);
  const openPreview = () => {
    openingPreview.current = true;
    void run(() => api.preview(record.id)).finally(() => { openingPreview.current = false; });
  };
  return <div className="cfg-deployment" data-quiet={state?.status === 'observing'}>
    <div className={`cfg-connection-status cfg-connection-${summary.tone}`}><p className={state?.status === 'observing' ? 'cfg-sr-only' : undefined}>{summary.description}</p>
      {state?.canConfigure && !preview && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={openPreview}>设置连接</button>}
      {state?.canResume && <button ref={configureButton} className="cfg-primary" disabled={disabled} onClick={() => void run(() => api.resume(record.id))}>{state.status === 'disabled' ? '继续连接' : '重新连接'}</button>}
    </div>
    {state && state.notice !== 'none' && <p role="alert">{notices[state.notice]}</p>}
    <details className="cfg-operation-help"><summary>连接说明</summary><p>首次设置后，请在 Codex 的 /hooks 中审核这 10 条 Agent Pet 通知。通知只报告会话和支持的动作，不读取对话文件，也不会替你执行或审批任务。</p><p>需要首条任务才会收到连接。会话结束以 Codex 通知为准，关闭一个终端窗口可能不会立即结束后台会话。Codex 桌面端尚未支持。</p><p>不会改动 config.toml、登录信息或原有 hooks。暂停只停止接收，移除仅撤回本应用的条目。</p></details>
    {visible && preview && <Dialog label="连接 Codex CLI" className="cfg-page cfg-dialog" initialFocusRef={cancelButton} onClose={() => { if (!disabled) void run(() => api.cancel(record.id)); }}>
      <div className="cfg-dialog-shell"><header className="cfg-dialog-header"><div className="cfg-dialog-title"><span className="cfg-dialog-emblem"><Icon name="command" /></span><h2>连接 Codex CLI</h2></div><button className="cfg-dialog-close" aria-label="关闭连接预览" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}><Icon name="close" /></button></header>
        <section className="cfg-dialog-body"><h3>{preview.canApply ? '添加 Agent Pet 通知' : '暂时无法添加'}</h3><code className="cfg-file-path" title={preview.path}>{preview.path}</code><p>{preview.canApply ? '只追加 10 条通知，保留原有内容。' : '请检查文件格式、权限、禁用设置或已有条目。原文件会保留。'}</p>
          <p>之后在 Codex 的 /hooks 中审核通知，发送首条任务后连接。</p>
          <details className="cfg-operation-help"><summary>文件与保存说明</summary><p>将检查所选程序和配置文件夹的安全信息，仅修改上方 hooks.json。在应用私有目录保存原文件备份、通知助手和连接记录。不会改 config.toml、登录信息或 shell 设置，不启动 Codex。应用下次启动会恢复接收；主动暂停的连接保持暂停。</p><code className="cfg-file-path" title={preview.executable}>{preview.executable}</code><p>被修改或来源不明的文件会保留。移除只撤回本产品条目，不恢复整份旧备份。</p></details>
          {error && <p role="alert">{error}</p>}
        </section><footer className="cfg-dialog-footer"><div><button ref={cancelButton} className="cfg-secondary" disabled={disabled} onClick={() => void run(() => api.cancel(record.id))}>取消</button><button className="cfg-primary" disabled={disabled || !preview.canApply} onClick={() => void run(() => api.confirm(record.id, preview.id))}>{disabled ? '正在保存…' : '确认并设置连接'}</button></div></footer>
      </div>
    </Dialog>}
  </div>;
}

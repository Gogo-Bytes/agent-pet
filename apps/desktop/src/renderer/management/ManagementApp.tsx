import { useEffect, useRef, useState } from 'react';
import { Cat, Cable, Settings } from 'lucide-react';
import type { ManagementState } from '../../shared/preferences.js';
import { PiPreflightPanel } from './PiPreflightPanel.js';
import { PetSizeControl } from './PetSizeControl.js';

export function ManagementApp({ bridge = window.management }: { bridge?: Window['management'] }) {
  const [page, setPage] = useState('Agent 连接');
  const [state, setState] = useState<ManagementState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sizeSaving, setSizeSaving] = useState(false);
  const mounted = useRef(false);
  const pushRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let pushed = false;
    const off = bridge.subscribe(value => { pushed = true; if (active) { pushRevision.current++; setState(value); } });
    void bridge.getState().then(value => { if (active && !pushed) setState(value); }, () => { if (active) setError('无法读取应用设置，请重试。'); });
    return () => { active = false; mounted.current = false; off(); };
  }, [bridge]);
  async function change(action: () => Promise<ManagementState>) {
    if (sizeSaving) return;
    setBusy(true); setError('');
    const revision = pushRevision.current;
    try { const confirmed = await action(); if (mounted.current && pushRevision.current === revision) setState(confirmed); }
    catch { setError('操作失败，未确认更改。请重试。'); }
    finally { setBusy(false); }
  }
  async function resize(petSize: number) {
    const revision = pushRevision.current;
    const confirmed = await bridge.updatePreferences({ petSize });
    if (!mounted.current) return null;
    if (pushRevision.current === revision) setState(confirmed);
    // Main publishes even failed writes before replying; still stop failed commit queues.
    return confirmed.preferenceError;
  }
  return <div className="management-shell">
    <aside><h1>Agent Pet</h1><nav aria-label="管理导航">
      {([['Agent 连接', Cable], ['宠物', Cat], ['设置', Settings]] as const).map(([name, Icon]) =>
        <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => setPage(name)}><Icon size={19} aria-hidden="true" />{name}</button>)}
    </nav><p className="sidebar-note">macOS 预览版 · P2a</p></aside>
    <main><h2>{page}</h2>
      <p className="muted">关闭此窗口后，宠物与已配置的开发桥接继续运行。可从菜单栏重新打开；退出请使用“退出 Agent Pet”。</p>
      {error && <p role="alert">{error}</p>}
      {!state && error && <button disabled={busy || sizeSaving} onClick={() => { void change(() => bridge.getState()); }}>重新读取设置</button>}
      {page !== '宠物' && state?.preferenceError && <p role="alert">{state.preferenceError}</p>}
      {/* Retain in-flight preflight ownership while another page is presented. */}
      <div hidden={page !== 'Agent 连接'}>
        <section><h3>让宠物关注你的工作</h3><p>只读观察 Session 名称和状态，不读取对话正文，也不控制 Agent。</p></section>
        <PiPreflightPanel api={bridge.piPreflight} />
        <section><h3>其他 Agent</h3><p>Codex 和 Claude Code 接入尚不支持。</p></section>
      </div>
      <div hidden={page !== '宠物'}>
        <section><h3>当前宠物 · starter.glb</h3><p>沿用应用内置模型。当前没有其他形象或模型导入功能。</p><p className="muted">直接在桌面查看宠物；管理窗口不运行第二个 3D 预览。</p></section>
        <section><h3>显示与尺寸</h3>{state ? <fieldset>
          <label className="toggle"><input type="checkbox" disabled={busy || sizeSaving} checked={state.preferences.petVisible} onChange={event => { void change(() => bridge.updatePreferences({ petVisible: event.target.checked })); }} />显示宠物</label>
          <PetSizeControl confirmedSize={state.preferences.petSize} preferenceError={state.preferenceError}
            disabled={busy} visible={page === '宠物'} save={resize} onSavingChange={setSizeSaving} />
        </fieldset> : <p>正在读取偏好…</p>}</section>
      </div>
      {page === '设置' && <>
        <section><h3>启动</h3>{state ? <>
          <label className="toggle"><input type="checkbox" disabled={busy || sizeSaving || !state.login.supported} checked={state.login.enabled} onChange={event => { void change(() => bridge.setLogin(event.target.checked)); }} />登录时启动 Agent Pet</label>
          <p>默认关闭，不会在启动应用时自动注册登录项。</p>
          {!state.login.supported && <p className="muted">仅打包后的 macOS 应用支持。开发模式不会将 Electron 加入登录项。</p>}
          {state.login.error && <p role="alert">{state.login.error}</p>}
        </> : <p>正在读取设置…</p>}</section>
        <section><h3>关于与数据</h3><p>P2a 只读预检，非一键接入或正式发布验收。</p><p>偏好仅保存宠物显隐与大小。Session 未读状态不会跨重启保存。登录项以系统实际状态为准。</p><p>所有窗口隐藏后，仍可通过菜单栏、Dock 或重新打开应用找回管理窗口。</p></section>
      </>}
    </main>
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { Cat, Cable, Settings } from 'lucide-react';
import type { ManagementState } from '../../shared/preferences.js';

export function ManagementApp({ bridge = window.management }: { bridge?: Window['management'] }) {
  const [page, setPage] = useState('Agent 连接');
  const [state, setState] = useState<ManagementState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sizeDraft, setSizeDraft] = useState<number | null>(null);
  const [sizeSaving, setSizeSaving] = useState(false);
  const pendingSize = useRef<number | null>(null);
  const sizeRunning = useRef(false);
  const mounted = useRef(false);
  const pushRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let pushed = false;
    const off = bridge.subscribe(value => { pushed = true; if (active) { pushRevision.current++; setState(value); } });
    void bridge.getState().then(value => { if (active && !pushed) setState(value); }, () => { if (active) setError('无法读取应用设置，请重试。'); });
    return () => { active = false; mounted.current = false; pendingSize.current = null; off(); };
  }, [bridge]);
  async function change(action: () => Promise<ManagementState>) {
    if (sizeRunning.current) return;
    setBusy(true); setError('');
    const revision = pushRevision.current;
    try { const confirmed = await action(); if (mounted.current && pushRevision.current === revision) setState(confirmed); }
    catch { setError('操作失败，未确认更改。请重试。'); }
    finally { setBusy(false); }
  }
  async function resize(petSize: number) {
    if (busy && !sizeRunning.current) return;
    setSizeDraft(petSize);
    pendingSize.current = petSize;
    if (sizeRunning.current) return;
    sizeRunning.current = true;
    setSizeSaving(true); setBusy(true); setError('');
    try {
      // Keep the native range enabled; at most one write and one latest intent exist.
      while (mounted.current && pendingSize.current !== null) {
        const next = pendingSize.current;
        pendingSize.current = null;
        const revision = pushRevision.current;
        const confirmed = await bridge.updatePreferences({ petSize: next });
        if (!mounted.current) return;
        if (pushRevision.current === revision) setState(confirmed);
        if (confirmed.preferenceError) { pendingSize.current = null; break; }
      }
    } catch {
      pendingSize.current = null;
      if (mounted.current) setError('操作失败，未确认更改。请重试。');
    } finally {
      sizeRunning.current = false;
      if (mounted.current) { setSizeDraft(null); setSizeSaving(false); setBusy(false); }
    }
  }
  return <div className="management-shell">
    <aside><h1>Agent Pet</h1><nav aria-label="管理导航">
      {([['Agent 连接', Cable], ['宠物', Cat], ['设置', Settings]] as const).map(([name, Icon]) =>
        <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => setPage(name)}><Icon size={19} aria-hidden="true" />{name}</button>)}
    </nav><p className="sidebar-note">macOS 预览版基础 · P1</p></aside>
    <main><h2>{page}</h2>
      <p className="muted">关闭此窗口后，宠物与已配置的开发桥接继续运行。可从菜单栏重新打开；退出请使用“退出 Agent Pet”。</p>
      {error && <p role="alert">{error}</p>}
      {!state && error && <button disabled={busy} onClick={() => { void change(() => bridge.getState()); }}>重新读取设置</button>}
      {state?.preferenceError && <p role="alert">{state.preferenceError}</p>}
      {page === 'Agent 连接' && <>
        <section><h3>让宠物关注你的工作</h3><p>只读观察 Session 名称和状态，不读取对话正文，也不控制 Agent。</p></section>
        <section><h3>pi</h3><span className="badge">一键接入尚未实现 · P2 计划</span>
          <p>P1 仅提供桌面管理基础，不检测本机安装，也不安装或修改 pi 扩展。</p>
          <p>现有开发环境配置的 pi 桥接保持原有行为。本页不查询该连接，不表示已配置、在线或离线；实际 Session 仍在宠物气泡中呈现。</p>
          <p className="muted">打开原 Session 窗口目前不受支持。</p>
        </section><section><h3>其他 Agent</h3><p>Codex 和 Claude Code 接入尚不支持。</p></section>
      </>}
      {page === '宠物' && <>
        <section><h3>当前宠物 · starter.glb</h3><p>沿用应用内置模型。当前没有其他形象或模型导入功能。</p><p className="muted">直接在桌面查看宠物；管理窗口不运行第二个 3D 预览。</p></section>
        <section><h3>显示与尺寸</h3>{state ? <fieldset>
          <label className="toggle"><input type="checkbox" disabled={busy} checked={state.preferences.petVisible} onChange={event => { void change(() => bridge.updatePreferences({ petVisible: event.target.checked })); }} />显示宠物</label>
          <label className="size-label">宠物大小 <output>{sizeDraft ?? state.preferences.petSize} DIP</output>
            <input aria-label="宠物大小" type="range" min="80" max="600" step="1" disabled={busy && !sizeSaving} value={sizeDraft ?? state.preferences.petSize} onChange={event => { void resize(Number(event.target.value)); }} />
            {sizeSaving && <span role="status">正在保存尺寸…</span>}
          </label><p className="muted">与宠物工具栏缩放同步保存；较小屏幕会按可用空间限制实际尺寸。</p>
        </fieldset> : <p>正在读取偏好…</p>}</section>
      </>}
      {page === '设置' && <>
        <section><h3>启动</h3>{state ? <>
          <label className="toggle"><input type="checkbox" disabled={busy || !state.login.supported} checked={state.login.enabled} onChange={event => { void change(() => bridge.setLogin(event.target.checked)); }} />登录时启动 Agent Pet</label>
          <p>默认关闭，不会在启动应用时自动注册登录项。</p>
          {!state.login.supported && <p className="muted">仅打包后的 macOS 应用支持。开发模式不会将 Electron 加入登录项。</p>}
          {state.login.error && <p role="alert">{state.login.error}</p>}
        </> : <p>正在读取设置…</p>}</section>
        <section><h3>关于与数据</h3><p>P1 桌面管理基础，非一键接入或正式发布验收。</p><p>偏好仅保存宠物显隐与大小。Session 未读状态不会跨重启保存。登录项以系统实际状态为准。</p><p>所有窗口隐藏后，仍可通过菜单栏、Dock 或重新打开应用找回管理窗口。</p></section>
      </>}
    </main>
  </div>;
}

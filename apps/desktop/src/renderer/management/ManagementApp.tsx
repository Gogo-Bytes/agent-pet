import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { defaultPreferences, type ManagementState, type PreferencePatch } from '../../shared/preferences.js';
import type { ConfigurationsState } from '../../shared/configurations.js';
import { createManagementStore, type ManagementBridge } from './management-store.js';
import { CompanionScene } from './CompanionScene.js';
import { PetsView } from './PetsView.js';
import { ConnectionsView } from './ConnectionsView.js';
import { SettingsView } from './SettingsView.js';
import { Icon } from './components/icons.js';
import { projectHomePets } from './home-projection.js';

const pages = [['home', 'home', '首页'], ['pets', 'pet', '宠物'], ['connections', 'link', '连接'], ['settings', 'settings', '设置']] as const;
const notices: Record<ConfigurationsState['notice'], string> = {
  none: '', invalid: '输入无效，请检查名称和位置。', duplicate: '这个配置已添加，请选择其他位置。',
  'not-found': '配置已移除，请返回列表。', busy: '前一操作尚未完成，请稍后重试。',
  'save-failed': '配置保存失败，未确认更改。请检查应用数据目录权限与可用空间后重试。',
  'saved-invalid': '保存记录无法安全读取，已停止操作。请保留原文件，查看桌面说明中的恢复边界。',
  'withdraw-first': '请先选择性撤回并移除此配置，再添加新位置。', retained: '撤回未完成，配置与受保护文件已保留。返回详情查看原因，再重试或保留。',
  unsupported: '此 Agent 接入尚未支持。', limit: '已达到配置数量上限，请移除不需要的配置。',
};
export function ManagementApp({ bridge = window.management }: { bridge?: ManagementBridge }) {
  const store = useMemo(() => createManagementStore(bridge), [bridge]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [page, setPage] = useState('home');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [clips, setClips] = useState<string[]>([]);
  const [action, setAction] = useState('Idle');
  const [replay, setReplay] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const onClips = useCallback((values: string[]) => setClips(previous => previous.join() === values.join() ? previous : values), []);
  const preferences = snapshot.state?.preferences ?? defaultPreferences;
  const pets = useMemo(() => snapshot.configurations ? projectHomePets(snapshot.configurations, snapshot.sessions, preferences.petName) : [], [snapshot.configurations, snapshot.sessions, preferences.petName]);
  async function change<T extends ManagementState | ConfigurationsState>(work: () => Promise<T>, login = false): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError('');
    try {
      const value = await work();
      const failure = 'notice' in value ? notices[value.notice] : value.preferenceError || (login ? value.login.error : '') || '';
      if (mounted.current) setError(failure);
      return !failure;
    } catch { if (mounted.current) setError('请求失败，未确认操作结果。请重新读取状态后重试。'); return false; }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  const configError = error || (snapshot.configurations ? notices[snapshot.configurations.notice] : '');
  return <div className="management-page"><main className="game-shell" data-reduced={preferences.reduced}>
    <header className="game-topbar"><button className="game-logo" onClick={() => setPage('home')}><span>✦</span>Agent Pet</button><span className="feature-page-label">{page === 'home' ? '' : pages.find(value => value[0] === page)?.[2]}</span></header>
    {(snapshot.error || snapshot.state?.preferenceError) && <p className="app-alert" role="alert">{snapshot.error || snapshot.state?.preferenceError}<button onClick={() => void store.retry()}>重新读取</button></p>}
    <div className="game-content">
      <CompanionScene pets={pets} page={page} preferences={preferences} action={action} replay={replay} onClips={onClips}>
        <PetsView visible={page === 'pets'} records={snapshot.configurations?.records ?? []} name={preferences.petName} clips={clips} action={action} busy={busy} error={error}
          onName={petName => change(() => bridge.updatePreferences({ petName }))} onBind={(id, pet) => void change(() => bridge.configurations.bindPet(id, pet))}
          onAction={value => { setAction(value); setReplay(previous => previous + 1); }} />
      </CompanionScene>
      <ConnectionsView visible={page === 'connections'} state={snapshot.configurations} bridge={bridge} run={change} busy={busy || !!snapshot.configurations?.busy} error={configError} />
      <SettingsView visible={page === 'settings'} state={snapshot.state} busy={busy} error={error}
        onChange={(patch: PreferencePatch) => void change(() => bridge.updatePreferences(patch))} onLogin={enabled => void change(() => bridge.setLogin(enabled), true)}
        onReset={async () => {
          const { schemaVersion: _, petName: __, ...defaults } = defaultPreferences;
          const saved = await change(() => bridge.updatePreferences(defaults));
          if (!saved) throw new Error('偏好恢复失败，请检查应用数据目录并重试。');
          if (snapshot.state?.login.supported) { const login = await change(() => bridge.setLogin(false), true); if (!login) throw new Error('偏好已恢复，但系统登录项未恢复，请重试。'); }
        }} onOpenProject={() => void bridge.openProject().catch(() => setError('无法打开项目链接。'))} />
    </div>
    <footer className="game-dock"><nav className="dock-tabs" role="tablist" aria-label="页面导航" style={{ '--dock-index': pages.findIndex(value => value[0] === page) } as CSSProperties}>{<span className="dock-tab-slider" aria-hidden="true" />}{pages.map(([id, icon, label]) => <button key={id} className={`dock-tab ${page === id ? 'active' : ''}`} role="tab" aria-selected={page === id} onClick={() => { setPage(id); setError(''); }}><Icon name={icon} /><small>{label}</small></button>)}</nav></footer>
  </main></div>;
}

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

const emptyPetAssets = { version: 1 as const, records: [] };
const pages = [['home', 'home', '首页'], ['pets', 'pet', '宠物'], ['connections', 'link', '连接'], ['settings', 'settings', '设置']] as const;
const notices: Record<ConfigurationsState['notice'], string> = {
  none: '', invalid: '输入无效，请检查名称和位置。', duplicate: '这个配置已添加，请选择其他位置。',
  'not-found': '配置已移除，请返回列表。', busy: '前一操作尚未完成，请稍后重试。',
  'save-failed': '配置保存失败，未确认更改。请检查应用数据目录权限与可用空间后重试。',
  'saved-invalid': '无法读取保存的连接信息，已停止操作。请保留原文件，重新打开应用后检查。',
  'withdraw-first': '请先移除此连接，再重新添加新的文件夹。', retained: '连接还没有移除，记录和文件都已保留。请返回详情查看原因后重试。',
  unsupported: '此 Agent 接入尚未支持。', limit: '已达到配置数量上限，请移除不需要的配置。',
};
export function ManagementApp({ bridge = window.management }: { bridge?: ManagementBridge }) {
  const store = useMemo(() => createManagementStore(bridge), [bridge]);
  const petAssets = useMemo(() => bridge.petAssets ?? { getState: async () => ({ version: 1 as const, records: [] }), getModel: async () => null, getAvatar: async () => null, choose: async () => ({ ok: false as const, reason: 'not-supported' }), confirm: async () => ({ version: 1 as const, records: [] }), remove: async () => ({ version: 1 as const, records: [] }), cancel: async () => {}, subscribe: () => () => {} }, [bridge]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [page, setPage] = useState('home');
  const [error, setError] = useState('');
  const [windowError, setWindowError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const [clips, setClips] = useState<string[]>([]);
  const [action, setAction] = useState('Idle');
  const [replay, setReplay] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState('starter');
  const [assetModels, setAssetModels] = useState<Record<string, string>>({});
  const [modelReadFailed, setModelReadFailed] = useState(false);
  const [assetAvatars, setAssetAvatars] = useState<Record<string, string>>({});
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const onClips = useCallback((values: string[]) => setClips(previous => previous.join() === values.join() ? previous : values), []);
  const preferences = snapshot.state?.preferences ?? defaultPreferences;
  const assets = snapshot.petAssets ?? emptyPetAssets;
  useEffect(() => {
    const preferred = preferences.petAssetId;
    if (assets.records.some(asset => asset.id === preferred) && preferred !== selectedAssetId) setSelectedAssetId(preferred);
  }, [assets.records, preferences.petAssetId, selectedAssetId]);
  const selectedAsset = assets.records.find(asset => asset.id === selectedAssetId) ?? assets.records[0];
  const assetAnimations = useMemo(() => Object.fromEntries(assets.records.filter(asset => asset.manifest.animations).map(asset => [asset.id, asset.manifest.animations!])), [assets.records]);
  const pets = useMemo(() => snapshot.configurations ? projectHomePets(snapshot.configurations, snapshot.sessions, preferences.petName) : [], [snapshot.configurations, snapshot.sessions, preferences.petName]);
  const modelAssetIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedAsset?.source === 'imported') ids.add(selectedAsset.id);
    pets.forEach(pet => { if (pet.assetId && pet.assetId !== 'starter') ids.add(pet.assetId); });
    return [...ids];
  }, [pets, selectedAsset?.id, selectedAsset?.source]);
  const importedAssetIds = useMemo(() => assets.records.filter(asset => asset.source === 'imported').map(asset => asset.id), [assets.records]);
  useEffect(() => {
    if (!bridge.petAssets) return;
    let active = true; const urls: string[] = []; const entries: [string, string][] = [];
    setAssetModels({}); setModelReadFailed(false);
    void (async () => {
      for (const id of modelAssetIds) {
        if (!active) return;
        try {
          const bytes = await petAssets.getModel(id);
          if (!bytes) { if (active) setModelReadFailed(true); continue; }
          const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
          const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'model/gltf-binary' }));
          if (!active) { URL.revokeObjectURL(url); return; }
          urls.push(url); entries.push([id, url]);
        } catch { if (active) setModelReadFailed(true); }
      }
      if (active) setAssetModels(Object.fromEntries(entries));
    })();
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [modelAssetIds, petAssets, bridge.petAssets]);
  useEffect(() => {
    if (!bridge.petAssets) return;
    let active = true; const urls: string[] = []; const entries: [string, string][] = [];
    setAssetAvatars({});
    void (async () => {
      for (const id of importedAssetIds) {
        if (!active) return;
        try {
          const asset = assets.records.find(value => value.id === id);
          const bytes = await petAssets.getAvatar(id);
          if (!bytes || !asset) continue;
          const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
          const extension = asset.manifest.avatar?.toLowerCase().split('.').pop();
          const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
          const url = URL.createObjectURL(new Blob([copy.buffer], { type }));
          if (!active) { URL.revokeObjectURL(url); return; }
          urls.push(url); entries.push([id, url]);
        } catch { /* one invalid asset must not block the others */ }
      }
      if (active) setAssetAvatars(Object.fromEntries(entries));
    })();
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [importedAssetIds, assets.records, petAssets, bridge.petAssets]);
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
  return <div className="management-page"><main className="game-shell" data-reduced={preferences.reduced} data-native-chrome={bridge.nativeWindowControls}>
    <header className="game-topbar">
      <button className="game-logo" onClick={() => setPage('home')}><span>✦</span>Agent Pet</button>
      <div className="game-titlebar-actions">
        <span className="feature-page-label">{page === 'home' ? '' : pages.find(value => value[0] === page)?.[2]}</span>
        {!bridge.nativeWindowControls && <div className="window-controls" role="group" aria-label="窗口操作">
          {([['minimize', '最小化窗口', 'minus'], ['toggle-maximize', '最大化或还原窗口', 'maximize'], ['close', '关闭窗口', 'close']] as const).map(([action, label, icon]) =>
            <button key={action} className={`window-control window-control-${action}`} aria-label={label} title={label}
              onClick={() => { setWindowError(''); void bridge.windowAction(action).catch(() => setWindowError('窗口操作失败，请重试。')); }}><Icon name={icon} size={16} /></button>)}
        </div>}
      </div>
    </header>
    {(windowError || snapshot.error || snapshot.state?.preferenceError) && <p className="app-alert" role="alert">{windowError || snapshot.error || snapshot.state?.preferenceError}<button onClick={() => void store.retry()}>重新读取</button></p>}
    {modelReadFailed && <p className="app-alert" role="alert">部分宠物模型文件无法读取，暂时显示内置宠物。请重新选择或检查收藏文件。</p>}
    <div className="game-content">
      <CompanionScene pets={pets} page={page} preferences={preferences} action={action} replay={replay} modelUrl={selectedAsset?.source === 'imported' ? assetModels[selectedAsset.id] : undefined} animations={selectedAsset?.manifest.animations} modelUrls={assetModels} assetAnimations={assetAnimations} onClips={onClips}>
        <PetsView visible={page === 'pets'} records={snapshot.configurations?.records ?? []} assets={assets} importApi={petAssets} avatarUrls={assetAvatars} selectedAssetId={selectedAsset?.id ?? 'starter'} name={preferences.petName} clips={clips} action={action} busy={busy} error={error} reduced={preferences.reduced}
          onName={petName => change(() => bridge.updatePreferences({ petName }))} onSelectAsset={id => { setSelectedAssetId(id); void change(() => bridge.updatePreferences({ petAssetId: id })); }} onBind={(id, pet) => void change(() => bridge.configurations.bindPet(id, pet))}
          onRemoveAsset={async id => { try { await petAssets.remove(id); if (selectedAssetId === id) setSelectedAssetId('starter'); setWindowError(''); return true; } catch (cause) { setWindowError(cause instanceof Error ? cause.message : '宠物删除失败，请先解除绑定。'); return false; } }}
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

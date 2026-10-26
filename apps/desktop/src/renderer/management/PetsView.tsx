import { useEffect, useRef, useState } from 'react';
import type { AgentConfiguration, PetBinding } from '../../shared/configurations.js';
import type { PetAssetsApi, PetAssetsState } from '../../shared/pet-assets.js';
import { PetImportControl } from './PetImportControl.js';
import { GlassAction, GlassButton, GlassSurface, GlassToolbar } from '../shared/ui/Glass.js';
import { Icon, type IconName } from './components/icons.js';
import { Dialog } from './components/Dialog.js';
import { GlassDrawer } from './components/GlassDrawer.js';
import { petActions } from './ScenePet.js';
import { normalizePetAction } from '@agent-pet/pet-runtime';
import { providerLabels } from './home-projection.js';

export function PetsView({ visible, records, assets, importApi, avatarUrls, selectedAssetId, onSelectAsset, name, clips, action, busy, onName, onBind, onAction, onRemoveAsset, error, reduced }: {
  visible: boolean; records: AgentConfiguration[]; assets: PetAssetsState; importApi: PetAssetsApi; avatarUrls: Record<string, string>; selectedAssetId: string; onSelectAsset: (id: string) => void; name: string; clips: string[]; action: string; busy: boolean;
  onName: (value: string) => Promise<boolean>; onBind: (id: string, pet: PetBinding | null) => void;
  onAction: (value: string) => void; onRemoveAsset: (id: string) => Promise<boolean>;
  error: string; reduced: boolean;
}) {
  const [panel, setPanel] = useState<'pets' | 'agents' | null>(null);
  const [motionsOpen, setMotionsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const motionTrigger = useRef<HTMLButtonElement>(null);
  const nameTrigger = useRef<HTMLButtonElement>(null);
  const nameAttempt = useRef(0);
  useEffect(() => () => { nameAttempt.current++; }, []);
  function endNameEdit() {
    nameAttempt.current++;
    setEditing(false);
    requestAnimationFrame(() => nameTrigger.current?.focus({ preventScroll: true }));
  }
  async function saveName() {
    const value = draft.trim();
    if (!value) { setNotice('名称不能为空。'); return; }
    const attempt = ++nameAttempt.current;
    try {
      const saved = await onName(value);
      if (attempt !== nameAttempt.current) return;
      if (saved) { setNotice(''); endNameEdit(); }
    } catch { if (attempt === nameAttempt.current) setNotice('名称保存失败，请重试。'); }
  }
  const motions = petActions.filter(value => clips.some(clip => normalizePetAction(clip) === value.id));
  const normalizedAction = normalizePetAction(action);
  const boundRecords = records.filter(record => record.pet?.assetId === selectedAssetId);
  const selectedIndex = Math.max(0, assets.records.findIndex(asset => asset.id === selectedAssetId));
  function cycleAsset(delta: number) {
    if (assets.records.length < 2) { setNotice('当前收藏只有一只宠物。'); return; }
    onSelectAsset(assets.records[(selectedIndex + delta + assets.records.length) % assets.records.length]!.id);
  }
  const providerIcon = (provider: AgentConfiguration['provider']): IconName => provider === 'codex' ? 'command' : provider === 'claude' ? 'flower' : provider === 'pi' ? 'pi' : 'code';
  useEffect(() => { if (!visible) { setPanel(null); setMotionsOpen(false); setEditing(false); } }, [visible]);
  useEffect(() => {
    if (!motionsOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setMotionsOpen(false); motionTrigger.current?.focus(); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [motionsOpen]);
  function openPanel(value: 'pets' | 'agents') { setPanel(value); setMotionsOpen(false); setQuery(''); }
  return <>
    <div className="pet-identity"><span className="identity-agent">我的宠物</span>
      {editing ? <form className="pet-rename" onSubmit={event => { event.preventDefault(); if (!busy) void saveName(); }}>
        <input autoFocus aria-label="宠物名称" value={draft} disabled={busy} maxLength={40} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); endNameEdit(); } }} />
        <button disabled={busy || !draft.trim()}>保存</button><button type="button" onClick={endNameEdit}>取消</button>
      </form> : <h1 aria-label={name}><button ref={nameTrigger} className="pet-name-edit" aria-label="修改宠物名称" title={name + ' · 点击修改名称'} disabled={busy}
        onClick={() => { setDraft(name); setNotice(''); setEditing(true); }}>{name}</button></h1>}
      <div className={`pet-binding-tags${boundRecords.length > 5 ? ' is-collapsed' : ''}`} aria-label="使用这个宠物的 Agent">
        {boundRecords.map(record => <GlassSurface as="span" className="pet-binding-tag" key={record.id} title={providerLabels[record.provider]}>
          <i><Icon name={providerIcon(record.provider)} size={16} /></i><span>{providerLabels[record.provider]}</span><button disabled={busy} aria-label={`解除 ${providerLabels[record.provider]} 连接`} onClick={() => onBind(record.id, null)}><Icon name="close" /></button>
        </GlassSurface>)}
        <button className="pet-tag-add flat-icon-button" aria-label="配置使用此宠物的 Agent" onClick={() => openPanel('agents')}><Icon name="plus" /></button>
      </div>
    </div>
    <GlassToolbar className="pet-cycle" aria-label="宠物切换"><GlassAction iconOnly aria-label="上一个宠物" onClick={() => cycleAsset(-1)}><Icon name="left" /></GlassAction>
      <GlassAction className="pet-grid-open" aria-label="打开宠物收藏" onClick={() => openPanel('pets')}><Icon name="grid" /><small>{assets.records.length ? `${selectedIndex + 1} / ${assets.records.length}` : '0 / 0'}</small></GlassAction>
      <GlassAction iconOnly aria-label="下一个宠物" onClick={() => cycleAsset(1)}><Icon name="right" /></GlassAction></GlassToolbar>
    <div className="pet-animation-picker"><GlassToolbar className="pet-animation-toolbar" aria-label="动画预览"><GlassAction iconOnly disabled={!motions.length} aria-label="重新播放当前动画" onClick={() => onAction(action)}><Icon name="replay" /></GlassAction>
      <button ref={motionTrigger} className="glass-action" disabled={!motions.length} aria-label="选择动画" aria-expanded={motionsOpen} aria-controls="motion-palette" onClick={() => setMotionsOpen(value => !value)}><Icon name="play" />{motions.find(value => value.id === normalizePetAction(action))?.label ?? (motions.length ? '选择动作' : '静态展示')}<Icon name={motionsOpen ? 'up' : 'down'} /></button></GlassToolbar>
      {motionsOpen && <GlassSurface material="panel" as="section" className="motion-palette" id="motion-palette" aria-label="选择动画"><header><strong>动作</strong><small>{motions.length}</small></header>
        <label className="surface-search glass-inset"><Icon name="search" /><input aria-label="搜索动画" value={query} placeholder="搜索动作" onChange={event => setQuery(event.target.value)} /></label>
        <div className="motion-list">{motions.filter(value => value.label.includes(query)).map(value => <button className="glass-choice" key={value.id} aria-pressed={normalizedAction === value.id} onClick={() => onAction(value.id)}><span>{value.label}</span><Icon name={normalizedAction === value.id ? 'check' : 'play'} /></button>)}</div>
      </GlassSurface>}
    </div>
    {(notice || error) && <p className="pet-notice" role={error ? 'alert' : 'status'}>{error || notice}</p>}
    {panel === 'pets' && <GlassDrawer label="宠物收藏" reduced={reduced} onClose={() => setPanel(null)}>
      <label className="collection-search glass-inset"><Icon name="search" /><input autoFocus aria-label="搜索宠物" placeholder="搜索宠物" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="pet-avatar-grid">{assets.records.filter(asset => asset.manifest.id === 'starter' ? name.includes(query) : asset.manifest.id.includes(query)).map(asset =>
        <div className="pet-card" key={asset.id}>
          <button type="button" className="pet-card-select" aria-pressed={asset.id === selectedAssetId} onClick={() => { onSelectAsset(asset.id); setNotice(asset.id === 'starter' ? '正在使用内置 starter.glb。' : '已切换到导入宠物。'); }}><span className="pet-card-icon">{avatarUrls[asset.id] ? <img src={avatarUrls[asset.id]} alt="" /> : <Icon name="pet" size={28} />}</span><span className="avatar-name">{asset.id === 'starter' ? name : asset.manifest.id}</span></button>
          {asset.source === 'imported' && <button type="button" className="pet-card-delete" disabled={busy} aria-label={`删除 ${asset.manifest.id}`} onClick={() => { if (!busy && window.confirm(`删除宠物「${asset.manifest.id}」？`)) void onRemoveAsset(asset.id); }}><Icon name="close" size={16} /></button>}
        </div>)}
      </div>
      {!assets.records.some(asset => (asset.id === 'starter' ? name : asset.manifest.id).includes(query)) && <p className="collection-empty">没有找到宠物</p>}
      <PetImportControl api={importApi} disabled={busy} onImported={id => { onSelectAsset(id); setNotice('已加入收藏。'); }} />
      <p role="status">{notice}</p>
    </GlassDrawer>}
    {panel === 'agents' && <Dialog label="配置 Agent" className="pet-dialog" onClose={() => setPanel(null)}>
      <header><h2>配置给 Agent</h2><button type="button" aria-label="关闭弹窗" onClick={() => setPanel(null)}><Icon name="close" /></button></header>
      <div className="pet-agent-options">{records.map(record => <button key={record.id} disabled={busy} aria-pressed={record.pet?.assetId === selectedAssetId} onClick={() => onBind(record.id, record.pet?.assetId === selectedAssetId ? null : { assetId: selectedAssetId, name })}><Icon name="link" /><span>{record.name}<br /><small>{providerLabels[record.provider]}</small></span><small>{record.pet?.assetId === selectedAssetId ? '已配置 ✓' : record.pet ? '已配置其他宠物' : '未配置'}</small></button>)}</div>
      {!records.length && <p className="collection-empty">还没有配置。可以从底部「连接」添加。</p>}
      <button className="dialog-done" onClick={() => setPanel(null)}>完成</button>{error && <p role="alert">{error}</p>}
    </Dialog>}
  </>;
}

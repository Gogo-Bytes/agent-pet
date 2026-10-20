import { useEffect, useRef, useState } from 'react';
import type { AgentConfiguration, PetBinding } from '../../shared/configurations.js';
import { GlassAction, GlassButton, GlassSurface, GlassToolbar } from '../shared/ui/Glass.js';
import { Icon, type IconName } from './components/icons.js';
import { Dialog } from './components/Dialog.js';
import { GlassDrawer } from './components/GlassDrawer.js';
import { petActions } from './ScenePet.js';
import { normalizePetAction } from '@agent-pet/pet-runtime';
import { providerLabels } from './home-projection.js';

export function PetsView({ visible, records, name, clips, action, busy, onName, onBind, onAction, error, reduced }: {
  visible: boolean; records: AgentConfiguration[]; name: string; clips: string[]; action: string; busy: boolean;
  onName: (value: string) => Promise<boolean>; onBind: (id: string, pet: PetBinding | null) => void;
  onAction: (value: string) => void; error: string; reduced: boolean;
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
  const boundRecords = records.filter(record => record.pet?.assetId === 'starter');
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
    <GlassToolbar className="pet-cycle" aria-label="宠物切换"><GlassAction iconOnly aria-label="上一个宠物" onClick={() => setNotice('当前收藏只有一只内置宠物。')}><Icon name="left" /></GlassAction>
      <GlassAction className="pet-grid-open" aria-label="打开宠物收藏" onClick={() => openPanel('pets')}><Icon name="grid" /><small>1 / 1</small></GlassAction>
      <GlassAction iconOnly aria-label="下一个宠物" onClick={() => setNotice('当前收藏只有一只内置宠物。')}><Icon name="right" /></GlassAction></GlassToolbar>
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
      <div className="pet-avatar-grid">{name.includes(query) && <button aria-pressed="true" onClick={() => setNotice('正在使用内置 starter.glb。')}><span className="pet-card-icon"><Icon name="pet" size={28} /></span><span className="avatar-name">{name}</span></button>}
        <button className="avatar-add" aria-label="添加宠物（尚未支持）" onClick={() => setNotice('宠物包导入尚未实现，当前形象会保留。')}><span className="pet-card-icon"><Icon name="plus" /></span><span className="avatar-name">添加</span></button></div>
      {!name.includes(query) && <p className="collection-empty">没有找到宠物</p>}
      <p className="collection-empty">内置 starter.glb · 已接入实际模型与动作<br />宠物包导入尚未支持。</p><p role="status">{notice}</p>
    </GlassDrawer>}
    {panel === 'agents' && <Dialog label="配置 Agent" className="pet-dialog" onClose={() => setPanel(null)}>
      <header><h2>配置给 Agent</h2><button type="button" aria-label="关闭弹窗" onClick={() => setPanel(null)}><Icon name="close" /></button></header>
      <div className="pet-agent-options">{records.map(record => <button key={record.id} disabled={busy} aria-pressed={record.pet?.assetId === 'starter'} onClick={() => onBind(record.id, record.pet ? null : { assetId: 'starter', name })}><Icon name="link" /><span>{record.name}<br /><small>{providerLabels[record.provider]}</small></span><small>{record.pet ? '已配置 ✓' : '默认宠物'}</small></button>)}</div>
      {!records.length && <p className="collection-empty">还没有配置。可以从底部「连接」添加。</p>}
      <button className="dialog-done" onClick={() => setPanel(null)}>完成</button>{error && <p role="alert">{error}</p>}
    </Dialog>}
  </>;
}

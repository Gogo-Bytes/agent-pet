import { useEffect, useRef, useState } from 'react';
import type { AgentConfiguration, PetBinding } from '../../shared/configurations.js';
import { GlassAction, GlassButton, GlassSurface, GlassToolbar } from './components/glass.js';
import { Icon } from './components/icons.js';
import { Dialog } from './components/Dialog.js';
import { petActions } from './ScenePet.js';
import { providerLabels } from './home-projection.js';

export function PetsView({ visible, records, name, clips, action, busy, onName, onBind, onAction, error }: {
  visible: boolean; records: AgentConfiguration[]; name: string; clips: string[]; action: string; busy: boolean;
  onName: (value: string) => Promise<boolean>; onBind: (id: string, pet: PetBinding | null) => void;
  onAction: (value: string) => void; error: string;
}) {
  const [panel, setPanel] = useState<'pets' | 'agents' | null>(null);
  const [motionsOpen, setMotionsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const motionTrigger = useRef<HTMLButtonElement>(null);
  const motions = petActions.filter(value => clips.includes(value.id));
  useEffect(() => { if (!visible) { setPanel(null); setMotionsOpen(false); setEditing(false); } }, [visible]);
  useEffect(() => {
    if (!motionsOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setMotionsOpen(false); motionTrigger.current?.focus(); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [motionsOpen]);
  function openPanel(value: 'pets' | 'agents') { setPanel(value); setMotionsOpen(false); setQuery(''); }
  return <>
    <div className="pet-identity"><span className="identity-agent">我的宠物</span>
      {editing ? <form className="pet-rename" onSubmit={event => { event.preventDefault(); if (draft.trim()) void onName(draft.trim()).then(saved => { if (saved) setEditing(false); }); }}>
        <input autoFocus aria-label="宠物名称" value={draft} maxLength={40} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(false); } }} />
        <button disabled={busy || !draft.trim()}>保存</button><button type="button" onClick={() => setEditing(false)}>取消</button>
      </form> : <h1>{name}</h1>}
      <div className="pet-binding-tags" aria-label="使用这个宠物的 Agent">
        {records.filter(record => record.pet?.assetId === 'starter').map(record => <GlassSurface as="span" className="pet-binding-tag" key={record.id}>
          <i><Icon name="pi" size={16} /></i><span>{record.name}</span><button disabled={busy} aria-label={`解除 ${record.name} 的宠物绑定`} onClick={() => onBind(record.id, null)}><Icon name="close" /></button>
        </GlassSurface>)}
        <GlassButton className="pet-tag-add" aria-label="配置使用此宠物的 Agent" onClick={() => openPanel('agents')}><Icon name="plus" /></GlassButton>
      </div>
    </div>
    <GlassToolbar className="pet-cycle" aria-label="宠物切换"><GlassAction aria-label="上一个宠物" onClick={() => setNotice('当前收藏只有一只内置宠物。')}><Icon name="left" /></GlassAction>
      <GlassAction className="pet-grid-open" aria-label="打开宠物收藏" onClick={() => openPanel('pets')}><Icon name="grid" /><small>1 / 1</small></GlassAction>
      <GlassAction aria-label="下一个宠物" onClick={() => setNotice('当前收藏只有一只内置宠物。')}><Icon name="right" /></GlassAction></GlassToolbar>
    <div className="pet-animation-picker"><GlassToolbar className="pet-animation-toolbar" aria-label="动画预览"><GlassAction disabled={!motions.length} aria-label="重新播放当前动画" onClick={() => onAction(action)}><Icon name="replay" /></GlassAction>
      <button ref={motionTrigger} className="glass-action" disabled={!motions.length} aria-label="选择动画" aria-expanded={motionsOpen} aria-controls="motion-palette" onClick={() => setMotionsOpen(value => !value)}><Icon name="play" />{motions.find(value => value.id === action)?.label ?? '加载动作'}<Icon name={motionsOpen ? 'up' : 'down'} /></button></GlassToolbar>
      {motionsOpen && <GlassSurface material="panel" as="section" className="motion-palette" id="motion-palette" aria-label="选择动画"><header><strong>动作</strong><small>{motions.length}</small></header>
        <label className="surface-search glass-inset"><Icon name="search" /><input aria-label="搜索动画" value={query} placeholder="搜索动作" onChange={event => setQuery(event.target.value)} /></label>
        <div className="motion-list">{motions.filter(value => value.label.includes(query)).map(value => <button className="glass-choice" key={value.id} aria-pressed={action === value.id} onClick={() => onAction(value.id)}><span>{value.label}</span><Icon name={action === value.id ? 'check' : 'play'} /></button>)}</div>
      </GlassSurface>}
    </div>
    {(notice || error) && <p className="pet-notice" role={error ? 'alert' : 'status'}>{error || notice}</p>}
    {panel && <Dialog label={panel === 'pets' ? '宠物收藏' : '配置 Agent'} className={`pet-dialog ${panel === 'pets' ? 'pet-collection-drawer' : ''}`} onClose={() => setPanel(null)}>
      <header><h2>{panel === 'pets' ? '宠物收藏' : '配置给 Agent'}</h2><button aria-label="关闭弹窗" onClick={() => setPanel(null)}><Icon name="close" /></button></header>
      {panel === 'pets' ? <><label className="collection-search"><Icon name="search" /><input autoFocus aria-label="搜索宠物" placeholder="搜索宠物" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="pet-avatar-grid">{name.includes(query) && <button aria-pressed="true" onClick={() => setNotice('正在使用内置 starter.glb。')}><span className="pet-card-icon"><Icon name="pet" size={28} /></span><span className="avatar-name">{name}</span></button>}
          <button className="avatar-add" aria-label="添加宠物（尚未支持）" onClick={() => setNotice('宠物包导入尚未实现，当前形象会保留。')}><span className="pet-card-icon"><Icon name="plus" /></span><span className="avatar-name">添加</span></button></div>
        <button className="dialog-done" aria-label="修改宠物名称" onClick={() => { setDraft(name); setPanel(null); setEditing(true); }}>修改宠物名称</button><p className="collection-empty">内置 starter.glb · 已接入实际模型与动作<br />宠物包导入尚未支持。</p><p role="status">{notice}</p></> : <>
          <div className="pet-agent-options">{records.map(record => <button key={record.id} disabled={busy} aria-pressed={record.pet?.assetId === 'starter'} onClick={() => onBind(record.id, record.pet ? null : { assetId: 'starter', name })}><Icon name="link" /><span>{record.name}<br /><small>{providerLabels[record.provider]}</small></span><small>{record.pet ? '已配置 ✓' : '默认宠物'}</small></button>)}</div>
          {!records.length && <p className="collection-empty">还没有配置。可以从底部「连接」添加。</p>}<button className="dialog-done" onClick={() => setPanel(null)}>完成</button>{error && <p role="alert">{error}</p>}
        </>}
    </Dialog>}
  </>;
}

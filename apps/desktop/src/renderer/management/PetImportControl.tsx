import { useEffect, useRef, useState } from 'react';
import type { PetAssetsApi, PetImportPreview } from '../../shared/pet-assets.js';
import { GlassAction, GlassSurface } from '../shared/ui/Glass.js';
import { Dialog } from './components/Dialog.js';
import { Icon } from './components/icons.js';
import './pet-import.css';

const failures: Record<string, string> = {
  duplicate: '这个宠物已在收藏中。', limit: '宠物收藏已达到数量上限。',
  busy: '文件选择尚未结束，请稍后重试。', 'saved-invalid': '收藏记录无法读取，已停止导入。',
  'not-supported': '当前环境不支持宠物导入。',
};

export function PetImportControl({ api, disabled, onImported, onClose }: {
  api: PetAssetsApi; disabled: boolean; onImported: (id: string) => void; onClose: () => void;
}) {
  const [preview, setPreview] = useState<PetImportPreview | null>(null);
  const [busy, setBusy] = useState<'choosing' | 'confirming' | 'cancelling' | null>(null);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const working = useRef<typeof busy>(null);
  const pending = useRef<PetImportPreview | null>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const value = pending.current; pending.current = null;
      if (value) void api.cancel(value.token).catch(() => {});
    };
  }, [api]);
  useEffect(() => {
    if (!busy) (preview ? confirmButton : chooseButton).current?.focus({ preventScroll: true });
  }, [preview, busy]);
  async function close() {
    // A confirmed install cannot be undone by dismissing the dialog.
    if (working.current === 'confirming' || working.current === 'cancelling') return;
    if (pending.current) {
      working.current = 'cancelling'; setBusy('cancelling');
      try { await api.cancel(pending.current.token); pending.current = null; }
      catch { if (mounted.current) setError('取消未确认，请重试或关闭管理窗口以释放预览。'); return; }
      finally { working.current = null; if (mounted.current) setBusy(null); }
    }
    if (mounted.current) { mounted.current = false; onClose(); }
  }
  async function choose() {
    if (working.current || disabled) return;
    working.current = pending.current ? 'cancelling' : 'choosing'; setBusy(working.current); setError(''); setPreview(null);
    try {
      if (pending.current) { await api.cancel(pending.current.token); pending.current = null; }
      if (!mounted.current) return;
      working.current = 'choosing'; setBusy('choosing');
      const result = await api.choose();
      if (!mounted.current) {
        if (result.ok) await api.cancel(result.preview.token);
        return;
      }
      if (result.ok) { pending.current = result.preview; setPreview(result.preview); }
      else if (result.reason !== 'cancelled') setError(failures[result.reason] ?? '无法导入：请检查 pet.json、pet.glb 和文件大小，仅支持自包含模型。');
    } catch { if (mounted.current) setError('无法读取宠物文件夹，请重试。'); }
    finally { working.current = null; if (mounted.current) setBusy(null); }
  }
  async function confirm() {
    const value = pending.current;
    if (!value || working.current || disabled) return;
    working.current = 'confirming'; setBusy('confirming'); setError('');
    try {
      const state = await api.confirm(value.token);
      if (!state.records.some(asset => asset.id === value.manifest.id)) throw new Error('收藏中未找到导入结果，请重新读取状态。');
      if (mounted.current) { onImported(value.manifest.id); onClose(); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '导入未完成，文件可能已保留，请重新读取状态。');
    } finally {
      pending.current = null; working.current = null;
      if (mounted.current) { setBusy(null); setPreview(null); }
    }
  }
  const confirming = busy === 'confirming';
  const locked = confirming || busy === 'cancelling';
  return <Dialog label="导入宠物" className="pet-import-dialog" onClose={() => void close()} initialFocusRef={chooseButton}>
    <GlassSurface material="panel" className="pet-import-panel">
      <header><h2>导入宠物</h2><GlassAction iconOnly aria-label="关闭导入弹窗" disabled={locked} onClick={() => void close()}><Icon name="close" /></GlassAction></header>
      {preview ? <section className="pet-import-summary" aria-label="导入预览">
        <div className="pet-import-file"><Icon name="pet" size={32} /><div><h3>{preview.manifest.id}</h3>
          <span>pet.glb · {preview.modelBytes < 1024 * 1024 ? `${Math.ceil(preview.modelBytes / 1024)} KB` : `${(preview.modelBytes / 1024 / 1024).toFixed(1)} MB`}</span></div></div>
        <dl><dt>许可</dt><dd>{preview.manifest.license}</dd></dl>
        <button type="button" ref={chooseButton} className="pet-import-reselect" disabled={disabled || !!busy} onClick={() => void choose()}>重新选择</button>
      </section> : <div className="pet-import-choose">
        <Icon name="folder" size={40} />
        <p>选择包含 <strong>pet.json</strong> 和 <strong>pet.glb</strong> 的文件夹</p>
        <button type="button" ref={chooseButton} className="pet-import-primary" disabled={disabled || !!busy} onClick={() => void choose()}>{busy === 'choosing' ? '正在读取…' : '选择文件夹'}</button>
      </div>}
      <p className="pet-import-note">确认后复制到收藏，原文件不变。</p>
      {error && <p className="pet-import-error" role="alert">{error}</p>}
      {busy && <p className="pet-import-status" role="status">{confirming ? '正在导入，请稍候…' : busy === 'cancelling' ? '正在取消预览…' : '正在读取文件夹…'}</p>}
      <footer><GlassAction disabled={locked} onClick={() => void close()}>取消</GlassAction>
        {preview && <button type="button" ref={confirmButton} className="pet-import-primary" disabled={disabled || !!busy} onClick={() => void confirm()}>{confirming ? '正在导入…' : '确认导入'}</button>}</footer>
    </GlassSurface>
  </Dialog>;
}
